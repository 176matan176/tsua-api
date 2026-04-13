// Redis is optional for development — gracefully degrades without it
const stub = {
  get: async (_key: string) => null as string | null,
  set: async () => 'OK' as const,
  publish: async () => 0,
  subscribe: (_channel: string, _cb: (msg: string) => void) => Promise.resolve(),
  connect: async () => {},
};

export let redis: any = stub;
export let redisPub: any = stub;
export let redisSub: any = stub;

let redisAvailable = false;

export async function connectRedis() {
  try {
    const { createClient } = await import('redis');
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

    redis    = createClient({ url });
    redisPub = createClient({ url });
    redisSub = createClient({ url });

    await Promise.all([
      redis.connect(),
      redisPub.connect(),
      redisSub.connect(),
    ]);
    redisAvailable = true;
    console.log('[Redis] Connected');
  } catch {
    console.log('[Redis] Not available — running without cache/pub-sub (dev mode)');
    redis    = stub;
    redisPub = stub;
    redisSub = stub;
  }
}

export function isRedisAvailable() {
  return redisAvailable;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, _ttlSeconds = 30) {
  try {
    await redis.set(key, JSON.stringify(value));
  } catch { /* ignore */ }
}
