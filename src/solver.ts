import { Quote, QuoteLite, RFQ } from "./types";
import { CommonConfig } from "./utils";
import { getScore, quote, quoteLite } from "./quote";
import logger from "./logger";

type SolverType = "Onchain" | "Offchain";

export interface ISolver {
  solverType: SolverType;
  getScore(): Promise<number>;
  disabled: boolean;
  name: string;
  url: string;
  extra?: any;
  extraDynamic?: Function;
  dutchParams?: Function;
  swapGasUnits?: number;
  type: string;
  getPrice(c: CommonConfig, rfq: RFQ): Promise<Quote>;
  quote(c: CommonConfig, rfq: RFQ): Promise<Quote>;
  dutchQuote(
    c: CommonConfig,
    rfq: RFQ,
    dutchPrice: string,
    dutchIndex: number,
  ): Promise<QuoteLite>;
}

export class OnchainSolver implements ISolver {
  name: string;
  solverType: SolverType;
  chainId: number;
  url: string;
  type: string;
  extra?: any;
  swapGasUnits?: number;
  tokenProxyAddress?: string;
  disabled: boolean;

  constructor(data: {
    name: string;
    chainId: number;
    url: string;
    extra?: any;
    type: string;
    swapGasUnits?: number;
    tokenProxyAddress?: string;
    disabled?: boolean;
  }) {
    this.name = data.name;
    this.url = data.url;
    this.extra = data.extra;
    this.solverType = "Onchain";
    this.chainId = data.chainId;
    this.type = data.type;
    this.swapGasUnits = data.swapGasUnits;
    this.tokenProxyAddress = data.tokenProxyAddress;
    this.disabled = !!data.disabled;
  }
  async getPrice(c: CommonConfig, rfq: RFQ): Promise<Quote> {
    return quote(c, rfq, this, false, true);
  }
  async quote(c: CommonConfig, rfq: RFQ): Promise<Quote> {
    return quote(c, rfq, this, true, false);
  }
  async dutchQuote(c: CommonConfig, rfq: RFQ): Promise<Quote> {
    return Promise.resolve({} as Quote);
  }

  async getScore(): Promise<number> {
    return getScore(this.chainId, this.name);
  }
  toString() {
    return this.name;
  }
}

export class offChainSolver implements ISolver {
  name: string;
  solverType: SolverType;
  chainId: number;
  url: string;
  extra?: any;
  type: string;
  extraDynamic?: Function;
  dutchParams?: Function;
  swapGasUnits?: number;
  disabled: boolean;

  constructor(data: {
    name: string;
    chainId: number;
    url: string;
    extraDynamic?: Function;
    dutchParams?: Function;
    swapGasUnits?: number;
    disabled?: boolean;
  }) {
    this.name = data.name;
    this.solverType = "Offchain";
    this.type = "External";
    this.chainId = data.chainId;
    this.url = data.url;
    this.extraDynamic = data.extraDynamic;
    this.dutchParams = data.dutchParams;
    this.swapGasUnits = data.swapGasUnits;
    this.disabled = !!data.disabled;
  }

  async getPrice(c: CommonConfig, rfq: RFQ): Promise<Quote> {
    let solverParams = this.extra || {};
    if (this.extraDynamic) {
      solverParams = this.extraDynamic(rfq);
      solverParams = { ...this.extra, ...solverParams };
    }
    return Promise.resolve({} as Quote);
  }
  async quote(c: CommonConfig, rfq: RFQ): Promise<Quote> {
    return Promise.resolve({} as Quote);
  }

  async dutchQuote(
    c: CommonConfig,
    rfq: RFQ,
    dutchPrice: string,
    dutchIndex: number,
  ): Promise<QuoteLite> {
    let solverParams = this.extra || {};
    //@ts-ignore
    logger.info("dutchQuote", this.name, dutchPrice, dutchIndex);
    if (this.dutchParams) {
      solverParams = this.dutchParams(dutchPrice);
      solverParams = { ...this.extra, ...solverParams };
    }

    return quoteLite(c, rfq, this, solverParams);
  }

  async getScore(): Promise<number> {
    return getScore(this.chainId, this.name);
  }

  toString() {
    return this.name;
  }
}
