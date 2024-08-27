import BN from "bignumber.js";

export type RFQ = {
  user: string;
  inToken: string;
  outToken: string;
  inAmount: string;
  outAmount?: string;
  sessionId?: string;
};

export type Quote = RFQ & {
  sessionId: string;
  outAmount: string;
  minAmountOut: string;
  estimateOutAmount: string;
  gasCostOutputToken?: string;
  gasUnits?: BN;
  exchange: string;
  to: string;
  data: string;
  permitData: any;
  serializedOrder: string;
  raw: any;
  score?: number;
  solverId: string;
  error?: string;
  fails?: number;
  elapsed: number;
  dollarValue?: number;
  gasCostUsd?: number;
  outTokenPrice: number;
  simulateAmountOut: string;
};

export type QuoteLite = RFQ & {
  sessionId: string;
  outAmount: string;
  exchange: string;
  to: string;
  data: string;
  raw: any;
  score?: number;
  solverId: string;
  error?: string;
  elapsed: number;
  dollarValue?: number;
  outTokenPrice: number;
};

export type ErrorObj = {
  error: string;
  sessionId: string;
  errorData?: any;
};

export type AuctionResult = Quote & {
  error?: string;
  auctionData: any;
  updatedErrorTypes: any;
  quotes: Quote[];
  inTokenUsd: number;
  outTokenUsd: number;
};

export type SignedQuote = Quote & {
  signature: string;
};

export type SignedQuoteAndData = SignedQuote & {
  data: string;
  to: string;
};

export type WalletManagerResult = {
  error?: string;
  txHash?: string;
  blockNumber?: number;
  gasUsed: string;
  gasUnits: string;
  txData: string;
  to: string;
  gasPrice: {
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  };
};

export type DutchOrderResult = WalletManagerResult & {
  tryIndex: number;
  maxTries: number;
  dutchPrice: string;
  solverId?: string;
  exchange: string;
  sessionId: string;
  timeToDeadline: number;
  timeAbsolute: number;
  timeAbsoluteEnd: number;
  estimateGasElapsed: number;
  estimateGasSuccess: boolean;
  timeTillDecayStart: number;
  timeTillDecayEnd: number;
};

export interface Swap {
  exchange: string;
  token: string;
  amount: string;
  to: string;
  data: string;
}

export type OrderResult = {
  userOutAmount: BN;
  userMinOutAmount: BN;
  gasOutAmount: BN;
  permitData: any;
  serializedOrder: string;
};
