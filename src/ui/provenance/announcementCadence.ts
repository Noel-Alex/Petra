export const PROVENANCE_QUERY_ANNOUNCEMENT_DELAY_MS = 300;

export interface ProvenanceAnnouncementScheduler {
  readonly set: (callback: () => void, delayMs: number) => unknown;
  readonly clear: (handle: unknown) => void;
}

export interface ProvenanceAnnouncementCadence {
  defer(announcement: string): void;
  announceNow(announcement: string): void;
  cancelPending(): void;
}

const DEFAULT_SCHEDULER: ProvenanceAnnouncementScheduler = {
  set: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clear: (handle) => {
    globalThis.clearTimeout(handle as number);
  },
};

export function createProvenanceAnnouncementCadence({
  commit,
  delayMs = PROVENANCE_QUERY_ANNOUNCEMENT_DELAY_MS,
  scheduler = DEFAULT_SCHEDULER,
}: {
  readonly commit: (announcement: string) => void;
  readonly delayMs?: number;
  readonly scheduler?: ProvenanceAnnouncementScheduler;
}): ProvenanceAnnouncementCadence {
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error("provenance announcement delay must be finite and non-negative");
  }

  let pendingHandle: unknown | null = null;

  const cancelPending = (): void => {
    if (pendingHandle === null) return;
    scheduler.clear(pendingHandle);
    pendingHandle = null;
  };

  return {
    defer(announcement) {
      cancelPending();
      pendingHandle = scheduler.set(() => {
        pendingHandle = null;
        commit(announcement);
      }, delayMs);
    },
    announceNow(announcement) {
      cancelPending();
      commit(announcement);
    },
    cancelPending,
  };
}
