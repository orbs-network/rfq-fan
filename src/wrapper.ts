import { quoteAuction } from "./auction";
import { withConfig } from "./config";
import { divStrUint, pair2tokens } from "./pair";
import * as dotenv from 'dotenv';
import { AuctionResult } from "./types";
import logger from "./logger";

// Load environment variables from .env file
dotenv.config();

// Access an environment variable
const user_address = process.env.USER_ADDRESS;

export class Wrapper {
  constructor() { }
  public async quoteAuction(chainid: string, pair: string, amount: string, side: string, isbase: boolean): Promise<any> {
    const config = withConfig({
      pathParameters: [],
      queryStringParameters: {
        chainid: chainid,
      },
      body: null,
    });

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
      const res = await quoteAuction(config, rfq);
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
}
