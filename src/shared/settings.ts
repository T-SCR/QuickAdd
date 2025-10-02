import type { QuickAddSettings } from './types';
import { DEFAULTS } from './parser';

export const SETTINGS_KEY = 'quickadd:settings';
export const HISTORY_KEY = 'quickadd:history';

export function createDefaultSettings(tz: string): QuickAddSettings {
  return {
    defaults: { ...DEFAULTS, tz },
    provider: 'ics',
    voiceEnabled: true,
    telemetryEnabled: false,
    aiParser: {
      enabled: false,
      provider: 'gemini'
    },
    lastUpdated: new Date().toISOString()
  };
}
