import { useEffect, useState } from 'react';
import { readAndWatch } from './readAndWatch';
import { DEFAULT_SETTINGS, settingsItem } from './settings';
import type { Settings } from './types';

/** Live view of the stored settings; null until the first read. */
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(
    () =>
      readAndWatch(
        () => settingsItem.getValue(),
        (cb) => settingsItem.watch((next) => cb(next ?? DEFAULT_SETTINGS)),
        setSettings,
      ),
    [],
  );
  return settings;
}
