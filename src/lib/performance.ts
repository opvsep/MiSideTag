import type { ProviderSource } from "../types";

type ProviderLimits = Record<ProviderSource, number>;

const NORMAL_LIMITS: ProviderLimits = {
  netease: 2,
  qq: 8,
};
const HIGH_PERFORMANCE_LIMITS: ProviderLimits = {
  netease: 5,
  qq: 16,
};

class AsyncLimiter {
  private active = 0;
  private limit: number;
  private readonly queue: Array<() => void> = [];

  constructor(limit: number) {
    this.limit = limit;
  }

  setLimit(limit: number) {
    this.limit = Math.max(1, Math.round(limit));
    this.drain();
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active += 1;
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            this.active -= 1;
            this.drain();
          });
      };
      if (this.active < this.limit) start();
      else this.queue.push(start);
    });
  }

  private drain() {
    while (this.active < this.limit && this.queue.length) {
      this.queue.shift()?.();
    }
  }
}

let highPerformanceMode = false;
const limiters: Record<ProviderSource, AsyncLimiter> = {
  netease: new AsyncLimiter(NORMAL_LIMITS.netease),
  qq: new AsyncLimiter(NORMAL_LIMITS.qq),
};

export function configureHighPerformance(enabled: boolean) {
  highPerformanceMode = enabled;
  const limits = enabled ? HIGH_PERFORMANCE_LIMITS : NORMAL_LIMITS;
  limiters.netease.setLimit(limits.netease);
  limiters.qq.setLimit(limits.qq);
}

export function isHighPerformanceMode(): boolean {
  return highPerformanceMode;
}

export function providerConcurrencyLimit(source: ProviderSource): number {
  return highPerformanceMode
    ? HIGH_PERFORMANCE_LIMITS[source]
    : NORMAL_LIMITS[source];
}

export function withProviderConcurrency<T>(
  source: ProviderSource,
  task: () => Promise<T>,
): Promise<T> {
  return limiters[source].run(task);
}
