/**
 * In-memory monotonic version tracker per order.
 *
 * Requirements: RNF-09, Plan §4 (Fase 3).
 * Drops incoming WebSocket messages with `version <= knownVersion` to ensure
 * out-of-order or duplicate events do not corrupt application state.
 */
export class VersionTracker {
  private readonly versions = new Map<string, number>();

  /**
   * Evaluates if an incoming event with `incomingVersion` should be applied for `orderId`.
   * Returns `true` and records the new version if `incomingVersion > knownVersion`.
   * Returns `false` and discards if `incomingVersion <= knownVersion`.
   */
  shouldApply(orderId: string, incomingVersion: number): boolean {
    const currentVersion = this.versions.get(orderId) ?? 0;
    if (incomingVersion > currentVersion) {
      this.versions.set(orderId, incomingVersion);
      return true;
    }
    return false;
  }

  /**
   * Sets or updates the known version for an order (e.g. seeded from REST response).
   * Only increases the recorded version to preserve monotonicity.
   */
  setVersion(orderId: string, version: number): void {
    const currentVersion = this.versions.get(orderId) ?? 0;
    if (version > currentVersion) {
      this.versions.set(orderId, version);
    }
  }

  /**
   * Returns the currently tracked version for an order, or undefined if not tracked.
   */
  getVersion(orderId: string): number | undefined {
    return this.versions.get(orderId);
  }

  /**
   * Evicts an order from the tracker (e.g. when order is closed or reaches terminal status).
   */
  remove(orderId: string): boolean {
    return this.versions.delete(orderId);
  }

  /**
   * Clears all tracked versions.
   */
  clear(): void {
    this.versions.clear();
  }

  /**
   * Returns total count of tracked orders.
   */
  get size(): number {
    return this.versions.size;
  }
}

export const versionTracker = new VersionTracker();
