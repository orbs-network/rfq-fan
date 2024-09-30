import { quoteAuction } from "./auction";
import { CommonConfig, withConfig } from "./config";
import { divStrUint, pair2tokens } from "./pair";
import * as dotenv from 'dotenv';
import { AuctionResult } from "./types";
import { OrderBook } from "./obk-build";
import { ObkBnnc } from "./obk-bnnc";
import logger from "./logger";
import { formatCallBody, callExchangeQuote } from "./call-solver"

const manifold_url_firm = 'https://clob-taker-manifold-d96876edee4d.herokuapp.com/getBids'

// Load environment variables from .env file
dotenv.config();

// Access an environment variable
const user_address = process.env.USER_ADDRESS;

export class Wrapper {
  //obook: OrderBook;
  obkBnnc: ObkBnnc;
  config: CommonConfig
  constructor() {
    // create order book to be updated
    //const chainId = '56'
    const chainId = '137'

    this.config = withConfig({
      pathParameters: [],
      queryStringParameters: {
        chainid: chainId,
      },
      body: null,
    });
    // Solver' order book representation
    //this.obook = new OrderBook(chainId, this.config)
    // binance altered prices
    this.obkBnnc = new ObkBnnc()
    //this.obook.start()
    this.obkBnnc.start()
  }
  // quoteAuction /////////////////////////////////
  public async quoteAuction(chainid: string, pair: string, amount: string, side: string, isbase: boolean): Promise<any> {

    const p2t = pair2tokens(chainid, pair, side, isbase);
    if (!p2t) {
      return { error: "pair is not supported" }
    }

    const inAmountDec = p2t.inToken.toTokenUint(amount)

    if (!user_address) {
      logger.error("USER_ADDRESS ws not provided")
      return
    }
    const rfq = {
      user: user_address,
      inToken: p2t.inToken.address,
      outToken: p2t.outToken.address,
      inAmount: inAmountDec,
      sessionId: "",
      outAmount: "-1",
      slippage: 0.1,
    };

    try {
      const res = await quoteAuction(this.config, rfq);
      if (res.error) {
        return res;
      }
      // out amount
      const auctionRes = res as AuctionResult
      const outAmount = p2t.outToken.fromTokenUint(auctionRes.outAmount)
      // price
      const price = p2t.inTokenIsA ? divStrUint(outAmount, amount) : divStrUint(amount, outAmount)

      return { ...res, outAmount, price, inTokenIsA: p2t.inTokenIsA }
    }
    catch (e) {
      return { error: "exception in quoteAuction", msg: e }
    }
  }

  // create reconstructed order book
  public getOrderBook(chainid: string): Object {
    //return this.obook.get() - built one
    return this.obkBnnc.get()
  }

  // quoteAuction /////////////////////////////////
  public async firmQuote(chainid: string, takerAsset: string, makerAsset: string, takerAmount: string, userAddress: string, executor: string): Promise<any> {
    const body = formatCallBody('polygon', 'quickswap', takerAsset, takerAmount, makerAsset, userAddress, executor)
    const res = await callExchangeQuote(this.config, manifold_url_firm, body)
    if (res != null) {
      if (res.error) {
        console.error(`quotePair ${res.error}`)
        return { error: res.error };
      }
    }

    const outAmountTokenUnit = res.result[0]?.route?.amountOut
    if (!outAmountTokenUnit) {
      logger.warn(`firmQuote - failed to get outAmount from [result[0]?.route?.amountOut]`)
      return { error: 'failed to get amountOut' };
    }

    const now = new Date(); // Get the current time
    const expiry = new Date(now.getTime() + 1 * 60 * 1000); // Add one minute (60,000 milliseconds)
    const maker = res.result[0].route.filler // maker is always the target liq provider(manifold) 
    const to = res.result[0].route.parsedRoute?.to
    const data = res.result[0].route.parsedRoute?.data

    const sig = "0x00"
    return {
      order: {
        nonceAndMeta: "",
        expiry: expiry,
        makerAsset: makerAsset,
        takerAsset: takerAsset,
        maker: maker,
        taker: userAddress,
        makerAmount: outAmountTokenUnit,
        takerAmount: takerAmount,
      },
      //signature: sig,
      tx: {
        to: to,
        data: data,
        gasLimit: 120000,
      },
    };
  }
}
