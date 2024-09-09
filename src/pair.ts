import logger from "./logger";
import BN from "bignumber.js";

export class Token {
  desc: string;
  address: string;
  decimals: number;

  constructor(desc: string, address: string, decimals: number) {
    this.desc = desc;
    this.address = address;
    this.decimals = decimals;
  }

  toTokenUint(value: string): string {
    const bigNumberValue = new BN(value);
    const multiplier = new BN(10).pow(this.decimals);
    const decimalValue = bigNumberValue.multipliedBy(multiplier).integerValue();
    return decimalValue.toString();
  }

  fromTokenUint(value: string): string {
    const bigNumberValue = new BN(value);
    const divisor = new BN(10).pow(this.decimals);
    const decimalValue = bigNumberValue.dividedBy(divisor);
    return decimalValue.toString();
  }
}

type TokenMap = {
  [symbol: string]: Token;
};

type NetworkTokens = {
  [networkId: string]: TokenMap;
};

const tokens: NetworkTokens = {
  "137": {
    USDT: new Token("USDT on polygon", "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", 6),
    MATIC: new Token("erc-20 address of WMATIC wrapped", "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", 18),
    ETH: new Token("Polygon Wrapped Ether", "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", 18),
    WETH: new Token("Polygon Wrapped Ether", "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", 18),
  },
  "56": {
    USDT: new Token("USDT on polygon", "0x55d398326f99059fF775485246999027B3197955", 6),
    BNB: new Token("bep-20 address of WBNB wrapped", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", 18),
    WBNB: new Token("bep-20 address of WBNB wrapped", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", 18),
  },
};

function splitPair(pair: string): [string, string] {
  const separators = ['-', '/', '_'];
  for (const separator of separators) {
    const index = pair.indexOf(separator);
    if (index !== -1) {
      const symbol1 = pair.slice(0, index);
      const symbol2 = pair.slice(index + 1);
      return [symbol1, symbol2];
    }
  }
  // If no valid separator is found, return null
  return ["", ""];
}

export function pair2tokens(chainId: string, pair: string, side: string, isbase: boolean): { inToken: Token; outToken: Token, inTokenIsA: boolean } | null {
  const chain = tokens[chainId]
  if (!chain) {
    logger.error(`chain ID isn't supported [${chainId}]`)
    return null
  }
  const [aToken, bToken] = splitPair(pair)
  if (!aToken) {
    logger.error(`failed to get aToken [${pair}]`)
    return null
  }
  if (!bToken) {
    logger.error(`failed to get bToken [${pair}]`)
    return null
  }

  const inTokenIsA = isbase == (side === "1")
  const inToken = inTokenIsA ? chain[aToken] : chain[bToken]
  const outToken = !inTokenIsA ? chain[aToken] : chain[bToken]

  return { inToken, outToken, inTokenIsA };
}

export function divStrUint(a: string, b: string): string {
  const bna = new BN(a);
  const bnb = new BN(b);
  return bna.dividedBy(bnb).toString()
}