import { fetchLLMAPrice } from "./price-oracle"
import { pair2tokens } from "./pair";
import logger from "./logger";
import { CommonConfig } from "./config";
import { dumpFetchAsCurl, rfqToKey } from "./utils";

export class Order {
  size: string;
  price: string;

  constructor(price: string, size: string) {
    this.size = size;
    this.price = price;
  }
}

type PairData = { ask: Order[], bid: Order[] };

// url -X POST -H 'Content-Type: application/json' -H 'X-API-KEY: ae8f903c-d2d6-4f5f-b24d-5765bd7495af' -d '{"dataStr":"{"network":"bsc","dex":"thena","filler":"0x120971cAc17B63FFdaDf862724925914b025A9E6","pathFinderParams\":{\"baselineOutAmount\":\"-1\"},\"orders\":[{\"id\":\"0x75FEA86Eb569E20b287850E1c0CD7D931B864191-0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c-0xc2132D05D31c914a87C6611C10748AEb04B58e8F-10000000000000000000\",\"srcToken\":\"0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c\",\"amountIn\":\"10000000000000000000\",\"dstToken\":\"0xc2132D05D31c914a87C6611C10748AEb04B58e8F\",\"user\":\"0x75FEA86Eb569E20b287850E1c0CD7D931B864191\"}]}","sessionId":"-1"}' 'https://clob-taker-manifold-d96876edee4d.herokuapp.com/quote'

const user_address = process.env.USER_ADDRESS || "0x0";
function formatCallBody(network: string, dex: string, srcToken: string, amountIn: string, dstToken: string, user: string): Object {
  const data: any = {
    network: network,
    dex: dex,
    filler: "0x120971cAc17B63FFdaDf862724925914b025A9E6",
    pathFinderParams: {
      baselineOutAmount: "-1"
    },
    orders: [{
      id: "1-2-3-4",
      srcToken: srcToken,
      amountIn: amountIn,
      dstToken: dstToken,
      user: user
    }]
  }
  return {
    "dataStr": JSON.stringify(data),
    "sessionId": "-1"
  }
}
//const manifold_url = 'https://clob-taker-manifold-d96876edee4d.herokuapp.com/quote'
const paraswap_url = 'https://clob-taker-paraswap-49d0d7fa5af9.herokuapp.com/quote'

//////////////////////////////////////////////
export class OrderBook {
  //////////////////////////////////////////////
  chainId: string
  config: CommonConfig
  data: {
    [key: string]: PairData
  }; // Properly typed as a dictionary of arrays of orders

  //////////////////////////////////////////////
  constructor(chainId: string, config: CommonConfig) {
    this.data = {}; // Initialize with an empty array for ETH-BTC orders
    this.chainId = chainId
    this.config = config

  }
  async callExchangeQuote(url: string, body: any): Promise<any | null> {
    const fetchObj = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": this.config.fillerApiKey,
      },
      body: JSON.stringify(body)
    }
    dumpFetchAsCurl(url, fetchObj)

    let req: Promise<Response>
    try {
      console.warn('fetch ------------------', fetch)
      req = fetch(url, fetchObj);
    } catch (e) {
      logger.warn(e);
      logger.warn(`failed to create req object`, e);
      return null
    }

    let res: Response;
    try {
      res = await req;
    } catch (e) {
      logger.warn(`fetch failed`, e);
      return {
        error: "fetch Failed",
        isError: true,
        noResults: true,
        errorDetails: e,
      };
    }

    const data = await res!.json();

    if (
      res!.status !== 200 ||
      !data ||
      data.error ||
      !data.result ||
      !data.result.length ||
      !data.result[0]?.success
    ) {
      logger.warn(`callExchangeQuote:: error`);
      let err = "generalError";

      try {
        err = data.error || data.result[0]?.errorMessage || "noResults";
      } catch (e) { }
      return {
        error: err,
        isError: true,
        noResults: data.result.length == 0,
        data: JSON.stringify(data),
      };
    }
    return data
  }
  //////////////////////////////////////////////  
  async quotePair(pair: string, isAsk: boolean, usdAmount: number): Promise<Order | null> {
    const tokenAddress = ""
    const sideAsk = isAsk ? "1" : "0"
    const pairDat = pair2tokens(this.chainId, pair, sideAsk, true)
    if (!pairDat) {
      logger.error(`pair not found ${this.chainId} ${pair} `)
      return null
    }

    // calculate amount for aToken 

    const inTokenPrice = await fetchLLMAPrice(pairDat.inToken.address, this.chainId);
    const inAmount = usdAmount / inTokenPrice.priceUsd

    const inAmountTokenUnit = pairDat.inToken.toTokenUint(inAmount.toString())
    //const body = formatCallBody('bsc', 'thena', pairDat.inToken.address, inAmountTokenUnit, pairDat.outToken.address, user_address)
    const body = formatCallBody('polygon', 'quickswap', pairDat.inToken.address, inAmountTokenUnit, pairDat.outToken.address, user_address)

    //const res = await this.callExchangeQuote(manifold_url, body)
    const res = await this.callExchangeQuote(paraswap_url, body)
    if (res != null) {
      const outAmountTokenUnit = res.result[0]?.route?.amountOut
      if (!outAmountTokenUnit) {
        logger.warn(`failed to get outAmount from [result[0]?.route?.amountOut]`)
        return null
      }
      const outAmount = parseFloat(pairDat.outToken.fromTokenUint(outAmountTokenUnit))
      const price = pairDat.inTokenIsA ? outAmount / inAmount : inAmount / outAmount
      const orderAmount = pairDat.inTokenIsA ? inAmount : outAmount;
      return new Order(price.toFixed(4), orderAmount.toFixed(4))
    }

    return null

  }
  //////////////////////////////////////////////
  async buildPair(pair: string) {
    let pairData = { ask: ([] as Order[]), bid: ([] as Order[]) }
    const isAsk = true
    const usdSums = [100, 500, 2500, 10000]

    // reverse sides here to mirror the caller
    // when we rfq target exchange 
    // rfq inToken is A token
    // target exchange outToken is B Token
    // hence exchange is BUYING A token
    // but we record it as ASK order  
    for (const usdSum of usdSums) {
      // ASK
      const ask = await this.quotePair(pair, !isAsk, usdSum)
      if (ask) {
        pairData.ask.push(ask)
      }
      // BID
      const bid = await this.quotePair(pair, isAsk, usdSum)
      if (bid) {
        pairData.bid.push(bid)
      }
    }
    this.data[pair] = pairData
  }
  //////////////////////////////////////////////
  async buildAll() {
    this.data = {}
    await this.buildPair("MATIC/USDT")
  }
  //////////////////////////////////////////////
  // getOrderBook /////////////////////////////////
  //prices: {
  //     [pairName]: {
  //         bids: [
  //             [basePrice: string, quoteAmount: string],
  //             ...,
  //         ],
  //         asks: [
  //             [basePrice: string, quoteAmount: string],
  //             ...,
  //         ]
  //     },
  //     ...
  // }
  get(): any {
    let prices: any = {}
    for (const pairName in this.data) {
      const pair: PairData = this.data[pairName]
      prices[pairName] = { bids: [], asks: [] }
      for (const bid of pair.bid) {
        prices[pairName].bids.push([bid.price, bid.size])
      }
      for (const ask of pair.ask) {
        prices[pairName].asks.push([ask.price, ask.size])
      }
    }

    return { prices }

  }


}
