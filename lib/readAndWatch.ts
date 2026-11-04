/**
 * Reads a stored value once and keeps it live. The initial read can resolve after a change event
 * that is newer than it; that stale read is dropped instead of overwriting the newer value.
 * Returns the cleanup for a React effect.
 */
export function readAndWatch<T>(
  read: () => Promise<T>,
  watch: (cb: (value: T) => void) => () => void,
  set: (value: T) => void,
): () => void {
  let changed = false;
  let live = true;
  void read().then((value) => {
    if (live && !changed) set(value);
  });
  const unwatch = watch((value) => {
    changed = true;
    if (live) set(value);
  });
  return () => {
    live = false;
    unwatch();
  };
}
