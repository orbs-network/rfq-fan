import { Config } from "./config";
import BN from "bignumber.js";
import { OrderResult, RFQ } from "./types";
import { contract, eqIgnoreCase, maxUint256, web3, zeroAddress } from "@defi.org/web3-candies";
import { DutchOrder, DutchOrderBuilder } from "@uniswap/uniswapx-sdk";
import _ from "lodash";
import logger from "./logger";
import { ISolver } from "./solver";
import { EXECUTOR_ABI, PERMIT2 } from "./consts";

export async function createOrder(config: Config, rfq: RFQ & { slippage: number }, outAmountSolver: BN, gasOutAmount: BN, solver?: ISolver): Promise<OrderResult> {
  const inAmount = BN(rfq.inAmount).toFixed(0);
  let uiAmount = BN(rfq.outAmount || "0");

  let isExternalLiquidity = false;
  if (uiAmount.eq("0") || uiAmount.eq("-1")) {
    isExternalLiquidity = true;
    // uiAmount = solverAmount - external_slippage - gas
    uiAmount = outAmountSolver.times(BN(100).minus(config.externalLiquiditySlippage)).div(100).minus(gasOutAmount);

    logger.warn({
      type: "external Liquidity",
      rfqOutAmount: "rfq.outAmount",
      externalLiquiditySlippage: config.externalLiquiditySlippage,
      uiAmount: uiAmount.toFixed(0),
      outAmountSolver: outAmountSolver.toFixed(0),
      gasOutAmount: gasOutAmount.toFixed(0),
    });
  }

  // UI Price + slippage - gas cost
  let referencePrice = uiAmount.div(BN(100).minus(rfq.slippage).div(100)).minus(gasOutAmount).toFixed(0);

  if (isExternalLiquidity) {
    // if the user is using external liquidity, ui price is the reference price ( Solver Price - Slippage )
    referencePrice = uiAmount.toFixed(0);
  }

  let savingOutput = undefined;

  if (uiAmount && BN(outAmountSolver!!).gt(uiAmount) && !isExternalLiquidity) {
    // 10% of the saving is back to to the user
    let savingsRefund = BN(outAmountSolver).minus(uiAmount).times(0.1).toFixed(0);

    logger.warn(
      `[${rfq.sessionId
      }] ⚠️savingsCashBack ${savingsRefund.toString()}  referencePrice:${referencePrice.toString()} outAmountSolver: ${outAmountSolver.toString()} uiAmount:${uiAmount.toString()} gasOutAmount:${gasOutAmount.toString()}`,
    );
    savingOutput = {
      token: rfq.outToken,
      recipient: rfq.user,
      startAmount: savingsRefund,
      endAmount: "1", // Some tokens might fail for transfer 0 , so chainging to 1
    };
  }
  const lhSlippage = (100 - Math.max(rfq.slippage, 0.1)) * 0.01; // 0.1% default slippage 99.95

  const outAmountAfterGas = outAmountSolver.minus(gasOutAmount); // 0.1% default slippage
  if (outAmountAfterGas.lt(0)) {
    logger.warn(`[${rfq.sessionId}] ⚠️outAmountAfterGas < 0`, {
      outAmount: outAmountSolver.toFixed(0),
      //@ts-ignore
      exchange: solver.name,
      gasOutAmount: gasOutAmount.toFixed(0),
      lhSlippage: lhSlippage,
    });
    throw new Error("outAmountAfterGas < 0");
  }

  const startAmountSavings = outAmountAfterGas.times(1 - lhSlippage + 1).toFixed(0); // (1 - 0.99) + 1 =1.01
  const endAmountSavings = outAmountAfterGas.toFixed(0);

  const { inToken, outToken } = rfq;

  const now = Math.round(Date.now() / 1000);
  const deadline = now + config.orderDuration;
  const decayStartTime = now + config.decayStartTime; // start decay after 10 seconds
  const decayEndTime = decayStartTime + config.decayDurationSeconds; // decay can be deadline ,

  if (!rfq.user) {
    logger.warn("rfq.user is missing");
    logger.info({
      reactor: config.reactor,
      lhSlippage: lhSlippage,
      exclusiveFiller: config.executor,
      exclusivityOverrideBps: "0",
      additionalValidationContract: config.executor,
      additionalValidationData: "0x",
      swapper: rfq.user,
      nonce: Date.now(), // use Nonce manager from the sdk ...
      deadline,
      decayStartTime,
      decayEndTime,
      input: {
        token: inToken,
        startAmount: inAmount,
        endAmount: inAmount,
      },
      outputs: [
        {
          token: outToken,
          recipient: config.treasury,
          startAmount: gasOutAmount.toFixed(0),
          endAmount: gasOutAmount.toFixed(0),
        },
        {
          token: outToken,
          recipient: rfq.user,
          startAmount: startAmountSavings,
          endAmount: endAmountSavings,
        },
      ],
    });
  }

  const orderSkeleton = {
    reactor: config.reactor,
    exclusiveFiller: config.executor,
    exclusivityOverrideBps: "0",
    additionalValidationContract: config.executor,
    additionalValidationData: "0x",
    swapper: rfq.user,
    nonce: now.toString(),
    deadline,
    decayStartTime,
    decayEndTime,
    input: {
      token: inToken,
      startAmount: inAmount,
      endAmount: inAmount,
    },
    outputs: [
      {
        token: outToken,
        recipient: config.treasury, // gas money
        startAmount: gasOutAmount.toFixed(0),
        endAmount: gasOutAmount.toFixed(0),
      },
      {
        token: outToken,
        recipient: rfq.user,
        startAmount: referencePrice, // linear ui Amount (initial estimate)
        endAmount: referencePrice,
      },
    ],
  };

  if (savingOutput) {
    orderSkeleton.outputs.push(savingOutput);
  }

  const order = DutchOrder.fromJSON(orderSkeleton, config.chainId, PERMIT2);

  let lhPrice = outAmountSolver.times(lhSlippage);
  if (isExternalLiquidity) {
    lhPrice = lhPrice.minus(gasOutAmount);
  }
  return {
    userOutAmount: lhPrice,
    userMinOutAmount: lhPrice,
    gasOutAmount,
    permitData: order.permitData(),
    serializedOrder: order.serialize(),
  };
}

export function execute(
  config: Config,
  params: {
    serializedOrder: string;
    signature: string;
    swaps: any[];
  },
) {
  const order = DutchOrder.parse(params.serializedOrder, config.chainId, PERMIT2);
  const json = order.toJSON();
  const signer = order.getSigner(params.signature);
  if (
    !eqIgnoreCase(config.reactor, json.reactor) ||
    !eqIgnoreCase(config.executor, json.exclusiveFiller) ||
    !eqIgnoreCase(config.executor, json.additionalValidationContract) ||
    !eqIgnoreCase(signer, json.swapper)
  ) {
    logger.warn("signedOrder  !== order.getSigner(params.signature)", json.swapper);
    logger.warn({
      reactor: config.reactor,
      "json.reactor": json.reactor,
      executor: config.executor,
      "config.executor": config.executor,
      signer,
      "json.swapper": json.swapper,
      signature: params.signature,
    });
    throw new Error("🧐 " + JSON.stringify(json) + " !== signer:" + signer);
  }

  let tokens = [json.input.token];
  json.outputs.forEach((o) => {
    if (!eqIgnoreCase(o.token, zeroAddress)) {
      tokens.push(o.token);
    }
  });
  tokens = _.uniq(tokens);

  const calls = _.flatMap(params.swaps, (s) => {
    if (s.exchange == "Paraswap") {
      const approveTokenProxy = [
        json.input.token, //USDC
        `0x095ea7b3000000000000000000000000${s.solver.tokenProxyAddress}ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`, // approve(proxy, maxUint256)
      ];
      const callParaswap = [s.to, s.data]; // paraswap.call
      return [approveTokenProxy, callParaswap];
    } else {
      const approveToken = [
        json.input.token,
        web3().eth.abi.encodeFunctionCall(
          {
            inputs: [
              {
                internalType: "address",
                name: "spender",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "amount",
                type: "uint256",
              },
            ],
            name: "approve",
            outputs: [
              {
                internalType: "bool",
                name: "",
                type: "bool",
              },
            ],
            stateMutability: "nonpayable",
            type: "function",
          },
          [s.to, maxUint256],
        ),
      ];
      const callExchange = [s.to, s.data];
      return [approveToken, callExchange];
    }
  });

  return contract(EXECUTOR_ABI as any, config.executor).methods.execute([[params.serializedOrder, params.signature]], calls, config.feeAddress, tokens);
}