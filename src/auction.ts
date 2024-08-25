import { CommonConfig } from "./config";
import { quote } from "./quote";
import { bn, isNativeAddress } from "@defi.org/web3-candies";
import logger from "./logger";
//import { generateSessionId, getDollarValue } from "./bi";
import { AuctionResult, ErrorObj, Quote, RFQ, SignedQuote } from "./types";
import { tryFetchErc20 } from "./w3";
import { getDutchPrice } from "./utils";
import BN from "bignumber.js";
import { getTokenPrice } from "./price-oracle";
//import { simulateQuote } from "./swap";
import redisWrapper from "./redis";

const THENA_GOV_TOKENS = ["0xf4c8e32eadec4bfe97e0f595add0f4450a863a11", "0xcdc3a010a3473c0c4b2cb03d8489d6ba387b83cd"];

export async function quoteAuction(c: CommonConfig, rfq: RFQ & { outAmount: string; slippage: number }): Promise<AuctionResult | ErrorObj> {
  const sessionId = rfq.sessionId || "-1"//generateSessionId(c.chainId);
  if (!rfq.sessionId) {
    rfq.sessionId = sessionId;
  }

  // Slippage is relevant only for quote phase , in swap phase ignore the slippage
  if (!rfq.slippage) {
    logger.warn(`[${sessionId}]::quoteAuction slippage is not set, setting to ${c.defaultSlippage}`, rfq);
    rfq.slippage = c.defaultSlippage;
  }

  if (rfq.slippage > c.maxSlippage) {
    logger.warn(`[${rfq.sessionId}] quote::maxSlippage ❌ ${rfq.slippage} > ${c.maxSlippage}`);
    return { error: "mse", sessionId: rfq.sessionId, errorData: { type: "maxSlippageExceeded", slippage: rfq.slippage } };
  }

  if (rfq.outAmount == "0") {
    rfq.slippage = c.externalLiquiditySlippage; // 1% / 2 = 0.5% default slippage
  }

  if (isNativeAddress(rfq.inToken)) {
    logger.warn(`[${sessionId}]quoteAuction :: inToken is matic no quote`);
    return { ...rfq, error: "tns", sessionId, errorData: { nativeIn: "not supported" } };
  }

  //blocking IDIA token
  if (rfq.outToken == "0x0b15ddf19d47e6a86a56148fb4afffc6929bcb89" && Number(c.chainId) === 56) {
    logger.warn(`[${sessionId}]  quoteAuction :: inToken is BNB no quote`);
    return { error: "tb", sessionId, errorData: { outToken: "not supported" } };
  }

  if ((THENA_GOV_TOKENS.includes(rfq.inToken.toLowerCase()) || THENA_GOV_TOKENS.includes(rfq.outToken.toLowerCase())) && Number(c.chainId) === 56) {
    return { error: "nogov", sessionId, errorData: { thenaGovToken: "not supported" } };
  }

  if (
    (rfq.outToken.toLowerCase() == "0xe580074a10360404af3abfe2d524d5806d993ea3" || rfq.inToken.toLowerCase() == "0xe580074a10360404af3abfe2d524d5806d993ea3") &&
    Number(c.chainId) === 137
  ) {
    logger.warn(`[${sessionId}]  quoteAuction :: inToken is BNB no quote`);
    return { error: "napai", sessionId, errorData: { outToken: "pay not supported" } };
  }

  const inDollarValue = 0;//await getDollarValue(c, rfq.inAmount, rfq.inToken);

  if (inDollarValue < c.minDollarValueThreshold) {
    logger.warn(`⚠️ quote::dollarValueToLow[${rfq.sessionId}]:  💵 ${inDollarValue} < ${c.minDollarValueThreshold}`);
    return { error: "ldv", sessionId, errorData: { minDollarValue: `dollar value below threshold ${inDollarValue}` } };
  }

  logger.verbose(`[${sessionId}]:quoteAuction, rfq: ${JSON.stringify(rfq)}`);

  const arr: Promise<Quote>[] = [];

  for (let solver in c.exchanges) {
    //@ts-ignore
    const isSolverDisabled = c.exchanges.hasOwnProperty(solver) ? c.exchanges[solver]?.disabled : false;
    const isSolverForced = c.forceSolvers && c.forceSolvers.includes(solver);

    if ((c.forceSolvers && !isSolverForced) || (isSolverDisabled && !isSolverForced)) {
      continue;
    }
    let extraData = quoteExtraData(c, solver, rfq) || null;
    arr.push(
      CallQuoteWithTimeout(
        () => {
          //@ts-ignore
          return quote(c, rfq, c.exchanges[solver], false, true, extraData);
        },
        solver,
        rfq,
        c.auctionTimeout,
      ),
    );
  }

  let results: Quote[] = [];
  results = await Promise.all(arr);
  logger.debug(`quoteAuction[${sessionId}]::results: ${JSON.stringify(results)}`);

  const uiOutAmount = bn(rfq.outAmount || 0);

  // filter out errors and rates that are too high over 50%
  const quotes = results.filter((r) => {
    // filter out errors , no outAmount == 0 or simulateAmountOut == 0
    if (r.error || !r.outAmount || !r.simulateAmountOut) return false;

    // skip check when 0 or -1 , 0 means no quote from UI, -1 means race condition
    if (uiOutAmount.eq(0) || uiOutAmount.eq(-1)) return true;

    // outAmount < gasCostOutputToken (gas cost is higher then outAmount)
    if (bn(r.outAmount).lt(bn(r.gasCostOutputToken!!))) {
      logger.warn(`⚠️⚠️⚠️⚠️ quote Amount is lower then gas cost ${r.outAmount} < ${r.gasCostOutputToken}`);
      return false;
    }

    // provider < UI*1.5
    if (!bn(r.outAmount).lt(uiOutAmount.multipliedBy(1.5))) {
      logger.warn(`⚠️⚠️⚠️⚠️ quote Amount is higher then UI quote by 50%`);
      logger.warn(`⚠️⚠️⚠️⚠️ ${r.outAmount.toString()} > ${uiOutAmount.toString()}`);
    }

    return bn(r.outAmount).lt(uiOutAmount.multipliedBy(1.5));
  });

  const updatedErrorTypes = logAuctionErrors(results, uiOutAmount);
  const auctionData = await logAuction(c, rfq, results);

  if (quotes.length === 0) {
    logger.warn(`❞⚠️ quoteAuction[${sessionId}]::invalidResults No routes found: updatedErrorTypes=${JSON.stringify(updatedErrorTypes)}`);
    if (Object.keys(updatedErrorTypes).length == 0) {
      return { error: "quoteNoResults", sessionId, errorData: updatedErrorTypes, quotes };
    }
    return { error: "quoteAuctionFailed", sessionId, errorData: updatedErrorTypes };
  }

  const outTokenDecimals = isNativeAddress(rfq.outToken) ? 18 : (await tryFetchErc20(c, rfq.outToken))?.decimals;

  quotes.sort((a, b) => {
    const aPrice = bn(a.outAmount);
    const bPrice = bn(b.outAmount);
    logger.warn(`[${sessionId}] ❞❞ ⚡️ ${b.exchange} => ${fmt(a, outTokenDecimals).toFixed(7)} | ${a.exchange} score: ${a.score} | ${a.exchange}`);
    return bPrice.gt(aPrice) ? 1 : -1;
  });

  let best = quotes[0];

  logger.info(`[${sessionId}] quoteAuction()=> 🏆 best rate is ${fmt(best, outTokenDecimals).toFixed(7)} by ${best.exchange} score: ${best.score}`);

  let rawData: any = [];
  quotes.forEach((element: any) => {
    rawData.push({
      exchange: element.exchange,
      rawData: element?.raw?.route?.rawData ?? null,
    });
  });

  redisWrapper.publish("rfq", JSON.stringify({ ...best, ...{ sessionId, auctionData, exchange: best.exchange, ...rfq } }));

  return {
    ...best,
    ...{ sessionId, auctionData, exchange: best.exchange, updatedErrorTypes, rawData: rawData },
    quotes,
    inTokenUsd: (await getTokenPrice(c, rfq.inToken)).priceUsd,
    outTokenUsd: (await getTokenPrice(c, rfq.outToken)).priceUsd,
  };
}

function quoteExtraData(c: CommonConfig, solver: string, rfq: RFQ) {
  let extraData = null;
  //@ts-ignore
  if (c.exchanges[solver].extraDynamic) {
    //@ts-ignore
    extraData = c.exchanges[solver].extraDynamic(rfq);
  }
  return extraData;
}

export async function swapAuction(c: CommonConfig, rfq: SignedQuote & { slippage: number }): Promise<AuctionResult | ErrorObj> {
  const sessionId = rfq.sessionId || "-1";

  if (!rfq.slippage) {
    rfq.slippage = c.defaultSlippage;
  }

  logger.verbose(`[${sessionId}]::swapAuction rfq: ${JSON.stringify(rfq)}`);

  const arr = [];
  for (let solver in c.exchanges) {
    // if (c.forceSolvers && !c.forceSolvers.includes(solver)) {
    //   continue;
    // }

    //last look solvers
    if (solver === "manifold") continue;
    if (solver === "jst") continue;

    arr.push(
      CallQuoteWithTimeout(
        () => {
          //@ts-ignore
          return quote(c, rfq, c.exchanges[solver], true, false);
        },
        solver,
        rfq,
        c.auctionWithDataTimeout,
      ),
    );
  }

  let results: any[] = [];
  results = await Promise.allSettled(arr);
  results = results.map((r) => r.value);
  logger.debug(`swapAuction[${sessionId}]::results: ${JSON.stringify(results)}`);

  const uiOutAmount = bn(rfq.outAmount || 0);

  // filter out errors and rates that are too high over 50%
  const quotes = results.filter((r) => {
    if (r.error || !r.outAmount) return false;
    // skip check when 0
    if (uiOutAmount.eq(0) || uiOutAmount.eq(-1)) {
      return true;
    }

    // provider < UI*1.5
    if (!bn(r.outAmount).lt(uiOutAmount.multipliedBy(1.5))) {
      logger.warn(`⚠️⚠️⚠️⚠️ quote Amount is higher then UI quote by 50%`);
      logger.warn(`⚠️⚠️⚠️⚠️ ${r.outAmount.toString()} > ${uiOutAmount.toString()}`);
    }

    return bn(r.outAmount).lt(uiOutAmount.multipliedBy(1.5));
  });

  let errorTypes = {};

  const updatedErrorTypes = results.reduce((acc, { error, outAmount, exchange }) => {
    if (error || !outAmount) {
      acc[exchange] = error;
    } else if (!outAmount) {
      acc[exchange] = "ZeroAmount";
    }

    return acc;
  }, errorTypes);

  if (quotes.length === 0) {
    logger.warn(`❞⚠️ swapAuction[${sessionId}]::invalidResults No routes found: updatedErrorTypes=${JSON.stringify(updatedErrorTypes)}`);
    if (Object.keys(updatedErrorTypes).length == 0) return { error: "noResults", sessionId };
    return { error: "swapAuctionFailed", sessionId, updatedErrorTypes };
  }

  const prices = quotes.map((r) => bn(r.outAmount).plus(r.gasCostOutputToken));
  logger.verbose(`[${sessionId}] prices: ${prices}`);

  const inToken = await tryFetchErc20(c, rfq.inToken);
  const outToken = await tryFetchErc20(c, rfq.outToken);
  const outTokenDecimals = isNativeAddress(rfq.outToken) ? 18 : outToken.decimals;

  const auctionData: {
    exchange: string;
    amountOut: string;
    amountOutF: string;
    simulateAmountOut: string;
    elapsed: number;
    swapData: string;
  }[] = [];

  // const simulates = await Promise.all(
  //   quotes.map((r) => {
  //     return simulateQuote(c, r);
  //   }),
  // );

  quotes.forEach((r) => {
    const outAmount = fmt(r, outTokenDecimals);
    logger.info(
      `[${sessionId}] #️⃣ ${bn(rfq.inAmount).dividedBy(10 ** inToken.decimals)} ${inToken.symbol}  🥇${r.exchange}: ${outAmount} |⛽️ ${bn(r.gasCostOutputToken)
        .dividedBy(10 ** outTokenDecimals)
        .toFixed(4)} ${outToken.symbol} | ⛽️ [${r.gasCostOutputToken}]${outToken.symbol} | ⛽️Units:${r.gasUnits.toFixed(0)}`,
    );

    auctionData.push({
      exchange: r.exchange,
      amountOutF: outAmount.toFixed(7),
      amountOut: r.outAmount,
      elapsed: r.elapsed / 1000,
      simulateAmountOut: r.simulateAmountOut,
      swapData: r.data,
    });
  });

  //sort by score
  quotes.sort((a, b) => {
    logger.warn(
      `[${sessionId}] 🔄 ⚡️ ${a.exchange} => ${fmt(a, outTokenDecimals).toFixed(7)} | ${a.exchange} score: ${a.score} | ${b.exchange} | a.score ${a.score}| b.score:${b.score} `,
    );
    return b.score - a.score;
  });

  let best = quotes[0];

  logger.info(`[${sessionId}] 🔄 SwapAuction 🏆 best rate is ${fmt(best, outTokenDecimals).toFixed(7)} by ${best.exchange} score: ${best.score}`);

  let rawData: any = [];
  quotes.forEach((element: any) => {
    rawData.push({
      exchange: element.exchange,
      rawData: element?.raw?.route?.rawData ?? null,
    });
  });

  //
  if (c.chainId === 137) {
    const dutchPrice = getDutchPrice(c, rfq.serializedOrder);
    logger.verbose(`[${sessionId}] 👀 auctionLastLook dutchPrice: ${dutchPrice}`);
    let lastLookQuote = await auctionLastLook(c, rfq, "manifold", best.outAmount);
    if (!lastLookQuote.error) {
      logger.warn(`[${sessionId}] ✅✅✅✅ auctionLastLook best rate is ${fmt(lastLookQuote, outTokenDecimals).toFixed(7)} by ${lastLookQuote.exchange} `);
      best = lastLookQuote;
    }
    logger.info(`[${sessionId}] auctionLastLook best rate is ${fmt(best, outTokenDecimals).toFixed(7)} by ${best.exchange} score: ${best.score}`);
  }

  return { ...best, ...{ sessionId, auctionData, exchange: best.exchange, updatedErrorTypes, rawData: rawData }, quotes };
}

function auctionLastLook(c: CommonConfig, rfq: RFQ & { outAmount: string; slippage: number }, solver: string, baseLinePrice: string) {
  logger.info(`auctionLastLook::solver: ${solver} baseLinePrice: ${baseLinePrice}`);
  // @ts-ignore
  return quote(c, rfq, c.exchanges[solver], true, false);
}

function fmt(r: any, decimals = 18) {
  const outAmount = r.outAmount || "0";
  return bn(outAmount).dividedBy(10 ** decimals);
}

function CallQuoteWithTimeout(fn: Function, solver: string, rfq: RFQ, timeout: number) {
  let s = Date.now();
  return new Promise<Quote>((resolve) => {
    let id = setTimeout(() => {
      logger.warn(`[${rfq.sessionId!!}] 🐌 ${solver} auction::timeout  ⏰ ${timeout / 1000}s`);
      resolve({
        ...rfq,
        sessionId: rfq.sessionId!!,
        outAmount: "0",
        minAmountOut: "0",
        estimateOutAmount: "0",
        gasCostOutputToken: "0",
        exchange: solver,
        to: "",
        data: "",
        permitData: "",
        serializedOrder: "",
        raw: "",
        solverId: "",
        error: "timeout",
        elapsed: timeout,
        outTokenPrice: 0,
        simulateAmountOut: "0",
      });
    }, timeout);

    fn().then((res: Quote) => {
      logger.warn(`auction::Quote ✅ [${solver}] ✅ amountOut:${res.outAmount} simulatedOutAmount:${res.simulateAmountOut}`, (Date.now() - s) / 1000);

      clearTimeout(id);
      resolve(res);
    }, resolve);
  });
}

async function logAuctionErrors(results: any[], uiOutAmount: BN) {
  let errorTypes = {};

  const updatedErrorTypes = results.reduce((acc, { error, outAmount, exchange }) => {
    if (error || !outAmount) acc[exchange] = error;
    else if (!outAmount) acc[exchange] = "ZeroAmount";
    else if (!bn(outAmount).lt(uiOutAmount.multipliedBy(1.5))) acc[exchange] = "OutOfRange";

    return acc;
  }, errorTypes);
  return updatedErrorTypes;
}

async function logAuction(c: CommonConfig, rfq: RFQ, quotes: Quote[]) {
  const prices = quotes.map((r) => bn(r.outAmount).plus(r.gasCostOutputToken!!));
  logger.verbose(`[${rfq.sessionId}] prices: ${prices}`);

  const inToken = await tryFetchErc20(c, rfq.inToken);
  const outToken = await tryFetchErc20(c, rfq.outToken);
  const outTokenDecimals = isNativeAddress(rfq.outToken) ? 18 : outToken.decimals;

  const auctionData: {
    exchange: string;
    gasCost: string;
    gasUnits: string;
    gasCostF: string;
    gasCostUsd: number;
    amountOut: string;
    amountOutF: string;
    elapsed: number;
    simulateAmountOut: string;
  }[] = [];

  quotes.forEach((r) => {
    const outAmount = fmt(r, outTokenDecimals);
    try {
      logger.info(
        `[${rfq.sessionId}] #️⃣ ${bn(rfq.inAmount).dividedBy(10 ** inToken.decimals)} ${inToken.symbol}  🥇${r.exchange}: ${outAmount} |⛽️ ${bn(r.gasCostOutputToken!!)
          .dividedBy(10 ** outTokenDecimals)
          .toFixed(4)} ${outToken.symbol} $[${outTokenDecimals}] [${r.gasCostOutputToken}] | ⛽️Units:${r.gasUnits!!.toFixed(0)}`,
      );
    } catch (e) { }

    auctionData.push({
      exchange: r.exchange,
      amountOutF: outAmount.toFixed(7),
      amountOut: r.outAmount,
      gasCost: r.gasCostOutputToken!!,
      gasCostF: bn(r.gasCostOutputToken!!)
        .dividedBy(10 ** outTokenDecimals)
        .toFixed(4),
      gasCostUsd: r.gasCostUsd!!,
      gasUnits: r.gasUnits ? r.gasUnits!!.toString() : "0",
      elapsed: r.elapsed / 1000,
      simulateAmountOut: r.simulateAmountOut,
    });
  });

  return auctionData;
}