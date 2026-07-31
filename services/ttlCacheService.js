class TtlCache {
  constructor({ maxEntries = 500 } = {}) {
    this.maxEntries = Math.max(
      1,
      Number(maxEntries) || 500
    );
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    const normalizedTtl = Math.max(
      1,
      Number(ttlMs) || 1
    );
    if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + normalizedTtl,
    });
    return value;
  }

  delete(key) {
    return this.entries.delete(key);
  }

  deleteByPrefix(prefix) {
    for (const key of this.entries.keys()) {
      if (String(key).startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  clear() {
    this.entries.clear();
  }
}

module.exports = {
  TtlCache,
};

