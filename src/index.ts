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
// app.get("/api/rfq/pairprice", async (req: Request, res: Response) => {
//   const { chainid, pair, amount, side, isbase } = req.query;
//   const apiKey = req.header("x-api-key");
//   if (!chainid) {
//     return sendErr(res, 500, "chainId is missing");
//   }
//   if (!pair) {
//     return sendErr(res, 500, "pair is missing");
//   }
//   if (!amount) {
//     return sendErr(res, 500, "amount is missing");
//   }
//   if (!side) {
//     return sendErr(res, 500, "side is missing");
//   }
//   if (!isbase) {
//     return sendErr(res, 500, "isBase is missing");
//   }
//   const quote = await wrapper.quoteAuction(
//     chainid as string,
//     pair as string,
//     amount as string,
//     side as string,
//     isbase === "1",
//   );
//   // error
//   if (quote.error) {
//     return sendErr(res, 500, "quoteAuction exception: " + quote.error);
//   }

//   // You can implement your own logic to validate the apiKey or check query params  
//   const response = {
//     success: true,
//     pair: pair,
//     side: side, // 0 = buy A | 1 = sell A
//     price: quote.price,
//     baseAmount: isbase ? amount : quote.outAmount,
//     quoteAmount: !isbase ? amount : quote.outAmount
//   };

//   res.json(response);
// });

// GET /api/rfq/prices
// curl --location 'https://api.dexalot.com/api/rfq/prices?chainid=43114' --header 'x-apikey: API_KEY'
app.get("/api/rfq/prices", (req: Request, res: Response) => {
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
app.post("/api/rfq/firm", async (req: Request, res: Response) => {
  const apiKey = req.header("x-api-key");
  const requiredFields = ['chainid', 'takerAsset', 'makerAsset', 'takerAmount', 'userAddress'];

  for (const field of requiredFields) {
    if (!req.body[field]) {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }

  const response = await wrapper.firmQuote(req.body['chainid'], req.body['takerAsset'], req.body['makerAsset'], req.body['takerAmount'], req.body['userAddress'], req.body['executor'])
  if (response.error) {
    res.status(500).send(response.error)
  }
  res.json(response);
});


// Start the server
app.listen(PORT, () => {
  console.log('rfq-fan version 1.0.0')
  console.log(`Server is running on http://localhost:${PORT}`);
});
