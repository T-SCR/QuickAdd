import browser from 'webextension-polyfill';
import { DateTime } from 'luxon';
import './style.css';
import type {
  Capture,
  EventCapture,
  TaskCapture,
  ParsePayload,
  ParseResponse,
  ProviderKind
} from '../shared/types';

const providerLabels: Record<ProviderKind, string> = {
  'google-calendar': 'Google Calendar',
  'google-tasks': 'Google Tasks',
  'microsoft-calendar': 'Microsoft 365 Calendar',
  'microsoft-todo': 'Microsoft To Do',
  todoist: 'Todoist',
  ics: 'Download (.ics)'
};

type CommandMode = 'smart' | 'force-event' | 'force-task';
type ToastKind = 'success' | 'error' | 'info';

interface QuickAddState {
  mode: CommandMode;
  selectionText: string;
  forcedKind?: 'event' | 'task';
  providerHint?: ProviderKind;
  parseResult?: ParseResponse;
  captureDraft?: Capture;
  alternatives?: Capture[];
  warnings?: string[];
  diagnostics?: Record<string, unknown>;
  isCardVisible: boolean;
  isParsing: boolean;
  isSaving: boolean;
  isEditing: boolean;
}

interface ToastState {
  message: string;
  kind: ToastKind;
  timeoutId?: number;
}

const state: QuickAddState = {
  mode: 'smart',
  selectionText: '',
  forcedKind: undefined,
  providerHint: undefined,
  parseResult: undefined,
  captureDraft: undefined,
  alternatives: undefined,
  warnings: undefined,
  diagnostics: undefined,
  isCardVisible: false,
  isParsing: false,
  isSaving: false,
  isEditing: false
};

const rootContainer = document.createElement('div');
rootContainer.className = 'quickadd-container';
document.documentElement.appendChild(rootContainer);

const chipButton = document.createElement('button');
chipButton.className = 'quickadd-chip';
chipButton.textContent = 'Quick add';
chipButton.style.display = 'none';
rootContainer.appendChild(chipButton);

const cardContainer = document.createElement('div');
cardContainer.className = 'quickadd-card-container';
cardContainer.style.display = 'none';
rootContainer.appendChild(cardContainer);

const toastContainer = document.createElement('div');
toastContainer.className = 'quickadd-toast quickadd-toast--info';
toastContainer.style.display = 'none';
rootContainer.appendChild(toastContainer);

let selectionRange: Range | null = null;
let selectionTimeout = 0;

function cloneCapture(capture: Capture): Capture {
  return JSON.parse(JSON.stringify(capture));
}

function setState(partial: Partial<QuickAddState>) {
  Object.assign(state, partial);
  renderCard();
}

function formatDateTime(iso: string | undefined, tz: string, opts: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—';
  const dt = DateTime.fromISO(iso, { zone: tz });
  if (!dt.isValid) return iso;
  return dt.setZone(tz).toLocaleString(opts);
}

function formatEventWindow(capture: EventCapture): string {
  const start = formatDateTime(capture.start, capture.tz, DateTime.DATETIME_MED_WITH_WEEKDAY);
  const end = formatDateTime(capture.end, capture.tz, DateTime.TIME_SIMPLE);
  if (capture.allDay) {
    return `${start} • All-day`;
  }
  return `${start} → ${end}`;
}

function formatTaskDue(capture: TaskCapture): string {
  if (!capture.due) return 'No due date';
  return formatDateTime(capture.due, capture.tz, DateTime.DATETIME_MED_WITH_WEEKDAY);
}

function toLocalInput(iso: string, tz: string): string {
  const dt = DateTime.fromISO(iso, { zone: tz });
  if (!dt.isValid) return '';
  return dt.setZone(DateTime.local().zoneName).toFormat("yyyy-MM-dd'T'HH:mm");
}

function fromLocalInput(value: string, tz: string): string | undefined {
  if (!value) return undefined;
  const dt = DateTime.fromFormat(value, "yyyy-MM-dd'T'HH:mm", { zone: DateTime.local().zoneName });
  if (!dt.isValid) return undefined;
  return dt.setZone(tz).toISO();
}

function showToast(message: string, kind: ToastKind = 'info', timeout = 4000) {
  toastContainer.textContent = message;
  toastContainer.className = `quickadd-toast quickadd-toast--${kind}`;
  toastContainer.style.display = 'block';
  const existingTimeout = (toastContainer as unknown as { __timeout?: number }).__timeout;
  if (existingTimeout) {
    window.clearTimeout(existingTimeout);
  }
  const nextTimeout = window.setTimeout(() => {
    toastContainer.style.display = 'none';
  }, timeout);
  (toastContainer as unknown as { __timeout?: number }).__timeout = nextTimeout;
}

function hideChip() {
  chipButton.style.display = 'none';
}

function positionChip(range: Range) {
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    hideChip();
    return;
  }
  chipButton.style.display = 'inline-flex';
  chipButton.style.transform = 'none';

  const viewportLeft = window.scrollX;
  const viewportRight = viewportLeft + window.innerWidth;
  const viewportTop = window.scrollY;

  const chipRect = chipButton.getBoundingClientRect();
  const chipWidth = chipRect.width || 120;
  const chipHeight = chipRect.height || 32;
  const padding = 12;

  let left = rect.left + window.scrollX;
  let top = rect.top + window.scrollY - (chipHeight + padding);

  if (left + chipWidth + padding > viewportRight) {
    left = viewportRight - chipWidth - padding;
  }
  if (left < viewportLeft + padding) {
    left = viewportLeft + padding;
  }

  if (top < viewportTop + padding) {
    top = rect.bottom + window.scrollY + padding;
  }

  chipButton.style.left = `${left}px`;
  chipButton.style.top = `${top}px`;
}

function updateSelectionFromDocument() {
  window.clearTimeout(selectionTimeout);
  selectionTimeout = window.setTimeout(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hideChip();
      selectionRange = null;
      state.selectionText = '';
      return;
    }
    const text = selection.toString().trim();
    if (!text) {
      hideChip();
      selectionRange = null;
      state.selectionText = '';
      return;
    }
    try {
      selectionRange = selection.getRangeAt(0).cloneRange();
    } catch (error) {
      selectionRange = null;
      hideChip();
      return;
    }
    state.selectionText = text;
    if (selectionRange) {
      positionChip(selectionRange);
    }
  }, 80);
}

function ensureSelection(): boolean {
  if (state.selectionText && selectionRange) {
    return true;
  }
  updateSelectionFromDocument();
  if (!state.selectionText) {
    showToast('Select text first, then try QuickAdd again.', 'error');
    return false;
  }
  return true;
}

function resetCard() {
  setState({
    parseResult: undefined,
    captureDraft: undefined,
    alternatives: undefined,
    warnings: undefined,
    diagnostics: undefined,
    isCardVisible: false,
    isParsing: false,
    isSaving: false,
    isEditing: false
  });
}

function onCloseCard() {
  resetCard();
}

async function triggerParse(mode: CommandMode) {
  if (!ensureSelection()) return;
  const text = state.selectionText;
  if (!text || text.length < 3) {
    showToast('Need a bit more text to understand the context.', 'info');
    return;
  }
  const forcedKind = mode === 'force-event' ? 'event' : mode === 'force-task' ? 'task' : undefined;
  const providerHint: ProviderKind | undefined = mode === 'force-event' ? 'google-calendar' : mode === 'force-task' ? 'google-tasks' : undefined;
  setState({
    mode,
    forcedKind,
    providerHint,
    parseResult: undefined,
    captureDraft: undefined,
    alternatives: undefined,
    warnings: undefined,
    diagnostics: undefined,
    isCardVisible: true,
    isParsing: true,
    isEditing: false
  });
  renderCard();
  try {
    const payload: ParsePayload = {
      text,
      url: window.location.href,
      title: document.title,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      forcedKind,
      now: new Date().toISOString()
    };
    const response = (await browser.runtime.sendMessage({
      type: 'quickadd:parse',
      payload
    })) as { type: 'quickadd:parse:result'; payload: ParseResponse };
    if (response.type !== 'quickadd:parse:result') {
      throw new Error('Unexpected parse response');
    }
    const parsePayload = response.payload;
    setState({
      parseResult: parsePayload,
      captureDraft: cloneCapture(parsePayload.capture),
      alternatives: parsePayload.alternatives ? parsePayload.alternatives.map(cloneCapture) : undefined,
      warnings: parsePayload.warnings,
      diagnostics: parsePayload.diagnostics,
      isParsing: false
    });
  } catch (error) {
    console.error('[QuickAdd] parse failed', error);
    setState({ isParsing: false });
    showToast('Could not parse selection. Check console for details.', 'error');
  }
}

async function handleCreate() {
  if (!state.captureDraft) return;
  setState({ isSaving: true });
  try {
    const response = (await browser.runtime.sendMessage({
      type: 'quickadd:create',
      payload: {
        capture: state.captureDraft,
        provider: state.providerHint,
        allowDuplicates: false
      }
    })) as { type: 'quickadd:create:result'; payload: any };
    if (response.type !== 'quickadd:create:result') {
      throw new Error('Unexpected create response');
    }
    const result = response.payload as {
      ok: boolean;
      provider: ProviderKind;
      id?: string;
      url?: string;
      warning?: string;
      error?: string;
    };
    if (result.ok) {
      resetCard();
      const providerLabel = providerLabels[result.provider];
      showToast(`Saved to ${providerLabel}${result.warning ? ` • ${result.warning}` : ''}`, 'success');
    } else {
      setState({ isSaving: false });
      showToast(result.error || 'Unable to create item.', 'error');
    }
  } catch (error) {
    console.error('[QuickAdd] create failed', error);
    setState({ isSaving: false });
    showToast('Failed to create event/task. Check console.', 'error');
  }
}

function handleAlternativeChoice(capture: Capture) {
  setState({ captureDraft: cloneCapture(capture) });
}

function toggleEdit() {
  setState({ isEditing: !state.isEditing });
}

function handleUpdate(field: keyof Capture, value: unknown) {
  if (!state.captureDraft) return;
  const updated = cloneCapture(state.captureDraft);
  (updated as any)[field] = value;
  setState({ captureDraft: updated });
}

function handleEventTimeChange(kind: 'start' | 'end', inputValue: string) {
  if (!state.captureDraft || state.captureDraft.kind !== 'event') return;
  const iso = fromLocalInput(inputValue, state.captureDraft.tz);
  if (!iso) return;
  const updated = cloneCapture(state.captureDraft) as EventCapture;
  updated[kind] = iso;
  setState({ captureDraft: updated });
}

function handleTaskDueChange(inputValue: string) {
  if (!state.captureDraft || state.captureDraft.kind !== 'task') return;
  const iso = fromLocalInput(inputValue, state.captureDraft.tz);
  const updated = cloneCapture(state.captureDraft) as TaskCapture;
  updated.due = iso;
  setState({ captureDraft: updated });
}

function renderBadge() {
  if (!state.captureDraft) return null;
  const badge = document.createElement('span');
  badge.className = 'quickadd-card-subtitle';
  badge.textContent = state.captureDraft.kind === 'event' ? 'Event suggestion' : 'Task suggestion';
  return badge;
}

function renderWarnings(card: HTMLElement) {
  if ((!state.warnings || state.warnings.length === 0) && (!state.parseResult?.diagnostics || !state.parseResult.diagnostics['providerNote'])) {
    return;
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'quickadd-card-warning';
  const warnings: string[] = [];
  if (state.warnings) warnings.push(...state.warnings);
  if (state.parseResult?.diagnostics && typeof state.parseResult.diagnostics['providerNote'] === 'string') {
    warnings.push(String(state.parseResult.diagnostics['providerNote']));
  }
  wrapper.textContent = warnings.join(' • ');
  card.appendChild(wrapper);
}

function renderAlternatives(card: HTMLElement) {
  if (!state.alternatives || state.alternatives.length === 0) return;
  const section = document.createElement('div');
  section.className = 'quickadd-card-ambiguity';
  const title = document.createElement('div');
  title.textContent = 'Did you mean:';
  title.className = 'quickadd-card-subtitle';
  section.appendChild(title);
  const buttons = document.createElement('div');
  buttons.className = 'quickadd-card-ambiguity-buttons';
  state.alternatives.forEach((alt, index) => {
    const button = document.createElement('button');
    button.className = 'quickadd-button';
    button.type = 'button';
    button.textContent = alt.kind === 'event'
      ? formatEventWindow(alt as EventCapture)
      : formatTaskDue(alt as TaskCapture);
    button.addEventListener('click', () => handleAlternativeChoice(alt));
    buttons.appendChild(button);
  });
  section.appendChild(buttons);
  card.appendChild(section);
}

function renderCard() {
  if (!state.isCardVisible) {
    cardContainer.style.display = 'none';
    return;
  }
  cardContainer.style.display = 'flex';
  cardContainer.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'quickadd-card';
  if (state.isParsing || state.isSaving) {
    card.classList.add('quickadd-card--loading');
  }

  const header = document.createElement('div');
  header.className = 'quickadd-card-header';
  const titles = document.createElement('div');
  const title = document.createElement('h3');
  title.className = 'quickadd-card-title';
  title.textContent = state.captureDraft?.title || 'Parsing…';
  titles.appendChild(title);
  const badge = renderBadge();
  if (badge) titles.appendChild(badge);
  header.appendChild(titles);
  const close = document.createElement('button');
  close.className = 'quickadd-card-close';
  close.type = 'button';
  close.textContent = '×';
  close.addEventListener('click', onCloseCard);
  header.appendChild(close);
  card.appendChild(header);

  if (state.captureDraft && !state.isParsing) {
    const detail = document.createElement('div');
    detail.className = 'quickadd-card-context';
    const source = state.captureDraft.source;
    const domain = (() => {
      try {
        return new URL(source.url).hostname;
      } catch (error) {
        return source.url;
      }
    })();
    detail.innerHTML = `<span>${domain}</span><span>•</span><span>${source.title}</span>`;
    card.appendChild(detail);

    if (state.captureDraft.kind === 'event') {
      const time = document.createElement('div');
      time.className = 'quickadd-card-time';
      time.textContent = formatEventWindow(state.captureDraft);
      card.appendChild(time);
    } else {
      const due = document.createElement('div');
      due.className = 'quickadd-card-time';
      due.textContent = formatTaskDue(state.captureDraft);
      card.appendChild(due);
    }

    if (state.captureDraft.location) {
      const location = document.createElement('div');
      location.className = 'quickadd-card-location';
      location.textContent = `📍 ${state.captureDraft.location}`;
      card.appendChild(location);
    }

    if (state.captureDraft.notes) {
      const notes = document.createElement('div');
      notes.className = 'quickadd-card-location';
      notes.textContent = state.captureDraft.notes;
      card.appendChild(notes);
    }
  } else {
    const loading = document.createElement('p');
    loading.textContent = 'Parsing selection…';
    card.appendChild(loading);
  }

  renderWarnings(card);
  renderAlternatives(card);

  if (state.captureDraft && state.isEditing) {
    const editSection = document.createElement('div');
    editSection.className = 'quickadd-card-edit';

    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Title';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = state.captureDraft.title;
    titleInput.addEventListener('input', (event) => {
      handleUpdate('title', (event.target as HTMLInputElement).value);
    });
    titleLabel.appendChild(titleInput);
    editSection.appendChild(titleLabel);

    const locationLabel = document.createElement('label');
    locationLabel.textContent = 'Location';
    const locationInput = document.createElement('input');
    locationInput.type = 'text';
    locationInput.value = state.captureDraft.location ?? '';
    locationInput.placeholder = 'Optional';
    locationInput.addEventListener('input', (event) => {
      handleUpdate('location', (event.target as HTMLInputElement).value || undefined);
    });
    locationLabel.appendChild(locationInput);
    editSection.appendChild(locationLabel);

    const notesLabel = document.createElement('label');
    notesLabel.textContent = 'Notes';
    const notesTextarea = document.createElement('textarea');
    notesTextarea.value = state.captureDraft.notes ?? '';
    notesTextarea.placeholder = 'Additional context';
    notesTextarea.addEventListener('input', (event) => {
      handleUpdate('notes', (event.target as HTMLTextAreaElement).value || undefined);
    });
    notesLabel.appendChild(notesTextarea);
    editSection.appendChild(notesLabel);

    if (state.captureDraft.kind === 'event') {
      const startLabel = document.createElement('label');
      startLabel.textContent = 'Start';
      const startInput = document.createElement('input');
      startInput.type = 'datetime-local';
      startInput.value = toLocalInput(state.captureDraft.start, state.captureDraft.tz);
      startInput.addEventListener('change', (event) => {
        handleEventTimeChange('start', (event.target as HTMLInputElement).value);
      });
      startLabel.appendChild(startInput);
      editSection.appendChild(startLabel);

      const endLabel = document.createElement('label');
      endLabel.textContent = 'End';
      const endInput = document.createElement('input');
      endInput.type = 'datetime-local';
      endInput.value = toLocalInput(state.captureDraft.end, state.captureDraft.tz);
      endInput.addEventListener('change', (event) => {
        handleEventTimeChange('end', (event.target as HTMLInputElement).value);
      });
      endLabel.appendChild(endInput);
      editSection.appendChild(endLabel);
    } else {
      const dueLabel = document.createElement('label');
      dueLabel.textContent = 'Due';
      const dueInput = document.createElement('input');
      dueInput.type = 'datetime-local';
      dueInput.value = state.captureDraft.due ? toLocalInput(state.captureDraft.due, state.captureDraft.tz) : '';
      dueInput.placeholder = 'Optional';
      dueInput.addEventListener('change', (event) => {
        handleTaskDueChange((event.target as HTMLInputElement).value);
      });
      dueLabel.appendChild(dueInput);
      editSection.appendChild(dueLabel);
    }

    card.appendChild(editSection);
  }

  const actions = document.createElement('div');
  actions.className = 'quickadd-card-actions';
  const buttons = document.createElement('div');
  buttons.className = 'quickadd-card-buttons';

  const yesButton = document.createElement('button');
  yesButton.className = 'quickadd-button quickadd-button--primary';
  yesButton.type = 'button';
  yesButton.textContent = state.isSaving ? 'Saving…' : 'Yes';
  yesButton.disabled = state.isSaving || !state.captureDraft;
  yesButton.addEventListener('click', handleCreate);
  buttons.appendChild(yesButton);

  const editButton = document.createElement('button');
  editButton.className = `quickadd-button ${state.isEditing ? 'quickadd-button--ghost is-active' : ''}`;
  editButton.type = 'button';
  editButton.textContent = state.isEditing ? 'Done editing' : 'Edit';
  editButton.addEventListener('click', toggleEdit);
  buttons.appendChild(editButton);

  const noButton = document.createElement('button');
  noButton.className = 'quickadd-button';
  noButton.type = 'button';
  noButton.textContent = 'No';
  noButton.addEventListener('click', () => {
    showToast('Discarded — nothing created.', 'info');
    resetCard();
  });
  buttons.appendChild(noButton);

  actions.appendChild(buttons);
  card.appendChild(actions);

  cardContainer.appendChild(card);
}

chipButton.addEventListener('click', () => triggerParse('smart'));

document.addEventListener('mouseup', updateSelectionFromDocument, { capture: true });
document.addEventListener('keyup', updateSelectionFromDocument, { capture: true });
document.addEventListener('selectionchange', updateSelectionFromDocument);

browser.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') return undefined;
  if (message.type === 'quickadd:command') {
    const envelope = message.payload as { mode: CommandMode };
    triggerParse(envelope.mode);
    return undefined;
  }
  if (message.type === 'quickadd:toast') {
    const payload = message.payload as { kind: ToastKind; message: string };
    showToast(payload.message, payload.kind);
    return undefined;
  }
  return undefined;
});

console.info('[QuickAdd] content script ready');
