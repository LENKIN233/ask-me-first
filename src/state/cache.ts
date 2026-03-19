/**
 * 状态缓存
 * 简单的内存缓存，带 TTL
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class StateCache {
  private cache: Map<string, CacheEntry<any>> = new Map();

  constructor(private ttlMs: number = 5 * 60 * 1000) {}

  /**
   * 获取缓存值
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * 设置缓存
   */
  set<T>(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.ttlMs;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl
    });
  }

  /**
   * 删除缓存
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
  }
}
