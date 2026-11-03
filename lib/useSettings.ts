import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, settingsItem } from './settings';
import type { Settings } from './types';

/** Live view of the stored settings; null until the first read. */
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    void settingsItem.getValue().then(setSettings);
    return settingsItem.watch((next) => setSettings(next ?? DEFAULT_SETTINGS));
  }, []);
  return settings;
}
