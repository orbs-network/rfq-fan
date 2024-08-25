import logger from "./logger";
import BN from "bignumber.js";
import { tryFetchErc20 } from "./w3";
import { CommonConfig } from "./config";
import { isNativeAddress, network } from "@defi.org/web3-candies";
import redis from "./redis";


type TokenPrice = {
  priceUsd: number;
  priceNative: number;
  timestamp: number;
};

const tokenCache: { [key: string]: TokenPrice } = {};
const PRICE_TTL = 1000 * 60 * 15; // 15 minutes
const PRICE_REDIS_TTL = 60 * 60; // 1 hour

export async function getTokenPrice(c: CommonConfig, tokenAddress: string): Promise<TokenPrice> {
  tokenAddress = tokenAddress.toLowerCase();
  const chainId = c.chainId;

  if (Number(chainId) === 137 && (tokenAddress === "0xc2132d05d31c914a87c6611c10748aeb04b58e8f" || tokenAddress === "0x2791bca1f2de4661ed88a30c99a7a9449aa84174")) {
    return {
      priceUsd: 1,
      priceNative: 1,
      timestamp: Date.now(),
    };
  }

  if (
    Number(chainId) === 56 &&
    (tokenAddress === "0xe9e7cea3dedca5984780bafc599bd69add087d56" ||
      tokenAddress === "0x55d398326f99059ff775485246999027b3197955" ||
      tokenAddress == "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d")
  ) {
    return {
      priceUsd: 1,
      priceNative: 1,
      timestamp: Date.now(),
    };
  }

  if (Number(chainId) === 8453 && tokenAddress === "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") {
    return {
      priceUsd: 1,
      priceNative: 1,
      timestamp: Date.now(),
    };
  }

  if (Number(chainId) === 250 && tokenAddress === "0x1B6382DBDEa11d97f24495C9A90b7c88469134a4") {
    return {
      priceUsd: 1,
      priceNative: 1,
      timestamp: Date.now(),
    };
  }

  if (Number(chainId) === 59144 && (tokenAddress === "0x176211869ca2b568f2a7d4ee941e073a821ee1ff" || tokenAddress === "0xa219439258ca9da29e9cc4ce5596924745e12b93")) {
    return {
      priceUsd: 1,
      priceNative: 1,
      timestamp: Date.now(),
    };
  }

  if (Number(chainId) === 1101 && (tokenAddress === "0x1e4a5963abfd975d8c9021ce480b42188849d41d" || tokenAddress === "0x37eaa0ef3549a5bb7d431be78a3d99bd360d19e5")) {
    return {
      priceUsd: 1,
      priceNative: 1,
      timestamp: Date.now(),
    };
  }

  const cachedPrice = await redis.get(_price2Key(c.chainId, tokenAddress));
  if (cachedPrice) {
    return JSON.parse(cachedPrice);
  }

  const price = await fetchLLMAPrice(tokenAddress, c.chainId);
  if (price.priceUsd) {
    redis.setX(_price2Key(c.chainId, tokenAddress), JSON.stringify(price), PRICE_REDIS_TTL);
    return price;
  }
  return getTokenPriceLegacy(c, tokenAddress);
}

export async function getTokenPriceLegacy(c: CommonConfig, tokenAddress: string): Promise<TokenPrice> {
  const chainId = c.chainId;

  const cachedPrice = await redis.get(_priceKey(chainId, tokenAddress));
  if (cachedPrice) {
    logger.verbose(`getTokenPrice ${tokenAddress} from redis`, cachedPrice);
    return JSON.parse(cachedPrice);
  }
  const price = await fetchPriceDexScreener(c, tokenAddress);

  if (price.priceUsd > 0) {
    tokenCache[tokenAddress] = price;
    redis.setX(_priceKey(chainId, tokenAddress), JSON.stringify(price), PRICE_REDIS_TTL);
  } else {
    logger.warn(`🚧 ⛔️ getTokenPrice: ${tokenAddress} price is 0`);
  }
  return price;
}

async function fetchPriceDexScreener(c: CommonConfig, tokenAddress: string): Promise<TokenPrice> {
  const chainId = c.chainId;
  try {
    if (tokenAddress === "0x0000000000000000000000000000000000000000") {
      tokenAddress = c.wToken.address;
    }
    logger.verbose(`fetchPrice: ${tokenAddress}`);
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}/`);
    const data = await res.json();
    if (!data.pairs[0]) {
      let paraPrice = await fetchPriceParaswap(chainId, tokenAddress, data.decimals);
      return {
        priceUsd: paraPrice.price,
        priceNative: paraPrice.price,
        timestamp: Date.now(),
      };
    }
    return {
      priceUsd: parseFloat(data.pairs[0].priceUsd),
      priceNative: parseFloat(data.pairs[0].priceNative),
      timestamp: Date.now(),
    };
  } catch (e) {
    logger.warn(`⛔️ ⛔️ ⛔️ fetchPrice: ${tokenAddress} failed ${e} fallback to paraswap cid:${chainId}`);
    const token = await tryFetchErc20(c, tokenAddress);
    let paraPrice = await fetchPriceParaswap(chainId, tokenAddress, token.decimals);
    return {
      priceUsd: paraPrice.price,
      priceNative: paraPrice.price,
      timestamp: Date.now(),
    };
  }
}

const chainIdToName: { [key: number]: string } = {
  56: "bsc",
  137: "polygon",
  8453: "base", // Assuming this ID is another identifier for Polygon as per the user's mapping
  250: "fantom",
  1: "ethereum",
  1101: "zkevm",
  81457: "blast",
  59144: "linea",
};

export async function fetchLLMAPrice(token: string, chainId: number | string) {
  const nullPrice = {
    priceUsd: 0,
    priceNative: 0,
    timestamp: Date.now(),
  };
  try {
    //@ts-ignore
    const chainName = chainIdToName[chainId] || "Unknown Chain";

    if (isNativeAddress(token)) {
      //@ts-ignore
      token = network(parseInt(chainId)).wToken.address;
    }
    const tokenAddressWithChainId = `${chainName}:${token}`;
    const url = `https://coins.llama.fi/prices/current/${tokenAddressWithChainId}`;
    const response = await fetch(url);
    if (!response.ok) {
      return nullPrice;
    }
    const data = await response.json();
    const coin = data.coins[tokenAddressWithChainId];
    return {
      priceUsd: coin.price,
      priceNative: coin.price,
      timestamp: Date.now(),
    };
  } catch (error) {
    logger.warn(`Price-Oracle ✨ : fetchLLMAPrice: ${chainId}:${token} failed`, error);
    return nullPrice;
  }
}

export async function fetchPriceParaswap(chainId: number, inToken: string, inTokenDecimals: number) {
  logger.warn(`fetchPriceParaswap: ${chainId}:${inToken}`);
  const n = network(chainId);
  const url = `https://apiv5.paraswap.io/prices/?srcToken=${inToken}&destToken=${n.wToken.address}&amount=${BN(
    `1e${inTokenDecimals}`,
  ).toString()}&srcDecimals=${inTokenDecimals}&destDecimals=${n.wToken.decimals}&side=SELL&network=${chainId}`;
  try {
    let req = await fetch(url);
    const res = await req.json();
    return {
      price: res.priceRoute?.srcUSD,
    };
  } catch (e) {
    return {
      price: 0,
    };
  }
}

function _priceKey(chainId: number, token: string) {
  return `price:${chainId}:${token}`;
}

function _price2Key(chainId: number, token: string) {
  return `price2:${chainId}:${token}`;
}