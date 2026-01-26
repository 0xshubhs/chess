/**
 * Rate Limiter - PRODUCTION VERSION
 * 
 * Distributed rate limiting with Redis support.
 * Falls back to in-memory for development.
 * 
 * For million-user scale:
 * - Use Redis Cluster for horizontal scaling
 * - Consider token bucket algorithm for burst handling
 * - Add circuit breaker for Redis failures
 * 
 * In production, set REDIS_URL environment variable.
 */

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
  storage: 'redis' | 'memory';
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// Abstract interface for rate limit storage
interface RateLimitStorage {
  get(key: string): Promise<RateLimitRecord | null>;
  set(key: string, record: RateLimitRecord, ttlMs: number): Promise<void>;
  increment(key: string): Promise<number>;
  isHealthy(): boolean;
}

// ============================================================================
// In-Memory Storage (Development)
// ============================================================================

/**
 * In-memory storage with LRU eviction for development.
 * WARNING: Not suitable for production (resets on deploy, no sharing between instances)
 */
class InMemoryStorage implements RateLimitStorage {
  private store = new Map<string, RateLimitRecord>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly maxEntries: number;

  constructor(maxEntries = 10000) {
    this.maxEntries = maxEntries;
    // Cleanup expired entries every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
  }

  async get(key: string): Promise<RateLimitRecord | null> {
    const record = this.store.get(key);
    if (!record) return null;
    
    // Check if expired
    if (Date.now() > record.resetTime) {
      this.store.delete(key);
      return null;
    }
    
    return record;
  }

  async set(key: string, record: RateLimitRecord): Promise<void> {
    // LRU eviction if at capacity
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    
    this.store.set(key, record);
  }

  async increment(key: string): Promise<number> {
    const record = this.store.get(key);
    if (record) {
      record.count++;
      return record.count;
    }
    return 1;
  }

  isHealthy(): boolean {
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetTime) {
        this.store.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0 && process.env.NODE_ENV === 'development') {
      console.log(`[RateLimiter] Cleaned ${cleaned} expired entries`);
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// ============================================================================
// Redis Storage (Production)
// ============================================================================

/**
 * Redis storage for production with connection pooling and circuit breaker.
 * Requires REDIS_URL environment variable.
 */
class RedisStorage implements RateLimitStorage {
  private client: ReturnType<typeof import('redis').createClient> | null = null;
  private connected = false;
  private connectionAttempts = 0;
  private lastFailure = 0;
  private readonly maxRetries = 3;
  private readonly circuitBreakerResetMs = 30000; // 30 seconds

  async connect(): Promise<boolean> {
    // Circuit breaker - don't retry if recently failed
    if (this.connectionAttempts >= this.maxRetries) {
      if (Date.now() - this.lastFailure < this.circuitBreakerResetMs) {
        return false;
      }
      // Reset circuit breaker
      this.connectionAttempts = 0;
    }

    if (this.connected) return true;
    
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) return false;

    this.connectionAttempts++;

    try {
      // Dynamic import to avoid build issues when redis isn't installed
      const { createClient } = await import('redis');
      this.client = createClient({ 
        url: redisUrl,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            if (retries > 3) return new Error('Max reconnection attempts reached');
            return Math.min(retries * 100, 3000);
          },
        },
      });
      
      this.client.on('error', (err: Error) => {
        console.error('Redis client error:', err);
        this.connected = false;
      });

      this.client.on('reconnecting', () => {
        console.log('Redis reconnecting...');
      });

      await this.client.connect();
      this.connected = true;
      this.connectionAttempts = 0;
      console.log('[RateLimiter] Redis connected');
      return true;
    } catch (err) {
      console.warn('[RateLimiter] Redis connection failed, using in-memory fallback:', err);
      this.lastFailure = Date.now();
      return false;
    }
  }

  isHealthy(): boolean {
    return this.connected && (this.client?.isReady ?? false);
  }

  async get(key: string): Promise<RateLimitRecord | null> {
    if (!this.connected || !this.client) return null;

    try {
      const data = await this.client.get(`ratelimit:${key}`);
      if (!data) return null;
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async set(key: string, record: RateLimitRecord, ttlMs: number): Promise<void> {
    if (!this.connected || !this.client) return;

    try {
      await this.client.set(
        `ratelimit:${key}`,
        JSON.stringify(record),
        { PX: ttlMs }
      );
    } catch (err) {
      console.error('Redis set error:', err);
    }
  }

  async increment(key: string): Promise<number> {
    if (!this.connected || !this.client) return 1;

    try {
      const data = await this.client.get(`ratelimit:${key}`);
      if (data) {
        const record = JSON.parse(data);
        record.count++;
        await this.client.set(`ratelimit:${key}`, JSON.stringify(record), { KEEPTTL: true });
        return record.count;
      }
      return 1;
    } catch {
      return 1;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }
}

/**
 * Main Rate Limiter class
 */
export class RateLimiter {
  private static instance: RateLimiter | null = null;
  
  private storage: RateLimitStorage;
  private redisStorage: RedisStorage;
  private memoryStorage: InMemoryStorage;
  private useRedis = false;
  
  // Configuration
  private readonly limit: number;
  private readonly windowMs: number;

  private constructor(limit = 30, windowMs = 60000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.memoryStorage = new InMemoryStorage();
    this.redisStorage = new RedisStorage();
    this.storage = this.memoryStorage;
    
    // Try to connect to Redis in background
    this.initRedis();
  }

  private async initRedis(): Promise<void> {
    const connected = await this.redisStorage.connect();
    if (connected) {
      this.storage = this.redisStorage;
      this.useRedis = true;
    }
  }

  static getInstance(limit?: number, windowMs?: number): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter(limit, windowMs);
    }
    return RateLimiter.instance;
  }

  /**
   * Check if request is allowed
   */
  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const key = this.normalizeKey(identifier);
    const storageType = this.useRedis ? 'redis' as const : 'memory' as const;
    
    let record = await this.storage.get(key);
    
    // No existing record - create new
    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + this.windowMs,
      };
      await this.storage.set(key, record, this.windowMs);
      
      return {
        allowed: true,
        remaining: this.limit - 1,
        retryAfter: 0,
        storage: storageType,
      };
    }
    
    // Check if over limit
    if (record.count >= this.limit) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        retryAfter,
        storage: storageType,
      };
    }
    
    // Increment counter
    const newCount = await this.storage.increment(key);
    
    return {
      allowed: true,
      remaining: Math.max(0, this.limit - newCount),
      retryAfter: 0,
      storage: storageType,
    };
  }

  /**
   * Normalize IP address key
   */
  private normalizeKey(identifier: string): string {
    // Handle x-forwarded-for with multiple IPs
    const ip = identifier.split(',')[0].trim();
    return ip;
  }

  /**
   * Get current storage type
   */
  getStorageType(): 'redis' | 'memory' {
    return this.useRedis ? 'redis' : 'memory';
  }

  /**
   * Cleanup (call on shutdown)
   */
  async destroy(): Promise<void> {
    this.memoryStorage.destroy();
    await this.redisStorage.disconnect();
  }
}

// Sliding window rate limiter for more accuracy (optional)
export class SlidingWindowRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit = 30, windowMs = 60000) {
    this.limit = limit;
    this.windowMs = windowMs;
    
    // Cleanup old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  checkLimit(identifier: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Get or create request timestamps
    let timestamps = this.requests.get(identifier) || [];
    
    // Filter to only requests within window
    timestamps = timestamps.filter(t => t > windowStart);
    
    // Check if over limit
    if (timestamps.length >= this.limit) {
      const oldestInWindow = timestamps[0];
      const retryAfter = Math.ceil((oldestInWindow + this.windowMs - now) / 1000);
      
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.max(1, retryAfter),
        storage: 'memory',
      };
    }
    
    // Add current request
    timestamps.push(now);
    this.requests.set(identifier, timestamps);
    
    return {
      allowed: true,
      remaining: this.limit - timestamps.length,
      retryAfter: 0,
      storage: 'memory',
    };
  }

  private cleanup(): void {
    const windowStart = Date.now() - this.windowMs;
    
    for (const [key, timestamps] of this.requests.entries()) {
      const filtered = timestamps.filter(t => t > windowStart);
      if (filtered.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, filtered);
      }
    }
  }
}
