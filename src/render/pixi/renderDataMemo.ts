export interface RevisionMemo<Key, Value> {
  getOrCompute(
    revision: number,
    key: Key,
    compute: () => Value,
  ): Value;
  clear(): void;
}

/**
 * Small presentation-only memo for expensive products derived from one exact
 * render-data revision. Camera, selection and viewport changes intentionally do
 * not alter the revision, while a new/interpolated scientific frame does.
 *
 * Values are cached only after a successful computation, so a failed render
 * attempt cannot poison the next redraw.
 */
export function createRevisionMemo<Key, Value>(): RevisionMemo<Key, Value> {
  let activeRevision: number | null = null;
  const values = new Map<Key, Value>();

  return {
    getOrCompute(revision, key, compute) {
      if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new RangeError("render-data revision must be a non-negative safe integer");
      }
      if (activeRevision !== revision) {
        activeRevision = revision;
        values.clear();
      }
      if (values.has(key)) {
        return values.get(key)!;
      }
      const value = compute();
      values.set(key, value);
      return value;
    },
    clear() {
      activeRevision = null;
      values.clear();
    },
  };
}
