import { fetchLLMAPrice } from "./price-oracle"
import { pair2tokens } from "./pair";
import logger from "./logger";
import { CommonConfig } from "./config";
import { dumpFetchAsCurl, rfqToKey } from "./utils";
import { formatCallBody } from "./call-solver"
export class Order {
  size: string;
  price: string;

  constructor(price: string, size: string) {
    this.size = size;
    this.price = price;
  }
}

type PairData = { ask: Order[], bid: Order[] };
const manifold_url = 'https://clob-taker-manifold-d96876edee4d.herokuapp.com/quote'
// url -X POST -H 'Content-Type: application/json' -H 'X-API-KEY: ae8f903c-d2d6-4f5f-b24d-5765bd7495af' -d '{"dataStr":"{"network":"bsc","dex":"thena","filler":"0x120971cAc17B63FFdaDf862724925914b025A9E6","pathFinderParams\":{\"min_output_amount\":\"-1\"},\"orders\":[{\"id\":\"0x75FEA86Eb569E20b287850E1c0CD7D931B864191-0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c-0xc2132D05D31c914a87C6611C10748AEb04B58e8F-10000000000000000000\",\"srcToken\":\"0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c\",\"amountIn\":\"10000000000000000000\",\"dstToken\":\"0xc2132D05D31c914a87C6611C10748AEb04B58e8F\",\"user\":\"0x75FEA86Eb569E20b287850E1c0CD7D931B864191\"}]}","sessionId":"-1"}' 'https://clob-taker-manifold-d96876edee4d.herokuapp.com/quote'

const user_address = process.env.USER_ADDRESS || "0x0";

//////////////////////////////////////////////
export class OrderBook {
  //////////////////////////////////////////////
  chainId: string
  config: CommonConfig
  pairList: string[]
  usdSums: number[]
  data: { [key: string]: PairData }; // Properly typed as a dictionary of arrays of orders
  lastData: { [key: string]: PairData };
  //////////////////////////////////////////////
  constructor(chainId: string, config: CommonConfig) {
    this.data = {}; // Initialize with an empty array for ETH-BTC orders
    this.lastData = {}
    this.chainId = chainId
    this.config = config
    this.usdSums = [500, 2500, 10000, 30000]
    //this.usdSums = [30000, 60000, 120000]
    // 56
    //this.pairList = ['BNB/USDT']
    // 137
    //this.pairList = ['WETH/USDT', 'WETH/USDC']//, 'QUICK/USDT', 'IXT/USDT']
    this.pairList = ['WBTC/USDT', 'WBTC/USDC', 'WETH/USDT', 'WETH/USDC']//, 'QUICK/USDT', 'IXT/USDT']
    //this.pairList = ['POL/USDT']
    //this.pairList = ['WBTC/USDT']
    //this.pairList = ['QUICK/USDT']
    //this.pairList = ['IXT/USDT']
    // start periodic 10s update    

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
    const sideAsk = isAsk ? "1" : "0"
    const pairDat = pair2tokens(this.chainId, pair, sideAsk, true)
    if (!pairDat) {
      logger.error(`pair not found ${this.chainId} ${pair} `)
      return null
    }

    // convert wmatic to native matic m    
    // let inTokenAddress = pairDat.inToken.address;
    // if (this.chainId === '137' && inTokenAddress === '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270') {
    //   inTokenAddress = '0x0000000000000000000000000000000000000000'
    // }
    // calculate amount for aToken 
    const inTokenPrice = await fetchLLMAPrice(pairDat.inToken.address, this.chainId);
    const inAmount = usdAmount / inTokenPrice.priceUsd

    const inAmountTokenUnit = pairDat.inToken.toTokenUint(inAmount.toString())
    //const body = formatCallBody('bsc', 'thena', pairDat.inToken.address, inAmountTokenUnit, pairDat.outToken.address, user_address)
    const filler = "0x120971cAc17B63FFdaDf862724925914b025A9E6" // TODO: per chainId
    const body = formatCallBody('polygon', 'quickswap', pairDat.inToken.address, inAmountTokenUnit, pairDat.outToken.address, user_address, filler)

    //const res = await this.callExchangeQuote(paraswap_url, body)
    const res = await this.callExchangeQuote(manifold_url, body)
    if (res != null) {
      if (res.error) {
        console.error(`quotePair ${res.error}`)
        return null
      }

      const outAmountTokenUnit = res.result[0]?.route?.amountOut
      if (!outAmountTokenUnit) {
        logger.warn(`failed to get outAmount from [result[0]?.route?.amountOut]`)
        return null
      }
      const outAmount = parseFloat(pairDat.outToken.fromTokenUint(outAmountTokenUnit))
      const price = pairDat.inTokenIsA ? outAmount / inAmount : inAmount / outAmount
      const orderAmount = pairDat.inTokenIsA ? inAmount : outAmount;
      return new Order(price.toFixed(8), orderAmount.toFixed(8))
    }

    return null

  }
  //////////////////////////////////////////////
  async buildPairSide(pair: string, isAsk: boolean) {
    let calls = []
    let prevSum = 0
    for (const usdSum of this.usdSums) {
      // reversing the isAsk to get a mirror book image of the dex
      calls.push(this.quotePair(pair, !isAsk, usdSum))
    }
    return Promise.all(calls)//.concat(bids))
  }
  //////////////////////////////////////////////
  async buildPair(pair: string) {
    this.data[pair] = { ask: ([] as Order[]), bid: ([] as Order[]) }
    const isAsk = true

    let calls = []
    const asks = await this.buildPairSide(pair, isAsk)
    const bids = await this.buildPairSide(pair, !isAsk)
    calls.push(asks)
    calls.push(bids)

    //execute all at once
    const res = await Promise.all(calls)

    for (const order of res[0] as Order[]) {
      if (order) {
        this.data[pair].ask.push(order)
      }
    }
    for (const order of res[1] as Order[]) {
      if (order) {
        this.data[pair].bid.push(order)
      }
    }
  }
  //////////////////////////////////////////////
  async buildAll() {
    logger.info('-- build all begin -------------')
    this.data = {}
    const calls = []
    for (const pair of this.pairList) {
      calls.push(this.buildPair(pair))
    }
    try {
      await Promise.all(calls)
    } catch (e) {
      logger.error('error in buildAll', e)
      return
    }
    logger.info('-- build all end -------------')
    this.lastData = this.data
  }
  //////////////////////////////////////////////
  async start() {
    setInterval(async () => { await this.buildAll() }, 20 * 1000)
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
    for (const pairName in this.lastData) {
      const pair: PairData = this.lastData[pairName]
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
