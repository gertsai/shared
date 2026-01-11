// Lua may return 3-tuple [totalHits, remainingHits, resetMs] or 4-tuple [allowFlag, totalHits, remainingHits, resetMs]
export type SlidingWindowResult = [number, number, number] | [number, number, number, number];
export type GCRAResult = [number, number, number];

export interface StorageAdapter {
  incrementSW(
    key: string,
    timeFrame: number,
    limit: number,
    now: number,
  ): Promise<SlidingWindowResult>;

  gcraCheck(
    key: string,
    timeFrame: number,
    limit: number,
    burst: number,
    now: number,
  ): Promise<GCRAResult>;
}
