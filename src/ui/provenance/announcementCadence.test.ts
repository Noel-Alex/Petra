import { describe, expect, it } from "vitest";

import {
  createProvenanceAnnouncementCadence,
  type ProvenanceAnnouncementScheduler,
} from "./announcementCadence";

class FakeScheduler implements ProvenanceAnnouncementScheduler {
  readonly pending = new Map<number, () => void>();
  private nextHandle = 1;

  set = (callback: () => void): number => {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.pending.set(handle, callback);
    return handle;
  };

  clear = (handle: unknown): void => {
    this.pending.delete(handle as number);
  };

  flushAll(): void {
    const callbacks = [...this.pending.values()];
    this.pending.clear();
    for (const callback of callbacks) {
      callback();
    }
  }
}

describe("provenance announcement cadence", () => {
  it("collapses rapid deferred updates to the latest announcement", () => {
    const scheduler = new FakeScheduler();
    const committed: string[] = [];
    const cadence = createProvenanceAnnouncementCadence({
      commit: (announcement) => committed.push(announcement),
      scheduler,
      delayMs: 25,
    });

    cadence.defer("1 of 3 records shown");
    cadence.defer("2 of 3 records shown");
    cadence.defer("3 of 3 records shown");

    expect(scheduler.pending.size).toBe(1);
    expect(committed).toEqual([]);

    scheduler.flushAll();

    expect(committed).toEqual(["3 of 3 records shown"]);
  });

  it("cancels a pending query summary before an immediate update", () => {
    const scheduler = new FakeScheduler();
    const committed: string[] = [];
    const cadence = createProvenanceAnnouncementCadence({
      commit: (announcement) => committed.push(announcement),
      scheduler,
    });

    cadence.defer("stale query result");
    cadence.announceNow("evidence filter result");

    expect(scheduler.pending.size).toBe(0);
    expect(committed).toEqual(["evidence filter result"]);

    scheduler.flushAll();
    expect(committed).toEqual(["evidence filter result"]);
  });

  it("cancels pending work without disabling later updates", () => {
    const scheduler = new FakeScheduler();
    const committed: string[] = [];
    const cadence = createProvenanceAnnouncementCadence({
      commit: (announcement) => committed.push(announcement),
      scheduler,
    });

    cadence.defer("pending");
    cadence.cancelPending();
    scheduler.flushAll();

    expect(scheduler.pending.size).toBe(0);
    expect(committed).toEqual([]);

    cadence.announceNow("after cancellation");
    expect(committed).toEqual(["after cancellation"]);
  });

  it("rejects invalid delay configuration", () => {
    expect(() =>
      createProvenanceAnnouncementCadence({
        commit: () => undefined,
        delayMs: Number.NaN,
      }),
    ).toThrow(/delay must be finite and non-negative/);
  });
});
