import logger from "./logger";
import Web3 from "web3";
import {
  TokenData,
  contract,
  eqIgnoreCase,
  erc20FromData,
  isNativeAddress,
  maxUint256,
  web3,
} from "@defi.org/web3-candies";
import { RFQ, Quote } from "./types";
import BN from "bignumber.js";
import type { Config } from "./config";
import _ from "lodash";
export * from "./config";
import { DutchOrder } from "@uniswap/uniswapx-sdk";

const ERC20_TRANSFER_EVENT_SIGNATURE =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export function supported(config: Config, rfq: RFQ) {
  return !isNativeAddress(rfq.inToken);
}

export function parse(config: Config, serializedOrder: string) {
  const order = DutchOrder.parse(serializedOrder, config.id);
  return order.toJSON();
}

export function getSignature(
  config: Config,
  serializedOrder: string,
  signature: string,
) {
  const order: DutchOrder = DutchOrder.parse(serializedOrder, config.id);
  return order.getSigner(signature);
}

export function amount(amount: number, token: TokenData) {
  return BN(10).pow(token.decimals).times(amount);
}

export function now() {
  return Math.floor(Date.now() / 1000);
}

export type EventUrl = {
  pathParameters?: any;
  queryStringParameters?: { [key: string]: string };
  body?: any;
};

export async function getTransactionDetails(web3: Web3, txHash: string) {
  try {
    const receipt = await web3.eth.getTransactionReceipt(txHash);

    if (!receipt) {
      return {
        status: "Not mined yet",
      };
    }

    const status = receipt.status ? "Mined" : "Reverted";
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice;

    const transferEvents = receipt.logs.filter(
      (log) => log.topics[0] === ERC20_TRANSFER_EVENT_SIGNATURE,
    );

    // Parse each Transfer event
    const transfers = transferEvents.map((log) => {
      // The first topic is the event signature, the next two are the indexed parameters (from, to)
      const from = web3.eth.abi.decodeParameter("address", log.topics[1]);
      const to = web3.eth.abi.decodeParameter("address", log.topics[2]);
      // The value transferred is in the data field
      const value = web3.eth.abi.decodeParameter("uint256", log.data);

      return { from, to, value: value.toString() };
    });

    let revertMessage = "";

    if (!receipt.status) {
      // If the transaction was reverted, try to get the revert reason.
      try {
        const tx = await web3.eth.getTransaction(txHash);
        const code = await web3.eth.call(tx as any, tx.blockNumber!);
        revertMessage = web3.utils.toAscii(code).replace(/\0/g, ""); // Convert the result to a readable string
      } catch (err) {
        revertMessage = "Unable to retrieve revert reason";
      }
    }

    return {
      status,
      gasUsed,
      revertMessage,
      gasPrice,
      transfers,
    };
  } catch (error: any) {
    throw new Error(`Failed to fetch transaction details: ${error.message}`);
  }
}

export function rfqToKey(rfq: any, solver: string) {
  return `${rfq.inToken}-${rfq.outToken}-${solver}`;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getDutchPrice(config: Config, serializedOrder: string) {
  const now = Math.floor(Date.now() / 1000);
  //@ts-ignore
  const order = DutchOrder.parse(serializedOrder, config.chainId, PERMIT2);
  const resolvedOrder = order.resolve({
    timestamp: now,
  });
  //@ts-ignore
  const gasPrice: BigNumber = resolvedOrder.outputs[0].amount;
  //@ts-ignore
  const orderPrice: BigNumber = resolvedOrder.outputs[1].amount;
  return {
    gasPrice,
    orderPrice,
    totalPrice: gasPrice.plus(orderPrice),
  };
}

export function encodeSolverBody(data: any) {
  return JSON.stringify({
    dataStr: JSON.stringify(data),
  });
}

export function dumpFetchAsCurl(url: string, options: any) {
  const { method, headers, body } = options;
  const headerString = Object.keys(headers)
    .map((key) => `-H '${key}: ${headers[key]}'`)
    .join(" ");
  const bodyString = body ? `-d '${body}'` : "";
  return logger.verbose(
    `curl -X ${method} ${headerString} ${bodyString} '${url}'`,
  );
}
