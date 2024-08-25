import { quoteAuction } from "./auction";
import { withConfig } from "./config";
import logger from "./logger";
import { RFQ } from "./types";

const tokens = {
  "USDT": {
    "desc": "USDT on polygon",
    "address": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    "decimals": 6
  },
  "MATIC": {
    "desc": "erc-20 address of WMATIC wrapped",
    "address": "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
    "decimals": 18
  },
  "ETH": {
    "desc": "Polygon Wrapped Ether",
    "address": "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    "decimals": 18
  }
}

function pair2tokens(pair: string): { inToken: string, outToken: string } {
  return { inToken: tokens["MATIC"].address, outToken: tokens["USDT"].address }
}
export class Wrapper {
  constructor() {
  }
  public async quote(chainid: string, pair: string, amount: string, side: string, isbase: boolean): Promise<void> {
    const config = withConfig({
      pathParameters: [],
      queryStringParameters: {
        "chainid": chainid
      },
      body: null
    });

    const { inToken, outToken } = pair2tokens(pair)

    const rfq = {
      user: "0x00",
      inToken: inToken,
      outToken: outToken,
      inAmount: "1000000000000000000",
      sessionId: "-1",
      outAmount: "",
      slippage: 0
    };

    const res = quoteAuction(config, rfq)
    console.log(res)
    //const res = quote(config, rfq, solver, false, false, null)
  }
}