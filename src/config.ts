import { chainId, hasWeb3Instance, network, networks, setWeb3Instance, zeroAddress } from "@defi.org/web3-candies";
import _ from "lodash";
import Web3 from "web3";
import { EventUrl } from "./utils";
import { config } from "dotenv";
import querystring from "querystring";
import logger from "./logger";
import bscConfig from "../lib/liquidity-hub/script/input/56/config.json";
import lineaConfig from "../lib/liquidity-hub/script/input/59144/config.json";
import ethConfig from "../lib/liquidity-hub/script/input/1/config.json";
import blastConfig from "../lib/liquidity-hub/script/input/81457/config.json";
import polyConfig from "../lib/liquidity-hub/script/input/137/config.json";
import baseConfig from "../lib/liquidity-hub/script/input/8453/config.json";
import zkevmConfig from "../lib/liquidity-hub/script/input/1101/config.json";
import ftmConfig from "../lib/liquidity-hub/script/input/250/config.json";
import { ISolver, offChainSolver, OnchainSolver } from "./solver";
import { RFQ } from "./types";
import BN from "bignumber.js";
//import { createOrder as createOrderPosNegSlippage } from "./orders/fromPosToNegSlippage";

config({ path: "../../.env" });

const defaultValues = {
    PERMIT2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
    walletMangerUrl: "https://wallet-manager-1-a1922d7bed1d.herokuapp.com",
    version: 1,
    //
    useLiteQuote: false, // Use /getBids instead of /quote for RFQ (quote phase)
    orderDuration: 60 * 3, // deadline
    orderMaxTTL: 10, // If the order is older than this, it will be ignored
    decayStartTime: 10, // time to sign 7s-10s + auction time 4s
    decayDurationSeconds: 35, // endTime - startTime
    decayRetryDelay: 3000, // wait time between loops in the decay
    baseGasCost: 500_000,
    auctionTimeout: 6 * 1000,
    auctionWithDataTimeout: 8 * 1000,
    waitForTxMine: 20 * 1000,
    outAmountGasThreshold: 0.1, // 10% of the gas
    minDollarValueThreshold: 30, // 30 USD
    defaultSlippage: 0.1, // 0.1% when slippage in RFQ is not provided by the user
    externalLiquiditySlippage: 1, // 1% actually 0.5% slippage
    solverScoreTTL: 60 * 60, // 1 hour in seconds
    shouldIncludeL1GasPrice: false, // should calculate including l1 tx  (for roll-ups)
    l1GasCalcTx: "", // demo tx for l1 ga calculations
    estimateGasViaEthHistory: true,
    fee: {
        percent: 0.0, // by default, no protocol fee
        max: 0.0,
        recipient: zeroAddress,
    },
    authorizedAddressForExecutor: "0x3ab2102b833d1b97bae643cc46e6bd3d65dde65d", // Address authorized to execute orders for gas estimation
    maxSlippage: 6.0, // 6% slippage  LH is not supposed to be used for high slippage
};

const ChainConfigs = {
    eth: {
        ...defaultValues,
        ...networks.eth,
        ...ethConfig,
        chainName: "ethereum",
        shortName: "ETH",
        outAmountGasThreshold: 0.2,
        id: 1,
        native: {
            address: zeroAddress,
            symbol: "string",
            decimals: 18,
            logoUrl: "https://raw.githubusercontent.com/sushiswap/assets/master/blockchains/ethereum/assets/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2/logo.png",
        },
        exchanges: {
            paraswap: new OnchainSolver({
                name: "paraswap",
                type: "Paraswap",
                tokenProxyAddress: "216b4b4ba9f3e719726886d34a177484278bfcae",
                chainId: networks.eth.id,
                url: "https://clob-taker-paraswap-49d0d7fa5af9.herokuapp.com/getBids",
            }),
            // odos: new OnchainSolver({
            //   url: "https://clob-taker-odos-6e16140d766f.herokuapp.com/getBids",
            //   chainId: networks.eth.id,
            //   name: "odos",
            //   type: "External",
            // }),
            openocean: new OnchainSolver({
                name: "openocean",
                url: "https://clob-taker-openocean-13433c2259af.herokuapp.com/getBids",
                chainId: networks.eth.id,
                type: "External",
            }),
            // rango: new OnchainSolver({
            //   name: "rango",
            //   chainId: networks.eth.id,
            //   url: "https://clob-taker-rango-9efa32bb61a1.herokuapp.com/getBids",
            //   type: "External",
            // }),
            // bebop: new OnchainSolver({
            //   url: "https://clob-taker-bebop-59b71fcb90d3.herokuapp.com/getBids",
            //   name: "bebop",
            //   chainId: networks.eth.id,
            //   type: "External",
            // }),
        },
    },
    blast: {
        ...defaultValues,
        ...blastConfig,
        id: 81457,
        name: "Blast",
        shortname: "BLAST",
        estimateGasViaEthHistory: false,
        baseGasCost: 300_000,
        native: {
            address: zeroAddress,
            symbol: "string",
            decimals: 18,
            logoUrl: "https://raw.githubusercontent.com/sushiswap/assets/master/blockchains/ethereum/assets/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2/logo.png",
        },
        wToken: {
            symbol: "weth",
            address: "0x4300000000000000000000000000000000000004",
            decimals: 18,
            weth: true,
            logoUrl: "https://raw.githubusercontent.com/sushiswap/assets/master/blockchains/ethereum/assets/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2/logo.png",
        },
        publicRpcUrl: "https://rpc.blastblockchain.com",
        logoUrl: "https://cdn.routescan.io/_next/image?url=https%3A%2F%2Fcms-cdn.avascan.com%2Fcms2%2Fblast.dead36673539.png&w=256&q=100",
        explorer: "https://blastscan.io/",
        baseGasPrice: 0,
        eip1559: true,
        pendingBlocks: false,
        chainName: "blast",
        exchanges: {
            openocean: new OnchainSolver({
                url: "https://clob-taker-openocean-13433c2259af.herokuapp.com/getBids",
                name: "openocean",
                chainId: 81457,
                type: "External",
            }),
            bebop: new OnchainSolver({
                url: "https://clob-taker-bebop-59b71fcb90d3.herokuapp.com/getBids",
                name: "bebop",
                chainId: 81457,
                type: "External",
            }),
        },
    },
    linea: {
        ...defaultValues,
        ...networks.linea,
        ...lineaConfig,
        chainName: "linea",
        baseGasCost: 300_000,
        exchanges: {
            // paraswap: new OnchainSolver({
            //   name: "paraswap",
            //   type: "Paraswap",
            //   tokenProxyAddress: "216b4b4ba9f3e719726886d34a177484278bfcae",
            //   chainId: networks.bsc.id,
            //   url: "https://clob-taker-paraswap-49d0d7fa5af9.herokuapp.com/getBids",
            // }),
            odos: new OnchainSolver({
                url: "https://clob-taker-odos-6e16140d766f.herokuapp.com/getBids",
                chainId: networks.linea.id,
                name: "odos",
                type: "External",
            }),
            kyber: new OnchainSolver({
                url: "https://clob-taker-kyber-ad09eb45b09c.herokuapp.com/getBids",
                chainId: networks.linea.id,
                name: "kyber",
                type: "External",
            }),
            // rango: new OnchainSolver({
            //   name: "rango",
            //   chainId: networks.bsc.id,
            //   url: "https://clob-taker-rango-9efa32bb61a1.herokuapp.com/getBids",
            //   type: "External",
            // }),
            openocean: new OnchainSolver({
                url: "https://clob-taker-openocean-13433c2259af.herokuapp.com/getBids",
                name: "openocean",
                chainId: networks.linea.id,
                type: "External",
            }),
            // bebop: new OnchainSolver({
            //   url: "https://clob-taker-bebop-59b71fcb90d3.herokuapp.com/getBids",
            //   name: "bebop",
            //   chainId: networks.bsc.id,
            //   type: "External",
            // }),
        },
    },
    bsc: {
        ...defaultValues,
        ...networks.bsc,
        ...bscConfig,
        chainName: "bsc",
        baseGasCost: 300_000,
        estimateGasViaEthHistory: false,
        exchanges: {
            paraswap: new OnchainSolver({
                name: "paraswap",
                type: "Paraswap",
                tokenProxyAddress: "216b4b4ba9f3e719726886d34a177484278bfcae",
                chainId: networks.bsc.id,
                url: "https://clob-taker-paraswap-49d0d7fa5af9.herokuapp.com/getBids",
            }),
            pancake: new OnchainSolver({
                name: "pancake",
                type: "External",
                chainId: networks.bsc.id,
                url: "https://clob-taker-orbs-8437c0a3eb69.herokuapp.com/getBids",
            }),
            // odos: new OnchainSolver({
            //   url: "https://clob-taker-odos-6e16140d766f.herokuapp.com/getBids",
            //   chainId: networks.bsc.id,
            //   name: "odos",
            //   type: "External",
            // }),
            rango: new OnchainSolver({
                name: "rango",
                chainId: networks.bsc.id,
                url: "https://clob-taker-rango-9efa32bb61a1.herokuapp.com/getBids",
                type: "External",
            }),
            openocean: new OnchainSolver({
                url: "https://clob-taker-openocean-13433c2259af.herokuapp.com/getBids",
                name: "openocean",
                chainId: networks.bsc.id,
                type: "External",
            }),
            bebop: new OnchainSolver({
                url: "https://clob-taker-bebop-59b71fcb90d3.herokuapp.com/getBids",
                name: "bebop",
                chainId: networks.bsc.id,
                type: "External",
            }),
            manifold: new offChainSolver({
                name: "manifold",
                chainId: networks.bsc.id,
                swapGasUnits: 500_000,
                url: "https://clob-taker-manifold-d96876edee4d.herokuapp.com/getBids",
                dutchParams: (dutchPrice: string) => {
                    return { baselineOutAmount: dutchPrice };
                },
                extraDynamic: (rfq: RFQ) => {
                    return { baselineOutAmount: rfq.outAmount?.replace(".", "") };
                },
            }),
        },
    },
    poly: {
        ...defaultValues,
        ...networks.poly,
        ...polyConfig,
        chainName: "polygon",
        exchanges: {
            paraswap: new OnchainSolver({
                name: "paraswap",
                chainId: networks.poly.id,
                url: "https://clob-taker-paraswap-49d0d7fa5af9.herokuapp.com/getBids",
                type: "Paraswap",
                tokenProxyAddress: "216b4b4ba9f3e719726886d34a177484278bfcae",
            }),
            odos: new OnchainSolver({
                name: "odos",
                chainId: networks.poly.id,
                url: "https://clob-taker-odos-6e16140d766f.herokuapp.com/getBids",
                extra: {
                    sourceBlacklist: ["Swaap V2"],
                },
                type: "External",
            }),
            rango: new OnchainSolver({
                name: "rango",
                chainId: networks.poly.id,
                url: "https://clob-taker-rango-9efa32bb61a1.herokuapp.com/getBids",
                type: "External",
            }),
            openocean: new OnchainSolver({
                name: "openocean",
                url: "https://clob-taker-openocean-13433c2259af.herokuapp.com/getBids",
                chainId: networks.poly.id,
                type: "External",
            }),
            bebop: new OnchainSolver({
                url: "https://clob-taker-bebop-59b71fcb90d3.herokuapp.com/getBids",
                name: "bebop",
                chainId: networks.poly.id,
                type: "External",
            }),
            manifold: new offChainSolver({
                name: "manifold",
                chainId: networks.poly.id,
                swapGasUnits: 500_000,
                url: "https://clob-taker-manifold-d96876edee4d.herokuapp.com/getBids",
                dutchParams: (dutchPrice: string) => {
                    return { baselineOutAmount: dutchPrice };
                },
                extraDynamic: (rfq: RFQ) => {
                    return { baselineOutAmount: rfq.outAmount };
                },
            }),

            jst: new offChainSolver({
                name: "jst",
                chainId: networks.poly.id,
                swapGasUnits: 600_000,
                url: "https://clob-taker-clob-72394ea70c65.herokuapp.com/getBids",
                // extraDynamic: (rfq: RFQ) => {
                //   return { minOutAmount: rfq.outAmount?.replace(".", "") };
                // },
                dutchParams: (dutchPrice: string) => {
                    return { minOutAmount: dutchPrice };
                },
                disabled: false,
                // dutchParams: (dutchPrice: string) => {
                //   return { baselineOutAmount: dutchPrice };
                // },
            }),
        },
    },
    base: {
        ...defaultValues,
        ...networks.base,
        ...baseConfig,
        fixedGasCost: "100000000000000", // 1e14  0.0001
        shouldIncludeL1GasPrice: false,
        estimateGasViaEthHistory: false,
        l1GasCalcTx:
            "0x6d8a43c1000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000004e0000000000000000000000000be2dae039bb3b92e8f457e69bfd6543604a297f2000000000000000000000000000000000000000000000000000000000000074000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000003a00000000000000000000000000000000000000000000000000000000000000340000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000065d746770000000000000000000000000000000000000000000000000000000065d74695000000000000000000000000bef2e13a4efe626b5f3833d9dcb2f03895060fd40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda0291300000000000000000000000000000000000000000000000000000000038b2c1900000000000000000000000000000000000000000000000000000000038b2c190000000000000000000000000000000000000000000000000000000000000200000000000000000000000000e9e78109c89162cef32bfe7cbcee1f31312fc1f60000000000000000000000003dacc571356e7d5dfb3b475d6922442ec06b90050000000000000000000000000000000000000000000000000000000065d7466d0000000000000000000000000000000000000000000000000000000065d746e5000000000000000000000000bef2e13a4efe626b5f3833d9dcb2f03895060fd400000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000122016fc8a400000000000000000000000000000000000000000000000000000122016fc8a4000000000000000000000000dfaa8117df6d1f4745d61722d9aac8f3aa87cd1e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000047938be5386a51000000000000000000000000000000000000000000000000004628b436dc0cf70000000000000000000000003dacc571356e7d5dfb3b475d6922442ec06b90050000000000000000000000000000000000000000000000000000000000000041bbe8020c0927a3775c2fa84975d393704746151dcc711de7183243cd202bce7506681070b51817d330f1063fa2b65531d9b4e0d9b7b8ecf3c01a0893ab8039611c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000100000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda0291300000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000044095ea7b300000000000000000000000019ceead7105607cd444f5ad10dd51356436095a1ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000000000000000000019ceead7105607cd444f5ad10dd51356436095a1000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000cb83bd37f90004000004038b2c190746ef747ff68ddc00c49b0001413c266e0d035efae04151cd2a9a277869506f4200000001bef2e13a4efe626b5f3833d9dcb2f03895060fd4000000000401020500260100010201020a0000030400000401000201ff0000000000000000b53d89f9ff727e9c73ef54ff4081f5103aa60cc1833589fcd6edb6e08f4c7c32d4f71b54bda02913f6c0a374a483101e04ef5f7ac9bd15d9142bac95d9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        chainName: "base",

        exchanges: {
            paraswap: new OnchainSolver({
                name: "paraswap",
                chainId: networks.base.id,
                url: "https://clob-taker-paraswap-49d0d7fa5af9.herokuapp.com/getBids",
                type: "Paraswap",
                tokenProxyAddress: "216b4b4ba9f3e719726886d34a177484278bfcae",
            }),
            odos: new OnchainSolver({
                name: "odos",
                chainId: networks.base.id,
                url: "https://clob-taker-odos-6e16140d766f.herokuapp.com/getBids",
                type: "External",
            }),
            rango: new OnchainSolver({
                name: "rango",
                chainId: networks.base.id,
                url: "https://clob-taker-rango-9efa32bb61a1.herokuapp.com/getBids",
                type: "External",
            }),
            openocean: new OnchainSolver({
                name: "openocean",
                url: "https://clob-taker-openocean-13433c2259af.herokuapp.com/getBids",
                chainId: networks.base.id,
                type: "External",
            }),
        },
    },
    zkevm: {
        ...defaultValues,
        ...networks.zkevm,
        ...zkevmConfig,
        chainName: "zkevm",
        outAmountGasThreshold: 0.3, // if the gas cost is more than 30% of the output token value
        estimateGasViaEthHistory: false,
        customGasFactor: 0.5, //https://github.com/0xPolygon/cdk-validium-node/blob/9da5739a3656a014ecd051866f55a73acf1e2198/config/environments/local/local.node.config.toml#L89
        exchanges: {
            paraswap: new OnchainSolver({
                name: "paraswap",
                chainId: networks.zkevm.id,
                url: "https://clob-taker-paraswap-49d0d7fa5af9.herokuapp.com/getBids",
                type: "Paraswap",
                tokenProxyAddress: "c8a21fcd5a100c3ecc037c97e2f9c53a8d3a02a1",
            }),
        },
    },
    ftm: {
        ...defaultValues,
        ...networks.ftm,
        ...ftmConfig,
        chainName: "ftm",
        baseGasCost: 300_000,
        exchanges: {
            paraswap: new OnchainSolver({
                name: "paraswap",
                type: "Paraswap",
                tokenProxyAddress: "216b4b4ba9f3e719726886d34a177484278bfcae",
                chainId: networks.bsc.id,
                url: "https://clob-taker-paraswap-49d0d7fa5af9.herokuapp.com/getBids",
            }),
            odos: new OnchainSolver({
                url: "https://clob-taker-odos-6e16140d766f.herokuapp.com/getBids",
                chainId: networks.bsc.id,
                name: "odos",
                type: "External",
            }),
            rango: new OnchainSolver({
                name: "rango",
                chainId: networks.bsc.id,
                url: "https://clob-taker-rango-9efa32bb61a1.herokuapp.com/getBids",
                type: "External",
            }),
            openocean: new OnchainSolver({
                url: "https://clob-taker-openocean-13433c2259af.herokuapp.com/getBids",
                name: "openocean",
                chainId: networks.bsc.id,
                type: "External",
            }),
            bebop: new OnchainSolver({
                url: "https://clob-taker-bebop-59b71fcb90d3.herokuapp.com/getBids",
                name: "bebop",
                chainId: networks.bsc.id,
                type: "External",
            }),
            magpie: new OnchainSolver({
                name: "magpie",
                chainId: networks.ftm.id,
                url: "https://clob-taker-magpie-2a20d3d257ff.herokuapp.com/getBids",
                type: "External",
                swapGasUnits: 500_000,
            }),
        },
    },
};

export type Config = (typeof Configs)[keyof typeof Configs];

const Configs = {
    QuickSwap: {
        ...ChainConfigs.poly,
        name: "QuickSwap",
        feeAddress: "0xAA9c9F1cd814AD4284eF1F6C30500563f27339ac",
    },
    Lynex: {
        ...ChainConfigs.linea,
        name: "lynex",
        minDollarValueThreshold: 10, // 10 USD
        feeAddress: "0xec1E6aEDd5a2C0D3dc4730B510B66F692c025E00",
        orderGenerator: null,
        decayDurationSeconds: 120, // 1 minutes
        decayStartTime: 0,
    },
    QuickSwapEth: {
        ...ChainConfigs.eth,
        name: "QuickSwap",
        feeAddress: "0xAA9c9F1cd814AD4284eF1F6C30500563f27339ac",
    },
    Fenix: {
        ...ChainConfigs.blast,
        name: "fenix",
        minDollarValueThreshold: 10, // 10 USD
        feeAddress: "0xdB180c83029577A1Cb323542EC796Fa4cC7b8F51",
    },
    QuickSwapZKEVM: {
        ...ChainConfigs.zkevm,
        name: "QuickSwap",
        feeAddress: "0xAA9c9F1cd814AD4284eF1F6C30500563f27339ac",
    },
    Thena: {
        ...ChainConfigs.bsc,
        name: "Thena",
        minDollarValueThreshold: 5,
        absoluteSlippage: 1.0, // 1% slippage purpose when there is no native dex liquidity
        externalLiquiditySlippage: 1.5, // 1% slippage purpose when there is no native dex liquidity
        feeAddress: "0xbe2dAE039bb3B92E8F457E69bfd6543604A297F2",
    },
    Intentx: {
        ...ChainConfigs.base,
        name: "Intentx",
        absoluteSlippage: 1.0, // 1% slippage purpose when there is no native dex liquidity
        minDollarValueThreshold: 1, // 10 USD
        externalLiquiditySlippage: 1.5, // 1% slippage purpose when there is no native dex liquidity
        outAmountGasThreshold: 0.15, // 15% of the gas
        feeAddress: "0x7dA1bF5B4C36B8F32CDc4a1e1965703D244Fe258",
    },
    Spooky: {
        ...ChainConfigs.ftm,
        name: "spookyswap",
        chainName: "fantom",
        absoluteSlippage: 1.0, // 1% slippage purpose when there is no native dex liquidity
        minDollarValueThreshold: 10, // 10 USD
        externalLiquiditySlippage: 1.5, // 1% slippage purpose when there is no native dex liquidity
        outAmountGasThreshold: 0.15, // 15% of the gas
        feeAddress: "0x86aae245b1fe38c5b105dca3662562eb4d69eb8a",
        orderGenerator: null,
    },
};

export type CommonConfig = Config &
    FeatureFlags & {
        customGasFactor?: number;
        fillerApiKey: string;
        walletManagerApiKey: string;
        networkUrl: string;
        networkUrlBackup: string;
        orderGenerator?: (config: Config, rfq: RFQ & { slippage: number }, outAmountSolver: BN, gasOutAmount: BN, solver?: ISolver) => any;
        fixedGasCost?: string;
    };

export type FeatureFlags = {
    lhDebug?: "true" | "false";
    liquidityHub?: "1" | "2" | "3";
    forceSolvers: string[];
    blockPercent: number;
};

function _parseFeatureFlags(e: EventUrl) {
    let params = e.queryStringParameters!;
    let flags: { [key: string]: any } = {} as any;
    for (let [k, v] of Object.entries(params)) {
        let key = k.replace(/-([a-z])/g, function (g) {
            return g[1].toUpperCase();
        });
        flags[key] = v;
    }

    let uiQueryString = decodeURIComponent(params.qs || "");
    let qsParams = querystring.parse(uiQueryString);

    for (let [k, v] of Object.entries(qsParams)) {
        let key = k.replace(/-([a-z])/g, function (g) {
            return g[1].toUpperCase();
        });
        flags[key] = v;
    }
    if (flags["forceSolvers"]) {
        flags["forceSolvers"] = flags["forceSolvers"].split(",");
    }
    return flags as FeatureFlags;
}

export function withConfig(e: EventUrl): CommonConfig {
    const featureFlags = _parseFeatureFlags(e);
    //logger.info(`featureFlags: ${JSON.stringify(featureFlags)}`);
    const secrets = _.mapValues(process.env, (v: string) => v);
    if (!e.queryStringParameters?.chainId) {
        throw new Error(`chainId is required ${e}`);
    }
    const chainId = parseInt(e.queryStringParameters.chainId);
    logger.debug("config::chainId", chainId);

    if (!supportedChains.hasOwnProperty(chainId)) {
        throw new Error(`chainId ${chainId} is not supported`);
    }
    let n = network(chainId);
    if (!n) {
        logger.warn(`chainId ${chainId} is not in candies fallback to config`);
        n = idToNetwork(chainId);
    }
    //@ts-ignore
    process.env.NODE_ENV = secrets.NODE_ENV || "development";
    //@ts-ignore
    process.env.LOG_LEVEL = secrets.LOG_LEVEL || "error";
    logger.setLogLevel(process.env.LOG_LEVEL as any);
    process.env.NETWORK = n.shortname;
    const networkUC = process.env.NETWORK!.toUpperCase();
    const urlKey = `NETWORK_URL_${networkUC}`;
    const urlKeyBackup = `NETWORK_URL_${networkUC}_BACKUP`;
    let networkUrl = secrets[urlKey] || (process.env as any)[urlKey];
    let networkUrlBackup = secrets[urlKeyBackup] || (process.env as any)[urlKeyBackup];
    logger.verbose(`networkUrl: ${networkUrl}`);

    process.env.NETWORK_URL = networkUrl || n.publicRpcUrl;
    process.env.NETWORK_URL_BACKUP = networkUrlBackup || n.publicRpcUrl;
    logger.verbose("networkUrlBackup", networkUrlBackup);

    if (!hasWeb3Instance()) setWeb3Instance(new Web3(process.env.NETWORK_URL!));

    let dexConfig;

    switch (chainId) {
        case networks.poly.id:
            dexConfig = Configs.QuickSwap;
            break;
        case networks.zkevm.id:
            dexConfig = Configs.QuickSwapZKEVM;
            break;
        case networks.bsc.id:
            dexConfig = Configs.Thena;
            break;
        case networks.base.id:
            dexConfig = Configs.Intentx;
            break;
        case networks.ftm.id:
            dexConfig = Configs.Spooky;
            break;
        case networks.linea.id:
            dexConfig = Configs.Lynex;
            break;
        case 81457:
            dexConfig = Configs.Fenix;
            break;
        case 1:
            dexConfig = Configs.QuickSwapEth;
            break;
        default:
            throw new Error("network not supported! " + chainId);
    }

    return {
        ...dexConfig,
        ...featureFlags,
        //@ts-ignore
        fillerApiKey: secrets.FILLER_API_KEY,
        //@ts-ignore
        walletManagerApiKey: secrets.WALLET_MANAGER_API_KEY,
        networkUrl,
        networkUrlBackup: process.env.NETWORK_URL_BACKUP!!,
    };
}

let supportedChains = {};

function init() {
    for (let chainName in ChainConfigs) {
        console.log("chainName", chainName);
        //@ts-ignore
        let id = ChainConfigs[chainName].chainId;
        //@ts-ignore
        supportedChains[id] = 1;
    }
    console.log("supportedChains", supportedChains);
}

function idToNetwork(id: number) {
    for (let chainName in ChainConfigs) {
        //@ts-ignore
        if (Number(ChainConfigs[chainName].chainId) === Number(id)) {
            //@ts-ignore
            return ChainConfigs[chainName];
        }
    }
    return "unknown";
}

init();