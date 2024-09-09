import express, { Request, Response } from "express";
import { Wrapper } from "./wrapper";
import logger from "./logger";


const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

const wrapper = new Wrapper();

function sendErr(res: Response, status: number, msg: string) {
  logger.error(`${status} ${msg}`);
  res.status(status).send(msg);
}
// GET /api/rfq/pairprice?chainid=137&pair=WETH/USDT&amount=10&side=1&isbase=1' --header 'x-apikey: API_KEY'
app.get("/api/rfq/pairprice", async (req: Request, res: Response) => {
  const { chainid, pair, amount, side, isbase } = req.query;
  const apiKey = req.header("x-api-key");
  if (!chainid) {
    return sendErr(res, 500, "chainId is missing");
  }
  if (!pair) {
    return sendErr(res, 500, "pair is missing");
  }
  if (!amount) {
    return sendErr(res, 500, "amount is missing");
  }
  if (!side) {
    return sendErr(res, 500, "side is missing");
  }
  if (!isbase) {
    return sendErr(res, 500, "isBase is missing");
  }
  const quote = await wrapper.quoteAuction(
    chainid as string,
    pair as string,
    amount as string,
    side as string,
    isbase === "1",
  );
  // error
  if (quote.error) {
    return sendErr(res, 500, "quoteAuction exception: " + quote.error);
  }

  // You can implement your own logic to validate the apiKey or check query params  
  const response = {
    success: true,
    pair: pair,
    side: side, // 0 = buy A | 1 = sell A
    price: quote.price,
    baseAmount: isbase ? amount : quote.outAmount,
    quoteAmount: !isbase ? amount : quote.outAmount
  };

  res.json(response);
});

// POST /api/rfq/prices
// curl --location 'https://api.dexalot.com/api/rfq/prices?chainid=43114' --header 'x-apikey: API_KEY'
app.post("/api/rfq/prices", (req: Request, res: Response) => {
  const { chainid } = req.query;
  const apiKey = req.header("x-api-key");
  if (!chainid) {
    return sendErr(res, 500, "chainId is missing");
  }
  // get orderbook
  const book = wrapper.getOrderBook('137')
  res.json(book);

});

// POST /api/rfq/firm
app.post("/api/rfq/firm", (req: Request, res: Response) => {
  const response = {
    order: {
      nonceAndMeta:
        "0x05182E579FDfCf69E4390c3411D8FeA1fb6467cfc6f28e56b0daf00000000000",
      expiry: 1694534360,
      makerAsset: "0x0000000000000000000000000000000000000000",
      takerAsset: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      maker: "0xEed3c159F3A96aB8d41c8B9cA49EE1e5071A7cdD",
      taker: "0x05A1AAC00662ADda4Aa25E1FA658f4256ed881eD",
      makerAmount: "21483696748316475197",
      takerAmount: "200000000",
    },
    signature:
      "0xbdcd5728194a953a01b2f9bf6d474b2014979e0768fc5b5b707c988a3be89ccf7bccbc61ea19b1ee49802bcb4dfbe7585e4d26236bb18aac11b9d92d3085c6d91c",
    tx: {
      to: "0xEed3c159F3A96aB8d41c8B9cA49EE1e5071A7cdD",
      data: "0x6c75d6f5a6f548c01714e590c52d74f64d0d07ee795e65e512b0109d26c260000000000000000000000000000000000000000000000000000000000000000000651157e700000000000000000000000068b773b8c10f2ace8ac51980a1548b6b48a2ec54000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002071a83909798fc2a5a2f2781b0892a46d9cd1c000000000000000000000000def171fe48cf0115b1d80b88dc8eab59176fee57000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000001d1a94a20000000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000004109b33c1c66e114c9ce92ffd1cfd2ba6661d1a3697011a5aeb2417c86c58b93da743b0afa869492132e0eafffdb2b070d05e644711c052ee3cd80d2847d7387ee1b00000000000000000000000000000000000000000000000000000000000000",
      gasLimit: 120000,
    },
  };

  res.json(response);
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
