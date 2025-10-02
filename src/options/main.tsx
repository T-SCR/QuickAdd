import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import type { QuickAddSettings } from '../shared/types';
import { createDefaultSettings } from '../shared/settings';

const providerOptions = [
  { value: 'ics', label: 'Download ICS (fallback)' },
  { value: 'google-calendar', label: 'Google Calendar' },
  { value: 'google-tasks', label: 'Google Tasks' },
  { value: 'microsoft-calendar', label: 'Microsoft 365 Calendar' },
  { value: 'microsoft-todo', label: 'Microsoft To Do' },
  { value: 'todoist', label: 'Todoist' }
] as const;

const App: React.FC = () => {
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [settings, setSettings] = useState<QuickAddSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [historyCount, setHistoryCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = (await browser.runtime.sendMessage({ type: 'quickadd:get-settings' })) as {
          type: 'quickadd:get-settings:result';
          payload: QuickAddSettings;
        };
        if (response.type === 'quickadd:get-settings:result') {
          setSettings(response.payload);
        }
      } catch (error) {
        console.error('Settings load failed', error);
        setStatus('Failed to load settings.');
      }
      const history = (await browser.storage.local.get('quickadd:history'))['quickadd:history'];
      if (Array.isArray(history)) {
        setHistoryCount(history.length);
      }
    })();
  }, []);

  if (!settings) {
    return (
      <main style={{ padding: '32px', fontFamily: 'Segoe UI, sans-serif' }}>
        <h1>QuickAdd Settings</h1>
        <p>Loading…</p>
      </main>
    );
  }

  const defaults = settings.defaults;
  const ai = settings.aiParser;

  const updateSettings = (partial: Partial<QuickAddSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const updateDefaults = (partial: Partial<typeof defaults>) => {
    setSettings((prev) => (prev ? { ...prev, defaults: { ...prev.defaults, ...partial } } : prev));
  };

  const updateAI = (partial: Partial<typeof ai>) => {
    setSettings((prev) => (prev ? { ...prev, aiParser: { ...prev.aiParser, ...partial } } : prev));
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'quickadd:save-settings',
        payload: settings
      })) as { type: 'quickadd:get-settings:result'; payload: QuickAddSettings };
      if (response.type === 'quickadd:get-settings:result') {
        setSettings(response.payload);
        setStatus('Saved successfully.');
      }
    } catch (error) {
      console.error('Save failed', error);
      setStatus('Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const next = createDefaultSettings(tz);
    setSettings(next);
    setStatus('Reset to defaults (not yet saved).');
  };

  const handleClearHistory = async () => {
    const response = (await browser.runtime.sendMessage({ type: 'quickadd:clear-history' })) as {
      type: 'quickadd:clear-history:result';
      payload: { removed: number };
    };
    if (response.type === 'quickadd:clear-history:result') {
      setHistoryCount(0);
      setStatus(`Cleared ${response.payload.removed} cached captures.`);
    }
  };

  const handleDueTime = (value: string) => {
    const [hour = '17', minute = '00'] = value.split(':');
    updateDefaults({ taskDueHour: Number(hour), taskDueMinute: Number(minute) });
  };

  const handlePersistAI = async () => {
    setStatus('Saving AI configuration…');
    try {
      const response = await browser.runtime.sendMessage({
        type: 'quickadd:set-ai-config',
        payload: {
          enabled: ai.enabled,
          provider: ai.provider,
          apiKey: ai.apiKey
        }
      });
      if ((response as any)?.type === 'quickadd:get-settings:result') {
        setSettings((response as any).payload);
      }
      setStatus('AI configuration stored locally.');
    } catch (error) {
      console.error('AI configuration failed', error);
      setStatus('AI configuration failed. Check the API key and connectivity.');
    }
  };

  return (
    <main style={{ padding: '32px', maxWidth: '760px', color: '#0f172a', fontFamily: 'Segoe UI, sans-serif' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>QuickAdd Settings</h1>
        <p style={{ color: '#475569', margin: 0 }}>Tune capture defaults, integrations, and privacy.</p>
      </header>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>Defaults</h2>
        <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            Default destination
            <select
              value={settings.provider}
              onChange={(event) => updateSettings({ provider: event.target.value as QuickAddSettings['provider'] })}
            >
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            Event duration (minutes)
            <input
              type="number"
              min={15}
              max={480}
              value={defaults.durationMinutes}
              onChange={(event) => updateDefaults({ durationMinutes: Number(event.target.value) })}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            Reminder lead time (minutes)
            <input
              type="number"
              min={0}
              max={240}
              value={defaults.reminderMinutes}
              onChange={(event) => updateDefaults({ reminderMinutes: Number(event.target.value) })}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            Task due time (local)
            <input
              type="time"
              value={`${String(defaults.taskDueHour).padStart(2, '0')}:${String(defaults.taskDueMinute).padStart(2, '0')}`}
              onChange={(event) => handleDueTime(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>Controls</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              checked={settings.voiceEnabled}
              onChange={(event) => updateSettings({ voiceEnabled: event.target.checked })}
            />
            Enable voice confirmation (Web Speech API)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              checked={settings.telemetryEnabled}
              onChange={(event) => updateSettings({ telemetryEnabled: event.target.checked })}
            />
            Share anonymous usage metrics (optional)
          </label>
        </div>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>AI Assistance</h2>
        <p style={{ color: '#475569', margin: '0 0 12px' }}>
          Use a free provider (Gemini or Hugging Face) to enhance parsing when QuickAdd is uncertain. API keys stay on this device.
        </p>
        <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              checked={ai.enabled}
              onChange={(event) => updateAI({ enabled: event.target.checked })}
            />
            Enable AI enhancements
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            Provider
            <select
              value={ai.provider}
              onChange={(event) => updateAI({ provider: event.target.value as typeof ai.provider })}
              disabled={!ai.enabled}
            >
              <option value="gemini">Google Gemini</option>
              <option value="huggingface">Hugging Face (Mixtral)</option>
              <option value="local">Local / Custom</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            API key (kept locally)
            <input
              type="password"
              value={ai.apiKey ?? ''}
              onChange={(event) => updateAI({ apiKey: event.target.value })}
              placeholder={ai.provider === 'local' ? 'Optional for local setups' : 'Paste your provider key'}
              disabled={!ai.enabled || ai.provider === 'local'}
            />
          </label>
        </div>
        <div style={{ marginTop: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={handlePersistAI} style={{ padding: '8px 16px' }}>
            Save AI configuration
          </button>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Tip: Gemini keys are free at makersuite.google.com. We never sync your key.
          </span>
        </div>
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>Data</h2>
        <p style={{ color: '#475569' }}>Cached captures stored locally: {historyCount ?? '…'} items.</p>
        <button type="button" onClick={handleClearHistory} style={{ padding: '8px 16px' }}>
          Erase cached capture history
        </button>
      </section>

      <footer style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={handleSave} disabled={saving} style={{ padding: '10px 18px' }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={handleReset} style={{ padding: '10px 18px' }}>
          Reset to defaults
        </button>
        {status && <span style={{ color: '#2563eb' }}>{status}</span>}
      </footer>
    </main>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
