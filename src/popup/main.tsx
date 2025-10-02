import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import type { QuickAddSettings } from '../shared/types';

const providerLabels: Record<string, string> = {
  'google-calendar': 'Google Calendar',
  'google-tasks': 'Google Tasks',
  'microsoft-calendar': 'Microsoft 365 Calendar',
  'microsoft-todo': 'Microsoft To Do',
  todoist: 'Todoist',
  ics: 'Download ICS'
};

const App: React.FC = () => {
  const [settings, setSettings] = useState<QuickAddSettings | null>(null);

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
        console.error('Popup settings load failed', error);
      }
    })();
  }, []);

  const openOptions = () => {
    browser.runtime.openOptionsPage();
  };

  return (
    <main
      style={{
        fontFamily: 'Segoe UI, sans-serif',
        padding: '18px',
        width: '280px',
        background: '#0f172a',
        color: '#f8fafc'
      }}
    >
      <h1 style={{ fontSize: '18px', margin: 0, marginBottom: '8px' }}>QuickAdd</h1>
      <p style={{ fontSize: '13px', lineHeight: 1.4, color: '#cbd5f5' }}>
        Highlight text on any page, then press <strong>Alt+Shift+Q</strong> or use the chip to turn it into an event or task.
      </p>
      <section style={{ marginTop: '16px', background: 'rgba(15,23,42,0.65)', padding: '12px', borderRadius: '12px' }}>
        <h2 style={{ fontSize: '14px', margin: '0 0 6px' }}>Defaults</h2>
        <p style={{ margin: 0, fontSize: '12px', color: '#cbd5f5' }}>
          Destination: <strong>{settings ? providerLabels[settings.provider] : 'Loading…'}</strong>
        </p>
        {settings && (
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
            Reminder: {settings.defaults.reminderMinutes} min • Task due: {settings.defaults.taskDueHour.toString().padStart(2, '0')}:
            {settings.defaults.taskDueMinute.toString().padStart(2, '0')}
          </p>
        )}
      </section>
      <button
        type="button"
        onClick={openOptions}
        style={{ marginTop: '16px', width: '100%', padding: '10px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
      >
        Open settings
      </button>
    </main>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
