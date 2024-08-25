import { Abi, Token, TokenData, contract, erc20abi, isNativeAddress, wrapToken } from "@defi.org/web3-candies";
import { CommonConfig } from "./config";
import web3 from "web3";
import logger from "./logger";


const web3Cache: { [key: string]: web3 } = {};

export function erc20<T>(name: string, address: string, decimals?: number, extendAbi?: Abi, w3?: web3): Token & T {
  const abi = extendAbi ? [...erc20abi, ...extendAbi] : erc20abi;
  address = web3.utils.toChecksumAddress(address);
  const result = contract<Token & T>(abi, address, undefined, w3);
  wrapToken(result, name, address, decimals, abi);
  return result;
}

async function fetchErc20(address: string, w3: web3): Promise<TokenData> {
  const e = erc20("", address, undefined, undefined, w3);
  const [decimals, symbol] = await Promise.all([e.decimals(), e.methods.symbol().call()]);
  return { address: web3.utils.toChecksumAddress(address), decimals, symbol };
}

const tokensCache: { [key: string]: TokenData } = {};

export async function tryFetchErc20(c: CommonConfig, address: string) {
  if (isNativeAddress(address)) {
    return c.native;
  }

  if (tokensCache[address]) {
    logger.verbose(`tryFetchErc20 ${address} from cache`);
    return tokensCache[address];
  }
  try {
    logger.verbose(`tryFetchErc20 ${address}`);
    let erc20 = await fetchErc20(address, await getWeb3(c));
    tokensCache[address] = erc20;
    return erc20;
  } catch (e) {
    logger.warn(`tryFetchErc20 throw ${address} chainId:${c.chainId} ${c.networkUrl} backup:${c.networkUrlBackup}`);
    return {
      address,
      symbol: "",
      decimals: 18,
    };
  }
}

export async function getWeb3(c: CommonConfig) {
  if (!web3Cache[c.chainId]) {
    logger.warn("init web3 for chainId", c.chainId);
    try {
      let w = new web3(c.networkUrl);
      if (!(await w.eth.net.isListening())) {
        logger.warn(`Failed to connect to ${c.networkUrl}, using fallback ${c.networkUrlBackup}`);
        w = new web3(c.networkUrlBackup);
      }
      monitorWeb3(c);
      web3Cache[c.chainId] = w;
    } catch (e) {
      console.log(e);
      logger.warn("init web3 failed, using backup url", c.networkUrlBackup);
      let w;
      try {
        w = new web3(c.networkUrlBackup);
      } catch (e) {
        logger.warn("init web3 failed, using backup url failed", c.networkUrlBackup);
      }
      monitorWeb3(c);
      if (w) {
        web3Cache[c.chainId] = w;
      }
    }
  }
  return web3Cache[c.chainId];
}

async function monitorWeb3(c: CommonConfig) {
  let w3 = web3Cache[c.chainId];
  if (!w3) {
    logger.warn(`Web3 is not initialized, chainId: ${c.chainId}, url: ${c.networkUrl}`);
    return;
  }
  const isListening = await w3.eth.net.isListening();
  if (!isListening) {
    try {
      w3 = new web3(c.networkUrlBackup);
      web3Cache[c.chainId] = w3;
      logger.warn(`Web3 is reconnected listening, chainId: ${c.chainId}, url: ${c.networkUrl}, using backup url: ${c.networkUrlBackup}`);
      const status = await w3.eth.net.isListening();
      logger.warn(`Web3 is reconnected listening, chainId: ${c.chainId}, url: ${c.networkUrl}, using backup url: ${c.networkUrlBackup}, status: ${status}`);
    } catch (e) {
      logger.warn(`Web3 is reconnected failed, chainId: ${c.chainId}, url: ${c.networkUrl}, using backup url: ${c.networkUrlBackup}`);
    }
  }
}