export const EXECUTOR_ABI = [
  {
    inputs: [
      { internalType: "contract IReactor", name: "_reactor", type: "address" },
      { internalType: "contract Treasury", name: "_treasury", type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  { inputs: [{ internalType: "address", name: "sender", type: "address" }], name: "InvalidSender", type: "error" },
  { inputs: [], name: "VERSION", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
  {
    inputs: [
      {
        components: [
          { internalType: "bytes", name: "order", type: "bytes" },
          { internalType: "bytes", name: "sig", type: "bytes" },
        ],
        internalType: "struct SignedOrder[]",
        name: "orders",
        type: "tuple[]",
      },
      {
        components: [
          { internalType: "address", name: "target", type: "address" },
          { internalType: "bytes", name: "callData", type: "bytes" },
        ],
        internalType: "struct Call[]",
        name: "calls",
        type: "tuple[]",
      },
      { internalType: "address", name: "fees", type: "address" },
      { internalType: "address[]", name: "tokens", type: "address[]" },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  { inputs: [], name: "reactor", outputs: [{ internalType: "contract IReactor", name: "", type: "address" }], stateMutability: "view", type: "function" },
  {
    inputs: [
      {
        components: [
          {
            components: [
              { internalType: "contract IReactor", name: "reactor", type: "address" },
              { internalType: "address", name: "swapper", type: "address" },
              { internalType: "uint256", name: "nonce", type: "uint256" },
              { internalType: "uint256", name: "deadline", type: "uint256" },
              { internalType: "contract IValidationCallback", name: "additionalValidationContract", type: "address" },
              { internalType: "bytes", name: "additionalValidationData", type: "bytes" },
            ],
            internalType: "struct OrderInfo",
            name: "info",
            type: "tuple",
          },
          {
            components: [
              { internalType: "contract ERC20", name: "token", type: "address" },
              { internalType: "uint256", name: "amount", type: "uint256" },
              { internalType: "uint256", name: "maxAmount", type: "uint256" },
            ],
            internalType: "struct InputToken",
            name: "input",
            type: "tuple",
          },
          {
            components: [
              { internalType: "address", name: "token", type: "address" },
              { internalType: "uint256", name: "amount", type: "uint256" },
              { internalType: "address", name: "recipient", type: "address" },
            ],
            internalType: "struct OutputToken[]",
            name: "outputs",
            type: "tuple[]",
          },
          { internalType: "bytes", name: "sig", type: "bytes" },
          { internalType: "bytes32", name: "hash", type: "bytes32" },
        ],
        internalType: "struct ResolvedOrder[]",
        name: "orders",
        type: "tuple[]",
      },
      { internalType: "bytes", name: "callbackData", type: "bytes" },
    ],
    name: "reactorCallback",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  { inputs: [], name: "treasury", outputs: [{ internalType: "contract Treasury", name: "", type: "address" }], stateMutability: "view", type: "function" },
  {
    inputs: [
      { internalType: "address", name: "filler", type: "address" },
      {
        components: [
          {
            components: [
              { internalType: "contract IReactor", name: "reactor", type: "address" },
              { internalType: "address", name: "swapper", type: "address" },
              { internalType: "uint256", name: "nonce", type: "uint256" },
              { internalType: "uint256", name: "deadline", type: "uint256" },
              { internalType: "contract IValidationCallback", name: "additionalValidationContract", type: "address" },
              { internalType: "bytes", name: "additionalValidationData", type: "bytes" },
            ],
            internalType: "struct OrderInfo",
            name: "info",
            type: "tuple",
          },
          {
            components: [
              { internalType: "contract ERC20", name: "token", type: "address" },
              { internalType: "uint256", name: "amount", type: "uint256" },
              { internalType: "uint256", name: "maxAmount", type: "uint256" },
            ],
            internalType: "struct InputToken",
            name: "input",
            type: "tuple",
          },
          {
            components: [
              { internalType: "address", name: "token", type: "address" },
              { internalType: "uint256", name: "amount", type: "uint256" },
              { internalType: "address", name: "recipient", type: "address" },
            ],
            internalType: "struct OutputToken[]",
            name: "outputs",
            type: "tuple[]",
          },
          { internalType: "bytes", name: "sig", type: "bytes" },
          { internalType: "bytes32", name: "hash", type: "bytes32" },
        ],
        internalType: "struct ResolvedOrder",
        name: "",
        type: "tuple",
      },
    ],
    name: "validate",
    outputs: [],
    stateMutability: "view",
    type: "function",
  },
  { stateMutability: "payable", type: "receive" },
];

export const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";