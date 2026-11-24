/**
 * Insertion-ordered cache index that evicts the oldest *unpinned* entry once it grows
 * past `max`. Pinned entries (still on screen) are never evicted, so the cache simply
 * grows if everything is pinned rather than dropping something that is in use.
 */
export class PinnedLru {
  private readonly order = new Map<string, boolean>(); // key -> pinned

  constructor(
    private readonly max: number,
    private readonly onEvict: (key: string) => void,
  ) {}

  get size(): number {
    return this.order.size;
  }

  has(key: string): boolean {
    return this.order.has(key);
  }

  /** Add a key as the newest entry (or refresh it), then trim. */
  add(key: string, pinned = false): void {
    const wasPinned = this.order.get(key) ?? false;
    this.order.delete(key);
    this.order.set(key, pinned || wasPinned);
    this.trim();
  }

  /** Mark a key as the most recently used. */
  touch(key: string): void {
    const pinned = this.order.get(key);
    if (pinned === undefined) return;
    this.order.delete(key);
    this.order.set(key, pinned);
  }

  pin(key: string): void {
    if (this.order.has(key)) this.order.set(key, true);
  }

  unpin(key: string): void {
    if (this.order.has(key)) this.order.set(key, false);
    this.trim();
  }

  private trim(): void {
    for (const [key, pinned] of this.order) {
      if (this.order.size <= this.max) return;
      if (pinned) continue;
      this.order.delete(key);
      this.onEvict(key);
    }
  }
}
