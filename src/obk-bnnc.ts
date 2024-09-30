// orderbook.ts

import WebSocket from 'ws';
import fetch from 'node-fetch';

const ORDER_LIMIT = 20
const SYMBOL = 'BTCUSDT';
const REST_URL = `https://api.binance.com/api/v3/depth?symbol=${SYMBOL}&limit=${ORDER_LIMIT}`;
const WS_URL = `wss://stream.binance.com:9443/ws/${SYMBOL.toLowerCase()}@depth@100ms`;

interface DepthSnapshot {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

interface DepthUpdate {
  e: string;    // Event type
  E: number;    // Event time
  s: string;    // Symbol
  U: number;    // First update ID in event
  u: number;    // Final update ID in event
  b: [string, string][]; // Bids to be updated
  a: [string, string][]; // Asks to be updated
}

export class ObkBnnc {
  bids: Map<number, number>;
  asks: Map<number, number>;
  lastUpdateId: number | null;

  constructor() {
    this.bids = new Map();
    this.asks = new Map();
    this.lastUpdateId = null;
  }

  updateSide(side: Map<number, number>, updates: [string, string][]) {
    for (const [priceStr, qtyStr] of updates) {
      const price = parseFloat(priceStr);
      const qty = parseFloat(qtyStr);
      if (qty === 0) {
        side.delete(price);
      } else {
        side.set(price, qty);
      }
    }
  }

  applySnapshot(snapshot: DepthSnapshot) {
    this.lastUpdateId = snapshot.lastUpdateId;
    this.updateSide(this.bids, snapshot.bids);
    this.updateSide(this.asks, snapshot.asks);
  }

  async applyUpdate(update: DepthUpdate) {
    const { U: firstUpdateId, u: finalUpdateId } = update;

    if (this.lastUpdateId === null) {
      return // ignore current update
      //throw new Error('Order book not initialized with a snapshot.');
    }

    // Ignore updates that are not newer than the last update ID
    if (finalUpdateId <= this.lastUpdateId) {
      return;
    }

    // Check if update is valid and in sequence
    if (firstUpdateId <= this.lastUpdateId + 1 && finalUpdateId >= this.lastUpdateId + 1) {
      this.updateSide(this.bids, update.b);
      this.updateSide(this.asks, update.a);
      this.lastUpdateId = finalUpdateId;
    } else {
      // Out-of-order update detected; resynchronization required
      console.error('Out-of-order update detected; resynchronization required.');
      this.lastUpdateId = null; // Reset the lastUpdateId
      this.bids.clear(); // Clear existing bids
      this.asks.clear(); // Clear existing asks

      // Trigger a new snapshot fetch and reset
      const snapshot = await getOrderBookSnapshot();
      this.applySnapshot(snapshot);
    }
  }
  async start() {
    const messageQueue: DepthUpdate[] = [];
    let isSnapshotFetched = false;

    const ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      console.log('WebSocket connection opened.');
    });

    ws.on('message', async (data: WebSocket.Data) => {
      const parsedData = JSON.parse(data.toString()) as DepthUpdate;

      if (!isSnapshotFetched) {
        messageQueue.push(parsedData);
      } else {
        try {
          await this.applyUpdate(parsedData);
          // Optionally, print the top levels
          // printTopLevels(orderBook);
        } catch (error) {
          console.error('Error applying update:', error);
          ws.close();
          process.exit(1);
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      process.exit(1);
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed.');
      process.exit(1);
    });

    try {
      // Fetch initial order book snapshot
      const snapshot = await getOrderBookSnapshot();
      this.applySnapshot(snapshot);
      isSnapshotFetched = true;

      // Apply any buffered messages
      for (const update of messageQueue) {
        try {
          this.applyUpdate(update);
        } catch (error) {
          console.error('Error applying buffered update:', error);
          ws.close();
          process.exit(1);
        }
      }

      // Clear the message queue
      messageQueue.length = 0;

      console.log('Order book synchronized.');
      // Optionally, start a timer to print the order book periodically
      // setInterval(() => printTopLevels(orderBook), 1000);

    } catch (error) {
      console.error('Error initializing order book:', error);
      ws.close();
      process.exit(1);
    }
  }
  convert2PriceQty(side: Map<number, number>, priceFactor: number) {
    const prices = Array.from(side.entries())
      .sort((a, b) => a[0] - b[0]);

    const result = [];
    for (let i = 0; i < prices.length; i++) {
      const [price, qty] = prices[i];
      result.push([(price * priceFactor).toFixed(8), qty.toFixed(8)]);
    }
    return result
  }
  get() {
    return {
      "ask": this.convert2PriceQty(this.asks, 1.001),
      "bid": this.convert2PriceQty(this.bids, 0.999)
    }
  }
}

function printTopLevels(orderBook: ObkBnnc, depth: number = 5) {
  const topBids = Array.from(orderBook.bids.entries())
    .sort((a, b) => b[0] - a[0])
    .slice(0, depth);

  const topAsks = Array.from(orderBook.asks.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(0, depth);

  console.log('Top Bids:');
  for (const [price, qty] of topBids) {
    console.log(`${price.toFixed(2)} => ${qty}`);
  }

  console.log('Top Asks:');
  for (const [price, qty] of topAsks) {
    console.log(`${price.toFixed(2)} => ${qty}`);
  }
  console.log('-'.repeat(40));
}

async function getOrderBookSnapshot(): Promise<DepthSnapshot> {
  const response = await fetch(REST_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch snapshot: ${response.statusText}`);
  }
  const data = await response.json();
  return data as DepthSnapshot;
}





