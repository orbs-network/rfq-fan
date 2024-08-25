import { bn, isNativeAddress } from "@defi.org/web3-candies";
import { Quote, QuoteLite, RFQ } from "./types";
import { createOrder } from "./order";
import BN from "bignumber.js";

import { CommonConfig } from "./config";
import logger from "./logger";
//import { getFastGasPrice } from "./wallet-manager";
import { tryFetchErc20 } from "./w3";
import { getTokenPrice } from "./price-oracle";
import redisWrapper, { solverFailuresKey, solverSuccessKey } from "./redis";
import { dumpFetchAsCurl, rfqToKey } from "./utils";
import { ISolver } from "./solver";
//import { getDollarValue } from "./bi";

export function quoteError(error: string, start: number, rfq: RFQ, solverName: string): Quote {
    return {
        ...rfq,
        sessionId: rfq.sessionId || "",
        exchange: solverName,
        error,
        outAmount: "0",
        minAmountOut: "0",
        estimateOutAmount: "0",
        permitData: "",
        serializedOrder: "",
        data: "",
        to: "",
        raw: "",
        solverId: "",
        fails: 0,
        elapsed: Date.now() - start,
        dollarValue: 0,
        gasCostUsd: 0,
        outTokenPrice: 0,
        simulateAmountOut: "0",
    };
}

export async function quote(config: CommonConfig, rfq: RFQ, solver: ISolver, quoteWithData: boolean, reduceGasCost = true, pathFinderParams = null): Promise<Quote> {
    const start = Date.now();
    const [q, outToken] = await Promise.all([
        callExchangeQuote(config, rfq, solver, quoteWithData, pathFinderParams),
        isNativeAddress(rfq.outToken) ? Promise.resolve(config.native) : tryFetchErc20(config, rfq.outToken),
    ]);

    if (q.error) {
        return quoteError(q.error, start, rfq, solver.name);
    }
    rfq.outToken = outToken.address;

    let gasCostOutputToken: BN = bn(0);
    let gasUnits: BN = bn(0);
    let outAmount = BN(q.result[0].route.amountOut).toFixed(0);
    let simulatedOutAmount = BN(q.result[0]?.simulatedSwapResult?.outAmount || "0");

    if (reduceGasCost) {
        gasUnits = BN(extractGasUnits(q, solver.name)).plus(config.baseGasCost);

        const gas: any = 0;//await getFastGasPrice(config);
        logger.warn(`[${rfq.sessionId}] quote::gasUnits ${gasUnits.toFixed(0)} gas.maxFeePerGas: ${gas.maxFeePerGas}`);

        let gasCostNative = bn(gasUnits).multipliedBy(gas.maxFeePerGas);
        logger.verbose(`[${rfq.sessionId}]`, "gasCostNative", { gasCostNative: gasCostNative.toString(), gasUnits: gasUnits.toString(), gas: gas.maxFeePerGas.toString() });

        if (solver.name === "rango") {
            // gasUnits are already in native plus baseGasCost
            gasCostNative = gasUnits.plus(bn(gas.maxFeePerGas).multipliedBy(config.baseGasCost));
        }

        if (solver.name === "orion") {
            //@ts-ignore
            gasCostNative = BN(config.exchanges["orion"].swapGasUnits).multipliedBy(config.baseGasCost);
        }

        if (solver.name === "magpie") {
            //@ts-ignore
            gasCostNative = BN(config.exchanges["magpie"].swapGasUnits).multipliedBy(config.baseGasCost);
        }

        // if (config.shouldIncludeL1GasPrice) {
        //     try {
        //         //const web3 = await getWeb3(config);
        //         const l1GasPrice = await estimateL1GasPrice();
        //         const l1GasCostWei = calculateL1GasCost(config.l1GasCalcTx, l1GasPrice);
        //         gasCostNative = gasCostNative.plus(l1GasCostWei);
        //     } catch (e) {
        //         logger.warn("not deducting L1 Fees ", e);
        //     }
        // }

        if (config.customGasFactor) {
            gasCostNative = gasCostNative.multipliedBy(config.customGasFactor);
        }

        logger.info(`[${rfq.sessionId}] [${solver}] ⛽️ gasPriceInNative: ${gasCostNative.dividedBy(1e18).toFixed(4)} gasUnits: ${gasUnits.toFixed(0)}`);
        if (config.fixedGasCost) {
            gasCostNative = bn(config.fixedGasCost);
        }
        gasCostOutputToken = await gasToOutputToken(config, gasCostNative, rfq.outToken, solver, rfq.user, rfq.sessionId!!);
        logger.debug(`[${rfq.sessionId}] [${solver}]⛽️ gasCostOutputToken:[${rfq.sessionId}] gasCostOutputToken: ${gasCostOutputToken}`);

        if (gasCostOutputToken.eq(0)) {
            logger.warn(`quote::gasCostOutputTokenZero[${rfq.sessionId}]: ${gasCostOutputToken.toFixed(0)}`);
            return quoteError("gasCostOutputTokenZero", start, rfq, solver.name);
        } // 20/2000  > 0.01

        if (gasCostOutputToken.dividedBy(outAmount).gt(config.outAmountGasThreshold)) {
            logger.warn(
                `quote::gasCostToHigh[${rfq.sessionId}]: ⚠️⚠️⚠️ ⛽️ ${gasCostOutputToken.toFixed(0)} / ${outAmount} > ${config.outAmountGasThreshold} [${gasCostOutputToken
                    .dividedBy(outAmount)
                    .toFixed(4)}]`,
            );
            return quoteError("gasCostToHigh", start, rfq, solver.name);
        }
    }

    logger.warn(
        `solver.name:${solver.name} sessionId: ${rfq.sessionId} quote::outAmount: ${outAmount} simulatedOutAmount: ${simulatedOutAmount.toFixed(0)} outToken.symbol: ${outToken.symbol
        }`,
    );

    let estimateOutAmount = "-1";
    const data = q.result[0].fillData ? q.result[0].fillData : { to: "", data: "" };

    let score = -1;
    score = await solver.getScore();
    const simulateAmountOut = q.result[0]?.simulatedSwapResult?.outAmount || "0";
    // const dollarValue = await getDollarValue(config, outAmount, rfq.outToken);
    // const gasCostUsd = await getDollarValue(config, gasCostOutputToken.toString(), rfq.outToken);
    const outTokenPrice = 0 //await getDollarValue(config, "1", rfq.outToken);
    try {
        let coFn = config.orderGenerator || createOrder;
        const { serializedOrder, permitData, userOutAmount, userMinOutAmount } = await coFn(config, rfq as any, BN(outAmount), gasCostOutputToken, solver);

        outAmount = userOutAmount.toFixed(0);
        return {
            ...rfq,
            exchange: solver.name,
            outAmount,
            minAmountOut: userMinOutAmount?.toFixed(0) || "0",
            estimateOutAmount,
            to: data.to,
            solverId: data.solverId,
            data: data.data,
            permitData,
            serializedOrder,
            raw: {
                route: q.result[0].route,
            },
            gasCostOutputToken: gasCostOutputToken.toFixed(0),
            gasUnits: gasUnits,
            elapsed: Date.now() - start,
            fails: score,
            //@ts-ignore
            failsKey: rfqToKey(rfq, solver),
            dollarValue: 0,
            gasCostUsd: 0,
            outTokenPrice,
            simulateAmountOut: simulateAmountOut,
        };
    } catch (e) {
        logger.warn(`⚠️ quote::createOrder:error::[${solver}]::[${rfq.sessionId}]: ${e} [${gasCostOutputToken.toFixed(0)}]`, { gasCostOutputToken: gasCostOutputToken.toFixed(0) });
        return {
            exchange: solver.name,
            error: `quote::createOrder:error[${rfq.sessionId}]: ${e}`,
            outAmount,
            minAmountOut: outAmount,
            estimateOutAmount,
            to: "",
            data: "",
            solverId: "",
            raw: JSON.stringify(e),
            permitData: "",
            serializedOrder: "",
            elapsed: Date.now() - start,
            sessionId: rfq.sessionId || "",
            ...rfq,
            gasCostUsd: 0,
            gasCostOutputToken: gasCostOutputToken.toFixed(4),
            outTokenPrice,
            simulateAmountOut: "0",
        };
    }
}

export async function quoteLite(config: CommonConfig, rfq: RFQ, solver: ISolver, pathFinderParams = null): Promise<QuoteLite> {
    const start = Date.now();
    const [q, outToken] = await Promise.all([
        callExchangeQuote(config, rfq, solver, true, pathFinderParams),
        isNativeAddress(rfq.outToken) ? Promise.resolve(config.native) : tryFetchErc20(config, rfq.outToken),
    ]);

    if (q.error) {
        return quoteError(q.error, start, rfq, solver.name);
    }
    rfq.outToken = outToken.address;

    let outAmount = BN(q.result[0].route.amountOut).toFixed(0);
    logger.debug(`Quote Lite
  sessionId: ${rfq.sessionId}
  quote::outAmount: ${outAmount}
  outToken.symbol: ${outToken.symbol}
  outToken.address: ${outToken.address}`);

    const data = q.result[0].fillData ? q.result[0].fillData : { to: "", data: "" };

    let score = -1;
    score = await solver.getScore();
    const dollarValue = 0//await getDollarValue(config, outAmount, rfq.outToken);
    const outTokenPrice = 0//await getDollarValue(config, "1", rfq.outToken);
    try {
        return {
            ...rfq,
            sessionId: rfq.sessionId || "",
            exchange: solver.name,
            outAmount,
            to: data.to,
            solverId: data.solverId,
            data: data.data,
            raw: {
                route: q.result[0].route,
            },
            elapsed: Date.now() - start,
            //@ts-ignore
            dollarValue,
            outTokenPrice,
        };
    } catch (e) {
        logger.warn(`⚠️ quotelite:error::[${solver}]::[${rfq.sessionId}]: ${e} `);
        return {
            sessionId: rfq.sessionId || "",
            exchange: solver.name,
            error: `quote::createOrder:error[${rfq.sessionId}]: ${e}`,
            outAmount,
            to: "",
            data: "",
            solverId: "",
            raw: JSON.stringify(e),
            elapsed: Date.now() - start,
            ...rfq,
            outTokenPrice,
        };
    }
}

async function callExchangeQuote(config: CommonConfig, rfq: RFQ & { slippage?: number }, solver: ISolver, quoteWithData: boolean, pathFinderParams?: any) {
    const now = Date.now();

    //@ts-ignore
    let extraSolverParams = solver.extra || {};
    //@ts-ignore
    if (solver.name === "manifold" && solver.extraDynamic) {
        //@ts-ignore
        let extraFn = solver.extraDynamic || function () { };
        const priceWithSlippage = bn(rfq.outAmount!!).times(1 + rfq.slippage!! * 0.01);
        extraSolverParams = extraFn(priceWithSlippage.times(0.98).toFixed(0));
    }

    const bodyStr = JSON.stringify({
        dataStr: JSON.stringify({
            network: config.chainName.toLowerCase(),
            dex: config.name.toLowerCase(),
            filler: config.executor,
            pathFinderParams: pathFinderParams || {},
            orders: [
                {
                    id: rfq.user + "-" + rfq.inToken + "-" + rfq.outToken + "-" + rfq.inAmount,
                    srcToken: rfq.inToken,
                    amountIn: rfq.inAmount,
                    dstToken: rfq.outToken,
                    user: rfq.user,
                },
            ],
        }),
        sessionId: rfq.sessionId,
    });

    let url = solver.url;
    //  is Quote && useLiteQuote || is Offchain solver use  http:/quote
    if ((!quoteWithData && config.useLiteQuote) || (solver.solverType === "Offchain" && !quoteWithData)) {
        url = solver.url.replace("getBids", "quote");
    }

    dumpFetchAsCurl(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-KEY": config.fillerApiKey,
        },
        body: bodyStr,
    });

    let req = fetch(`${url}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-KEY": config.fillerApiKey,
        },
        body: bodyStr,
    });
    let res: Response;
    try {
        res = await req;
    } catch (e) {
        logger.warn(`fetch failed[${rfq.sessionId}]: `, e);
        return {
            error: "fetch Failed",
            isError: true,
            noResults: true,
            errorDetails: e,
        };
    }

    const data = await res!.json();

    if (res!.status !== 200 || !data || data.error || !data.result || !data.result.length || !data.result[0]?.success) {
        logger.warn(`[${rfq.sessionId}] callExchangeQuote::error [${solver.name}] => ${data.error} ${data.errorMessage} message:${data?.result[0].errorMessage}`);
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
    logger.warn(
        `[${rfq.sessionId}] Quote:${quoteWithData ? "🐢" : "🐇"} ⏱ [${(Date.now() - now) / 1000 + "s"}]  [${solver.name}] => minAmountOut: ${data.result[0]?.route
            ?.amountOut} solverId: ${data.result[0]?.solverId}`,
    );

    return data;
}

async function gasToOutputToken(config: CommonConfig, gasCostNative: BN, outToken: string, solver: ISolver, user: string, sessionId: string) {
    logger.debug(
        `gasToOutputToken[${sessionId}] <${solver}> ==> outToken: ${outToken} exchange: ${solver} user: ${user} gasCostNative: ${gasCostNative.dividedBy("1e18").toFixed(0)} `,
    );

    try {
        if (config.wToken.address.toLowerCase() == outToken.toLowerCase() || isNativeAddress(outToken)) {
            return gasCostNative;
        }

        const outTokenPrice = await getTokenPrice(config, outToken);
        const nativeTokenPrice = await getTokenPrice(config, config.wToken.address);
        const outTokenDecimals = (await tryFetchErc20(config, outToken)).decimals;

        const gasCostOutputToken = gasCostNative
            .multipliedBy(nativeTokenPrice.priceUsd)
            .dividedBy(outTokenPrice.priceUsd)
            .dividedBy(10 ** 18)
            .multipliedBy(10 ** outTokenDecimals);

        logger.debug(
            `gasToOutputToken[${sessionId}] ==> gasCostNative:${gasCostNative.toFixed(0)}  * ${nativeTokenPrice.priceNative} * ${outTokenPrice.priceNative
            } /  =  gasCostOutputToken: ${gasCostOutputToken.toFixed(4)}`,
        );
        return gasCostOutputToken;
    } catch (e) {
        logger.warn(`gasToOutputToken::error:[${sessionId}]:[${solver}]`);
        return gasToOutputTokenFallback({ config, gasCost: gasCostNative, outToken, solver, user, sessionId });
    }
}

async function gasToOutputTokenFallback(params: { config: CommonConfig; gasCost: BN; outToken: string; solver: ISolver; user: string; sessionId: string }) {
    logger.warn(`⚠️ gasToOutputTokenFallback:[${params.sessionId}]:[${params.solver}]`);
    let { config, gasCost, outToken, solver, user, sessionId } = params;
    if (solver.name === "rango") {
        //@ts-ignore
        solver = config.exchanges["paraswap"];
    }

    const nativeToOutputQuote = await callExchangeQuote(
        config,
        {
            inToken: config.wToken.address,
            inAmount: gasCost.toFixed(0),
            outToken: outToken,
            user,
            sessionId: sessionId,
        },
        solver,
        false,
    );

    if (nativeToOutputQuote?.isError) {
        logger.warn(`gasToOutputToken::nativeToOutputQuote:error:[${sessionId}]:[${solver}] ${JSON.stringify(nativeToOutputQuote)}`);
        return bn(0);
    }

    const outAmount = nativeToOutputQuote.result[0]?.route?.amountOut;
    logger.debug(`gasToOutputToken::nativeToOutputQuote:[${sessionId}]: ${JSON.stringify(nativeToOutputQuote)}`);
    logger.debug(`nativeToOutputQuote.outAmount:[${sessionId}]:[${solver}] ${outAmount}`);

    return BN(outAmount!);
}

function extractGasUnits(data: any, exchange: string) {
    if (exchange === "paraswap") {
        return data.result[0].route.rawData.gasCost;
    }

    if (exchange === "odos") {
        return data.result[0].route.rawData.gasEstimate;
    }
    if (exchange === "rango") {
        // fee[0] represents FOT tokens
        return data.result[0].route.rawData.fee[1].amount.toString();
    }
    if (exchange === "kyber") {
        return data.result[0].route.rawData.routeSummary.gas;
    }
    if (exchange === "bebop") {
        return data.result[0].route.solverGasUnits;
    }
    if (exchange === "manifold") {
        return 500_000; // TODO
    }

    if (exchange === "pancake") {
        return data.result[0].route.rawData.trade.gasEstimate;
    }

    if (exchange === "jst") {
        return 501_000; // TODO
    }
    if (exchange === "openocean") {
        return data?.result?.[0]?.route?.rawData?.data?.estimatedGas;
    }

    if (data.result && data.result[0].route?.solverGasUnits) {
        return data.result[0].route.solverGasUnits;
    }

    return null;
}

export async function getScore(chainId: number, solver: string, timeout = 100): Promise<number> {
    return new Promise(async (resolve, reject) => {
        let id = setTimeout(() => {
            logger.warn(`getFails::timeout`);
            resolve(-1);
        }, timeout);

        let score = -1;

        try {
            const fails = Number(await redisWrapper.get(solverFailuresKey(chainId, solver)));
            const success = Number(await redisWrapper.get(solverSuccessKey(chainId, solver)));
            score = 1 - fails / (fails + success);
            score = isNaN(score) ? 0 : score;
            logger.warn(` Score [${solver}] fails: ${fails} success: ${success} => score: ${score}`);
        } catch (e) { }
        clearTimeout(id);
        resolve(score);
    });
}