import browser from 'webextension-polyfill';
import type { Runtime } from 'webextension-polyfill';
import { DateTime } from 'luxon';
import { captureToICS } from '../shared/ics';
import { parseCapture } from '../shared/parser';
import { createDefaultSettings, HISTORY_KEY, SETTINGS_KEY } from '../shared/settings';
import type { BackgroundRequest, BackgroundResponse } from '../shared/messages';
import { enhanceWithAI } from '../shared/ai-parser';
import { createGoogleCalendarEvent, createGoogleTask } from './google';
import { connectInteractive, disconnectGoogle, getAuthStatus, resetStoredToken } from './google-auth';
import type { Capture, CreatePayload, CreateResponse, ParsePayload, QuickAddSettings } from '../shared/types';

const HISTORY_LIMIT = 200;

interface HistoryItem {
  id: string;
  kind: Capture['kind'];
  title: string;
  start?: string;
  end?: string;
  due?: string;
  sourceUrl: string;
  provider: string;
  createdAt: string;
}

function sanitizeFileName(text: string) {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || 'quickadd-item';
}

async function getSettings(tz: string): Promise<QuickAddSettings> {
  const syncObj = await browser.storage.sync.get(SETTINGS_KEY);
  const stored = (syncObj as any)[SETTINGS_KEY] as QuickAddSettings | undefined;
  const localObj = await browser.storage.local.get('quickadd:ai-key');
  const aiKey = (localObj as any)['quickadd:ai-key'] as string | undefined;

  if (!stored) {
    const defaults = createDefaultSettings(tz);
    // merge AI key into defaults (not persisted in sync)
    defaults.aiParser = { ...defaults.aiParser, apiKey: aiKey };
    await browser.storage.sync.set({ [SETTINGS_KEY]: { ...defaults, aiParser: { ...defaults.aiParser, apiKey: undefined } } });
    return defaults;
  }
  let result = stored;
  if (stored.defaults.tz !== tz) {
    const updated = { ...stored, defaults: { ...stored.defaults, tz } };
    await browser.storage.sync.set({ [SETTINGS_KEY]: { ...updated, aiParser: { ...updated.aiParser, apiKey: undefined } } });
    result = updated;
  }
  // Attach aiKey from local storage
  result = { ...result, aiParser: { ...result.aiParser, apiKey: aiKey } } as QuickAddSettings;
  return result;
}

async function saveSettings(settings: QuickAddSettings) {
  const aiKey = settings.aiParser?.apiKey;
  const payloadForSync: QuickAddSettings = {
    ...settings,
    aiParser: { ...settings.aiParser, apiKey: undefined },
    lastUpdated: new Date().toISOString()
  } as QuickAddSettings;
  await browser.storage.sync.set({ [SETTINGS_KEY]: payloadForSync });
  if (aiKey) {
    await browser.storage.local.set({ 'quickadd:ai-key': aiKey });
  } else {
    await browser.storage.local.remove('quickadd:ai-key');
  }
  // Return full settings (re-hydrate apiKey)
  return { ...payloadForSync, aiParser: { ...payloadForSync.aiParser, apiKey: aiKey } } as QuickAddSettings;
}

async function readHistory(): Promise<HistoryItem[]> {
  const stored = (await browser.storage.local.get(HISTORY_KEY))[HISTORY_KEY] as HistoryItem[] | undefined;
  return stored ?? [];
}

async function writeHistory(history: HistoryItem[]) {
  await browser.storage.local.set({ [HISTORY_KEY]: history.slice(-HISTORY_LIMIT) });
}

function isDuplicate(capture: Capture, history: HistoryItem[]) {
  return history.find((item) => {
    if (item.kind !== capture.kind) return false;
    if (item.title.toLowerCase() !== capture.title.toLowerCase()) return false;
    if (capture.kind === 'event') {
      return item.start === capture.start && item.sourceUrl === capture.source.url;
    }
    return item.due === (capture as Extract<Capture, { kind: 'task' }>).due && item.sourceUrl === capture.source.url;
  });
}

async function handleParse(payload: ParsePayload): Promise<BackgroundResponse> {
  const settings = await getSettings(payload.tz);
  const response = parseCapture(payload, { ...settings.defaults, tz: payload.tz });

  // Optionally enhance with AI if enabled and API key is present
  try {
    const aiCfg = settings.aiParser;
    if (aiCfg?.enabled && aiCfg.apiKey) {
      const ai = await enhanceWithAI(payload, aiCfg);
      if (ai) {
        // Merge AI output into parsed capture (AI fields override when present)
        const orig = response.capture;
        const merged: Capture = (
          orig.kind === 'event'
            ? {
                ...orig,
                title: ai.title ?? orig.title,
                location: ai.location ?? orig.location,
                attendees: ai.attendees ?? orig.attendees,
                notes: ai.notes ?? orig.notes,
                confidence: Math.max(orig.confidence, ai.confidence ?? 0),
                start: (ai as any).start ?? (orig as Extract<Capture, { kind: 'event' }>).start,
                end: (ai as any).end ?? (orig as Extract<Capture, { kind: 'event' }>).end
              }
            : {
                ...orig,
                title: ai.title ?? orig.title,
                location: ai.location ?? orig.location,
                attendees: ai.attendees ?? orig.attendees,
                notes: ai.notes ?? orig.notes,
                confidence: Math.max(orig.confidence, ai.confidence ?? 0),
                due: (ai as any).due ?? (orig as Extract<Capture, { kind: 'task' }>).due,
                priority: (ai as any).priority ?? (orig as Extract<Capture, { kind: 'task' }>).priority
              }
        ) as Capture;
        response.capture = merged;
      }
    }
  } catch (e) {
    console.warn('[QuickAdd] AI enhancement failed, continuing with local parse', e);
  }

  return { type: 'quickadd:parse:result', payload: response };
}

async function createIcsDownload(capture: Capture): Promise<CreateResponse> {
  const ics = captureToICS(capture);
  const filenameBase = sanitizeFileName(capture.title);
  const filename = `QuickAdd/${filenameBase}.ics`;
  const url = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  const downloadId = await browser.downloads.download({ url, filename, saveAs: false });
  return {
    ok: true,
    provider: 'ics',
    id: String(downloadId),
    url,
    warning: 'Downloaded ICS file'
  };
}

async function handleCreate(payload: CreatePayload): Promise<BackgroundResponse> {
  const history = await readHistory();
  const duplicate = !payload.allowDuplicates ? isDuplicate(payload.capture, history) : undefined;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const settings = await getSettings(tz);
  // Start with explicit provider, then user default, then fallback
  const requestedProvider = (payload.provider ?? settings.provider ?? 'ics') as CreateResponse['provider'];
  let provider = requestedProvider;
  let providerNote: string | undefined;
  // Auto-map based on capture kind to avoid mismatches
  if (payload.capture.kind === 'event') {
    if (provider === 'google-tasks' || provider === 'microsoft-todo') {
      provider = 'google-calendar';
      providerNote = 'Switched to Google Calendar for event capture.';
    }
  } else if (payload.capture.kind === 'task') {
    if (provider === 'google-calendar' || provider === 'microsoft-calendar') {
      provider = 'google-tasks';
      providerNote = 'Switched to Google Tasks for task capture.';
    }
  }

  if (duplicate && !payload.allowDuplicates) {
    return {
      type: 'quickadd:create:result',
      payload: {
        ok: false,
        provider,
        warning: 'Similar item exists',
        deduped: true,
        id: duplicate.id
      }
    };
  }

  let result: CreateResponse;
  switch (provider) {
    case 'google-calendar':
      result = payload.capture.kind === 'event'
        ? await createGoogleCalendarEvent(payload.capture)
        : { ok: false, provider, error: 'Please use a calendar-compatible item' };
      break;
    case 'google-tasks':
      result = payload.capture.kind === 'task'
        ? await createGoogleTask(payload.capture)
        : { ok: false, provider, error: 'Please use a task-compatible item' };
      break;
    case 'ics':
      result = await createIcsDownload(payload.capture);
      break;
    default:
      result = {
        ok: false,
        provider,
        error: 'Provider integration not yet connected'
      };
      break;
  }

  if (providerNote) {
    if (result.ok) {
      result = { ...result, warning: providerNote };
    } else if (!result.warning) {
      result = { ...result, warning: providerNote };
    }
  }

  if (result.ok) {
    const historyItem: HistoryItem = {
      id: payload.capture.id,
      kind: payload.capture.kind,
      title: payload.capture.title,
      start: payload.capture.kind === 'event' ? payload.capture.start : undefined,
      end: payload.capture.kind === 'event' ? payload.capture.end : undefined,
      due: payload.capture.kind === 'task' ? payload.capture.due : undefined,
      sourceUrl: payload.capture.source.url,
      provider: result.provider,
      createdAt: DateTime.now().toISO()
    };
    history.push(historyItem);
    await writeHistory(history);
  }

  return {
    type: 'quickadd:create:result',
    payload: result
  };
}

async function handleGetSettings(tz: string): Promise<BackgroundResponse> {
  const settings = await getSettings(tz);
  return { type: 'quickadd:get-settings:result', payload: settings };
}

async function handleSaveSettings(payload: QuickAddSettings): Promise<BackgroundResponse> {
  const saved = await saveSettings(payload);
  return { type: 'quickadd:get-settings:result', payload: saved };
}

async function handleClearHistory(): Promise<BackgroundResponse> {
  const existing = await readHistory();
  await writeHistory([]);
  return { type: 'quickadd:clear-history:result', payload: { removed: existing.length } };
}

browser.runtime.onMessage.addListener((message: unknown, sender: Runtime.MessageSender) => {
  const request = message as BackgroundRequest | undefined;
  if (!request || typeof request !== 'object') return undefined;

  switch (request.type) {
    case 'quickadd:parse':
      return handleParse(request.payload);
    case 'quickadd:create':
      return handleCreate(request.payload);
    case 'quickadd:get-settings': {
      const tz = sender?.tab?.url ? Intl.DateTimeFormat().resolvedOptions().timeZone : Intl.DateTimeFormat().resolvedOptions().timeZone;
      return handleGetSettings(tz);
    }
    case 'quickadd:save-settings':
      return handleSaveSettings(request.payload);
    case 'quickadd:set-ai-config': {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return (async () => {
        const current = await getSettings(tz);
        const updated = await saveSettings({
          ...current,
          aiParser: {
            enabled: request.payload.enabled,
            provider: request.payload.provider,
            apiKey: request.payload.apiKey
          }
        });
        return { type: 'quickadd:get-settings:result', payload: updated };
      })();
    }
    case 'quickadd:clear-history':
      return handleClearHistory();
    case 'quickadd:auth-status':
      return (async () => {
        const status = await getAuthStatus();
        return { type: 'quickadd:auth-status:result', payload: status } as const;
      })();
    case 'quickadd:auth-connect':
      return (async () => {
        try {
          const ok = await connectInteractive();
          return { type: 'quickadd:auth-ack', payload: { ok } } as const;
        } catch (e: any) {
          return { type: 'quickadd:auth-ack', payload: { ok: false, error: e?.message ?? 'Auth failed' } } as const;
        }
      })();
    case 'quickadd:auth-disconnect':
      return (async () => {
        try {
          await disconnectGoogle();
          await resetStoredToken();
          return { type: 'quickadd:auth-ack', payload: { ok: true } } as const;
        } catch (e: any) {
          return { type: 'quickadd:auth-ack', payload: { ok: false, error: e?.message ?? 'Disconnect failed' } } as const;
        }
      })();
    case 'quickadd:log':
      if (request.payload.level === 'error') {
        console.error('[QuickAdd]', request.payload.message, request.payload.meta ?? {});
      } else if (request.payload.level === 'warn') {
        console.warn('[QuickAdd]', request.payload.message, request.payload.meta ?? {});
      } else {
        console.info('[QuickAdd]', request.payload.message, request.payload.meta ?? {});
      }
      return Promise.resolve({ type: 'quickadd:ack' });
    default:
      return undefined;
  }
});

// Safely send a message to a tab; ignore pages without our content script
async function safeSendToTab(tabId: number, message: unknown) {
  try {
    await browser.tabs.sendMessage(tabId, message as any);
  } catch (err) {
    console.warn('[QuickAdd] Could not deliver message to tab (no content script?)', err);
  }
}

async function dispatchCommand(mode: 'smart' | 'force-event' | 'force-task') {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await safeSendToTab(tab.id, { type: 'quickadd:command', payload: { mode } });
}

browser.commands.onCommand.addListener((command) => {
  if (command === 'smart-capture') {
    void dispatchCommand('smart');
  } else if (command === 'force-event') {
    void dispatchCommand('force-event');
  } else if (command === 'force-task') {
    void dispatchCommand('force-task');
  }
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'quickadd-add-to-calendar') {
    void safeSendToTab(tab.id, { type: 'quickadd:command', payload: { mode: 'force-event' } });
  }
  if (info.menuItemId === 'quickadd-add-to-task') {
    void safeSendToTab(tab.id, { type: 'quickadd:command', payload: { mode: 'force-task' } });
  }
});

browser.runtime.onInstalled.addListener(async () => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await getSettings(tz);
  browser.contextMenus.create({ id: 'quickadd-add-to-calendar', title: 'Add to Calendar (QuickAdd)', contexts: ['selection'] });
  browser.contextMenus.create({ id: 'quickadd-add-to-task', title: 'Add to Tasks (QuickAdd)', contexts: ['selection'] });
});

console.info('QuickAdd background ready');
