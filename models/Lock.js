////////////////////////////////////////////////////
// Lock.js
//
// Automatic lock management with built-in cleanup
////////////////////////////////////////////////////

const DEFAULT_LOCK_CLEANUP_INTERVAL = 60000;

export class Lock {
  static locks = new Map();
  static cleanupInterval = null;

  // Initialize with optional cleanup interval
  static initialize(cleanupIntervalMs = DEFAULT_LOCK_CLEANUP_INTERVAL) {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (cleanupIntervalMs > 0) {
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, cleanupIntervalMs);

      // Ensure cleanup interval doesn't prevent Node from exiting
      this.cleanupInterval.unref();
    }
  }

  static async acquire(resourceId, timeoutMs = 5000) {
    // Auto-initialize with default cleanup if not already done
    if (!this.cleanupInterval) {
      this.initialize();
    }

    if (this.locks.has(resourceId)) {
      throw new Error(`Resource ${resourceId} is locked`);
    }

    this.locks.set(resourceId, {
      timestamp: Date.now(),
      timeout: timeoutMs
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.release(resourceId);
        reject(new Error(`Lock timeout for resource ${resourceId}`));
      }, timeoutMs);

      resolve(() => {
        clearTimeout(timeout);
        this.release(resourceId);
      });
    });
  }

  static release(resourceId) {
    this.locks.delete(resourceId);
  }

  static isLocked(resourceId) {
    return this.locks.has(resourceId);
  }

  static cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [resourceId, lock] of this.locks.entries()) {
      if (now - lock.timestamp > lock.timeout) {
        this.release(resourceId);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`Lock cleanup: removed ${cleaned} stale locks`);
    }
  }

  // Cleanup when shutting down
  static shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.locks.clear();
  }
}
