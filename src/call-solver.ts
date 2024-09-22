import { CommonConfig } from "./utils";
import logger from "./logger";
import { dumpFetchAsCurl } from "./utils";

export function formatCallBody(network: string, dex: string, srcToken: string, amountIn: string, dstToken: string, user: string, filler: string): Object {
  const data: any = {
    network: network,
    dex: dex,
    filler: filler,
    pathFinderParams: {
      min_output_amount: "0"
    },
    orders: [{
      id: "1-2-3-4",
      srcToken: srcToken,
      amountIn: amountIn,
      dstToken: dstToken,
      user: user
    }]
  }
  return {
    "dataStr": JSON.stringify(data),
    "sessionId": "-1"
  }
}

export async function callExchangeQuote(config: CommonConfig, url: string, body: any): Promise<any | null> {
  const fetchObj = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": config.fillerApiKey,
    },
    body: JSON.stringify(body)
  }
  dumpFetchAsCurl(url, fetchObj)

  let req: Promise<Response>
  try {
    req = fetch(url, fetchObj);
  } catch (e) {
    logger.warn(e);
    logger.warn(`failed to create req object`, e);
    return null
  }

  let res: Response;
  try {
    res = await req;
  } catch (e) {
    logger.warn(`fetch failed`, e);
    return {
      error: "fetch Failed",
      isError: true,
      noResults: true,
      errorDetails: e,
    };
  }

  const data = await res!.json();

  if (
    res!.status !== 200 ||
    !data ||
    data.error ||
    !data.result ||
    !data.result.length ||
    !data.result[0]?.success
  ) {
    logger.warn(`callExchangeQuote:: error`);
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
  return data
}