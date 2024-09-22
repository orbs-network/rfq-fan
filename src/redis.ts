import { createClient } from "redis";
import logger from "./logger";
const OPERATION_TIMEOUT = 200;

class RedisWrapper {
  private client: any;

  constructor() {
    logger.verbose("RedisWrapper::constructor");
    this.client = createClient({ database: 1 });

    this.client.on("error", (error: Error) => {
      logger.verbose("Redis error:", error);
    });

    this.client.on("reconnecting", () => {
      logger.verbose("Redis reconnecting...");
    });

    this.client.on("end", () => {
      logger.verbose("Redis connection closed");
    });

    this.client.on("connect", async () => {
      logger.verbose("Redis connected");
      const res = await redisWrapper.select(1)
      if (res?.error) {
        console.error('select redis db failed')
        console.error(res.error)
      }

    });
    this.client.connect();
    logger.verbose("RedisWrapper::constructor end");
  }
  public async select(db: number) {
    return await this.client.select(db)
  }

  public get(key: string): Promise<string | null> {
    logger.verbose("RedisWrapper::get", key);
    return Promise.race([this.client.get(key), timeout(OPERATION_TIMEOUT)]);
  }

  public set(key: string, value: string): Promise<void> {
    logger.verbose("RedisWrapper::set", key, value);
    return Promise.race([
      this.client.set(key, value),
      timeout(OPERATION_TIMEOUT),
    ]);
  }

  public async setX(
    key: string,
    value: string,
    expire = 600,
    executionTimeout = 5000,
  ): Promise<void> {
    logger.verbose("RedisWrapper::setX", key, value, expire);
    const setX = async () => {
      await this.client.set(key, value), await this.client.expire(key, expire);
    };

    try {
      await Promise.race([setX(), timeout(executionTimeout)]);
    } catch (error) {
      logger.error("RedisWrapper::setX execution timeout exceeded");
    }
  }

  public async incr(key: string, ttl?: number): Promise<number> {
    let value = await Promise.race([
      this.client.incr(key),
      timeout(OPERATION_TIMEOUT),
    ]);
    if (ttl) {
      await Promise.race([
        this.client.expire(key, ttl),
        timeout(OPERATION_TIMEOUT),
      ]);
    }
    return value;
  }

  public async publish(channel: string, message: string): Promise<number> {
    logger.verbose("RedisWrapper::publish", channel, message);
    return Promise.race([
      this.client.publish(channel, message),
      timeout(OPERATION_TIMEOUT),
    ]);
  }
}

function timeout(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms, ""));
}

const redisWrapper = new RedisWrapper();
setTimeout(() => {
  redisWrapper.set("pulse", "minute_" + Date.now());
  logger.verbose("redisWrapper.set");
}, 2000);

export default redisWrapper;

export function solverSuccessKey(chainId: number, solver: string) {
  return `solvers:${chainId}:success:${solver}`;
}

export function solverFailuresKey(chainId: number, solver: string) {
  return `solvers:${chainId}:failure:${solver}`;
}
