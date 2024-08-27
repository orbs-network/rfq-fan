import { bn, isNativeAddress } from "@defi.org/web3-candies";
import logger from "./logger";
import * as crypto from "crypto";
import { version } from "../package.json";
import { getTokenPrice, getTokenPriceLegacy } from "./price-oracle";
import { tryFetchErc20 } from "./w3";
import { CommonConfig } from "./utils";


export async function getDollarValue(c: CommonConfig, amount: string, tokenAddress: string): Promise<number> {
  tokenAddress = isNativeAddress(tokenAddress) ? c.wToken.address : tokenAddress;
  try {
    const usdPrice = await getTokenPrice(c, tokenAddress);
    const decimals = (await tryFetchErc20(c, tokenAddress))?.decimals || 18;
    return bn(amount)
      .dividedBy(10 ** decimals)
      .multipliedBy(usdPrice.priceUsd)
      .toNumber();
  } catch (e) {
    logger.verbose(`[getDollarValue] e:${e}`);
    return -1;
  }
}

async function getDollarValue2(c: CommonConfig, amount: string, tokenAddress: string): Promise<number> {
  tokenAddress = isNativeAddress(tokenAddress) ? c.wToken.address : tokenAddress;
  try {
    const usdPrice = await getTokenPriceLegacy(c, tokenAddress);
    const decimals = (await tryFetchErc20(c, tokenAddress))?.decimals || 18;
    return bn(amount)
      .dividedBy(10 ** decimals)
      .multipliedBy(usdPrice.priceUsd)
      .toNumber();
  } catch (e) {
    logger.verbose(`[getDollarValue] e:${e}`);
    return -1;
  }
}

const enrichRfq = async (c: any, o: any) => {
  try {
    const tokenIn = await tryFetchErc20(c, o.tokenIn);
    const tokenOut = await tryFetchErc20(c, o.tokenOut);
    //const permit2Allowance = await getAllowance({ config: c, tokenAddress: o.tokenIn, ownerAddress: o.userAddress || o.user, spenderAddress: c.PERMIT2 });
    return {
      tokenIn,
      tokenOut,
      inSymbol: tokenIn.symbol,
      outSymbol: tokenOut.symbol,
      amountInF: bn(o.amountIn).dividedBy(10 ** tokenIn.decimals),
      amountOutF: bn(o.amountOut).dividedBy(10 ** tokenOut.decimals),
      // permit2Allowance,
      ...o,
    };
  } catch (e) {
    return {
      inSymbol: "",
      outSymbol: "",
      amountInF: bn(o.amountIn).dividedBy(10 ** 18),
      amountOutF: bn(o.amountOut).dividedBy(10 ** 18),
      ...o,
    };
  }
};

function calcOutAmountDiff(o: { amountOut: string; amountOutUI: string }) {
  try {
    const amountOutDiff = bn(o.amountOut).minus(o.amountOutUI).dividedBy(o.amountOutUI).multipliedBy(100).minus(1).toFixed(2);
    return parseFloat(Number(amountOutDiff).toFixed(6));
  } catch (e) {
    return 0;
  }
}

export async function reportQuote(
  c: any,
  o: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    amountOutDollarValue: number;
    gasCostOutputToken: string;
    gasCostUsd: number;
    gasCostDollarValue: number;
    amountOutUI: string;
    chainId: number;
    userAddress: string;
    quoteError: string | undefined;
    isError: boolean;
    isAuction: boolean;
    startTime: number;
    sessionId: string;
    isFirstQuote: boolean;
    auctionWinner: string | undefined;
    updatedErrorTypes: any;
    slippage: number;
    serializedOrder: string;
    gasUnits: string;
    auctionData: any;
    simulateAmountOut: string;
  },
) {
  try {
    const outDiff = calcOutAmountDiff(o);
    let richRfq = await enrichRfq(c, o);
    return sendToKibana(c, {
      tokenInAddress: o.tokenIn,
      tokenInSymbol: richRfq.inSymbol,
      tokenOutAddress: o.tokenOut,
      tokenOutSymbol: richRfq.outSymbol,
      amountIn: o.amountIn,
      amountInF: richRfq.amountInF,
      amountOut: o.amountOut,
      amountOutUI: o.amountOutUI,
      amountOutDiff: outDiff,
      chainId: o.chainId,
      userAddress: o.userAddress,
      user: o.userAddress,
      quoteError: o.quoteError,
      isError: o.isError,
      slippage: o.slippage,
      type: "quote",
      isAuction: o.isAuction,
      took: Date.now() - o.startTime,
      sessionId: o.sessionId,
      isFirstQuote: o.isFirstQuote,
      gasCostUsd: o.gasCostUsd,
      gasCostUsdCents: o.gasCostUsd * 100,
      auctionWinner: o.auctionWinner,
      updatedErrorTypes: o.updatedErrorTypes,
      dollarValue: o.amountOutDollarValue,
      dollarValue2: await getDollarValue2(c, o.amountIn, o.tokenIn),
      inUsd: await getDollarValue(c, o.amountIn, o.tokenIn),
      inUsd2: await getDollarValue2(c, o.amountIn, o.tokenIn),
      outUsd: await getDollarValue(c, o.amountOut, o.tokenOut),
      outUsd2: await getDollarValue2(c, o.amountOut, o.tokenOut),
      gasUnits: Number(o.gasUnits),
      auctionData: o.auctionData,
      simulateAmountOut: o.simulateAmountOut,
      //  permit2Allowance: richRfq.permit2Allowance.toFixed(0),
      //  permit2AllowanceOk: richRfq.permit2Allowance.gte(o.amountIn),
    });
  } catch (e) {
    logger.error(`[sendToKibana] e:${e}`);
  }
}

export async function reportSwap(
  c: any,
  o: {
    stage: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    freshOutAmount: string;
    amountOutSwap: string;
    amountOutDiff: number;
    chainId: number;
    user: string;
    txHash: string;
    txStatus: string;
    txReverted: boolean;
    txRevertMessage: string;
    feeAmount: string;
    feeData: string;
    serializedOrder: string;
    signature: string;
    gasUnitsTx: number;
    gasPriceTx: number;
    //gasFee: string;
    startTime: number;
    exchange: string;
    raw: string;
    sessionId?: string;
    gasUsed: number;
    gasPrice: number;
    amountInUSD: number;
    amountInUSD2: number;
    tryIndex: number;
    maxTries: number;
    dutchPrice: string;
    solverId: string;
    timeTillDecayStart: number;
    timeToDecayEnd: number;
    timeAbsolute: number;
    timeAbsoluteEnd: number;
    estimateGasElapsed: number;
    estimateGasSuccess: boolean;
    exactOutAmount: string;
    exactOutAmountUsd: number;
    exactOutAmountSavings: string;
    exactOutAmountSavingsUsd: number;
    feeOutAmount: string;
    feeOutAmountUsd: number;
    slippage: number;
    amountOutUI: string;
    txData: string;
    auctionData: any;
    blockNumber: number;
    simulateAmountOut: string;
  },
) {
  let richRfq = await enrichRfq(c, o);
  return sendToKibana(c, {
    _id: `swap_${o.sessionId}`,
    stage: o.stage,
    tokenInAddress: o.tokenIn,
    tokenInSymbol: richRfq.inSymbol,
    tokenOutSymbol: richRfq.outSymbol,
    tokenInName: richRfq.inSymbol,
    tokenOutAddress: o.tokenOut,
    tokenOutName: richRfq.outSymbol,
    amountIn: o.amountIn,
    amountOut: o.amountOut,
    amountOutF: richRfq.amountOutF,
    amountOutSwap: o.amountOutSwap,
    amountOutSwapFmt: bn(o.amountOutSwap)
      .dividedBy(10 ** richRfq.tokenOut.decimals)
      .toFixed(2),
    exchange: o.exchange,
    rawStr: JSON.stringify(o.raw), // don't cause re-index issue
    chainId: o.chainId,
    user: o.user,
    txHash: o.txHash,
    type: "swap",
    feeAmount: o.feeAmount,
    feeData: o.feeData,
    serializedOrder: o.serializedOrder,
    signature: o.signature,
    swapStatus: o.txStatus == "pending" ? "during" : o.txHash ? "success" : "failed",
    txStatus: o.txStatus,
    gasUsed: o.gasUsed,
    gasPriceGwei: Number(o.gasPrice) / 1e9,
    amountInUSD: o.amountInUSD,
    amountInUSD2: o.amountInUSD2,
    took: Date.now() - o.startTime,
    sessionId: o.sessionId,
    tryIndex: o.tryIndex,
    maxTries: o.maxTries,
    dutchPrice: o.dutchPrice,
    dutchPriceFmt: bn(o.dutchPrice)
      .dividedBy(10 ** richRfq.tokenOut.decimals)
      .toFixed(2),
    solverId: o.solverId,
    dollarValue: await getDollarValue(c, o.amountIn, o.tokenIn),
    dollarValue2: await getDollarValue2(c, o.amountIn, o.tokenIn),
    inUsd: await getDollarValue(c, o.amountIn, o.tokenIn),
    inUsd2: await getDollarValue2(c, o.amountIn, o.tokenIn),
    outUsd: await getDollarValue(c, o.amountOut, o.tokenOut),
    outUsd2: await getDollarValue2(c, o.amountOut, o.tokenOut),
    tryRatioP: Number(((o.tryIndex / o.maxTries) * 100).toFixed(0)),
    timeTillDecayStart: o.timeTillDecayStart,
    timeToDecayEnd: o.timeToDecayEnd,
    timeAbsolute: o.timeAbsolute,
    timeAbsoluteEnd: o.timeAbsoluteEnd,
    estimateGasElapsed: o.estimateGasElapsed,
    estimateGasSuccess: o.estimateGasSuccess,
    exactOutAmount: o.exactOutAmount,
    exactOutAmountFmt: bn(o.exactOutAmount)
      .dividedBy(10 ** richRfq.tokenOut.decimals)
      .toFixed(2),
    exactOutAmountUsd: o.exactOutAmountUsd,
    exactOutAmountSavings: o.exactOutAmountSavings,
    exactOutAmountSavingsUsd: o.exactOutAmountSavingsUsd,
    feeOutAmount: o.feeOutAmount,
    feeOutAmountUsd: o.feeOutAmountUsd,
    slippage: o.slippage,
    amountOutUI: o.amountOutUI,
    txData: o.txData,
    auctionData: o.auctionData,
    blockNumber: o.blockNumber,
    simulateAmountOut: o.simulateAmountOut,
    // permit2Allowance: richRfq.permit2Allowance.toFixed(0),
    // permit2AllowanceOk: richRfq.permit2Allowance.gte(o.amountIn),
  });
}

export async function reportSwapError(
  c: any,
  o: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    freshOutAmount: string;
    amountOutSwap: string;
    amountOutDiff: number;
    chainId: number;
    user: string;
    serializedOrder: string;
    signature: string;
    feeAmount: string;
    feeData: string;
    gasUnits: string;
    gasPrice: string;
    error: string;
    exchange: string;
    raw: string;
    startTime: number;
    sessionId?: string;
    tryIndex: number;
    maxTries: number;
    dutchPrice: string;
    slippage: number;
    solverId: string;
    txData: string;
    auctionData: any;
    blockNumber?: number;
    timeToDecayEnd: Number;
    took: number;
  },
) {
  logger.warn(`[reportSwapError] ${JSON.stringify(o)}`);
  let richRfq = await enrichRfq(c, o);
  return sendToKibana(c, {
    _id: `swap_${o.sessionId}`,
    tokenInAddress: o.tokenIn,
    tokenInSymbol: richRfq.inSymbol,
    tokenOutAddress: o.tokenOut,
    tokenOutSymbol: richRfq.outSymbol,
    amountIn: o.amountIn,
    amountOut: o.amountOut,
    amountOutSwap: "0",
    chainId: o.chainId,
    user: o.user,
    exchange: o.exchange,
    //raw: o.raw,
    type: "swap",
    swapStatus: "failed",
    stage: "failed",
    //feeAmount: o.feeAmount,
    //feeData: o.feeData,
    serializedOrder: o.serializedOrder,
    signature: o.signature,
    gasUnits: "0",
    gasPriceGwei: 0,
    error: o.error,
    swapError: o.error,
    took: o.took,
    sessionId: o.sessionId,
    tryIndex: o.tryIndex,
    solverId: o.solverId,
    dutchPrice: o.dutchPrice,
    dollarValue: await getDollarValue(c, o.amountIn, o.tokenIn),
    dollarValue2: await getDollarValue2(c, o.amountIn, o.tokenIn),
    inUsd: await getDollarValue(c, o.amountIn, o.tokenIn),
    inUsd2: await getDollarValue2(c, o.amountIn, o.tokenIn),
    outUsd: await getDollarValue(c, o.amountOut, o.tokenOut),
    outUsd2: await getDollarValue2(c, o.amountOut, o.tokenOut),
    maxTries: o.maxTries,
    slippage: o.slippage,
    tryRatioP: Number((o.tryIndex / o.maxTries).toFixed(2)),
    txData: o.txData,
    auctionData: o.auctionData,
    blockNumber: o.blockNumber,
    timeTillDecayStart: 0,
    timeTillDecayEnd: o.timeToDecayEnd,
    // permit2Allowance: richRfq.permit2Allowance.toFixed(0),
    // permit2AllowanceOk: richRfq.permit2Allowance.gte(o.amountIn),
  });
}

export async function reportManiFoldError(
  c: CommonConfig,
  o: {
    sessionId: string;
    error: string;
    solverId: string;
    tryIndex: number;
    maxTries: number;
    dutchPrice: string;
    to: string;
    txData: string;
    chainId: number;
    user: string;
    amountIn: string;
    amountOut: string;
    amountOutSwap: string;
    serializedOrder: string;
    tokenIn: string;
    tokenOut: string;
    exchange: string;
    solverData: string;
    blockNumber: number;
    blockTimestamp: string;
  },
) {
  return sendToKibana(
    c,
    {
      _id: `${o.sessionId}_maniFold`,
      tokenInAddress: o.tokenIn,
      tokenOutAddress: o.tokenOut,
      amountIn: o.amountIn,
      amountOut: o.amountOut,
      amountOutSwap: o.amountOutSwap,
      chainId: o.chainId,
      user: o.user,
      type: "manifoldError",
      swapStatus: "failed",
      exchange: o.exchange,
      error: o.error,
      swapError: o.error,
      sessionId: o.sessionId,
      solverData: o.solverData,
      serializedOrder: o.serializedOrder,
      tryIndex: o.tryIndex,
      solverId: o.solverId,
      dutchPrice: o.dutchPrice,
      dollarValue: await getDollarValue(c, o.amountIn, o.tokenIn),
      maxTries: o.maxTries,
      txData: o.txData,
      tokenIn: o.tokenIn,
      tryRatioP: Number((o.tryIndex / o.maxTries).toFixed(2)),
    },
    "clob-manifold",
  );
}

function sendToKibana(c: any, oo: any, index = "clob-poc10") {
  oo["abtest"] = getGitTag() || "control";
  oo["version"] = version;
  oo["dex"] = c.name;

  logger.verbose(`sendToKibana: ${JSON.stringify(oo)}`);
  fetch(`http://logs.orbs.network:3001/putes/${index}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(oo),
  });
}

let _gitTag: string | undefined;

function getGitTag() {
  if (_gitTag) {
    return _gitTag;
  }
  try {
    const tag = require("child_process").execSync("git describe --tags").toString().trim();
    _gitTag = tag;
    return tag;
  } catch (e) {
    _gitTag = "";
    return "";
  }
}

export function generateSessionId(chainId: number, bitLength: number = 32): string {
  return `${crypto.randomBytes(bitLength / 8).toString("hex")}_${chainId}`;
}