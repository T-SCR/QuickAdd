import * as chrono from 'chrono-node';
import { DateTime } from 'luxon';
import { v4 as uuid } from 'uuid';
import { defaultTaskDue, ensureDuration, now as nowInTz, toIso } from './time';
import type {
  Capture,
  EventCapture,
  ParsePayload,
  ParseResponse,
  QuickAddDefaults,
  TaskCapture
} from './types';

const EVENT_KEYWORDS = [
  'meet',
  'meeting',
  'call',
  'sync',
  'standup',
  'retro',
  'review',
  'demo',
  'interview',
  'lecture',
  'class',
  'webinar',
  'workshop',
  'room',
  'zoom',
  'google meet',
  'teams'
];

const TASK_KEYWORDS = [
  'submit',
  'finish',
  'complete',
  'send',
  'write',
  'todo',
  'follow up',
  'review',
  'ship',
  'publish',
  'draft',
  'prepare',
  'remind',
  'pay'
];

const PRIORITY_KEYWORDS: Record<'high' | 'medium' | 'low', string[]> = {
  high: ['urgent', 'asap', 'priority', 'important', 'critical'],
  medium: ['soon', 'follow up', 'remind', 'next'],
  low: ['whenever', 'sometime', 'later']
};

const LOCATION_PATTERNS = [
  /room\s?\d{1,4}/i,
  /hall\s?[a-z]?\d*/i,
  /(zoom|meet|teams)\s*link[:\-]?\s*(https?:\/\/\S+)/i,
  /(https?:\/\/\S*(zoom|meet|teams|webex)\S*)/i,
  /at\s+([A-Za-z0-9 ,.-]{3,})/i
];

const EMAIL_REGEX = /([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g;

export const DEFAULTS: QuickAddDefaults = {
  durationMinutes: 60,
  reminderMinutes: 10,
  taskDueHour: 17,
  taskDueMinute: 0,
  locale: 'en',
  tz: 'UTC'
};

function scoreText(text: string, keywords: string[]) {
  const lower = text.toLowerCase();
  return keywords.reduce((acc, keyword) => (lower.includes(keyword) ? acc + 1 : acc), 0);
}

function detectPriority(text: string): TaskCapture['priority'] {
  const lower = text.toLowerCase();
  if (PRIORITY_KEYWORDS.high.some((k) => lower.includes(k))) return 'high';
  if (PRIORITY_KEYWORDS.medium.some((k) => lower.includes(k))) return 'medium';
  if (PRIORITY_KEYWORDS.low.some((k) => lower.includes(k))) return 'low';
  return undefined;
}

function extractLocation(text: string) {
  for (const pattern of LOCATION_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    if (match[2]) return match[2];
    if (match[1]) return match[1];
    return match[0];
  }
  return undefined;
}

function extractAttendees(text: string) {
  const emails = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(EMAIL_REGEX);
  while ((match = regex.exec(text))) {
    emails.add(match[1].toLowerCase());
  }
  return [...emails].map((email) => ({ email }));
}

function inferTitle(text: string) {
  const trimmed = text.trim();
  if (trimmed.length <= 64) return trimmed;
  return `${trimmed.slice(0, 61)}...`;
}

function computeConfidence({
  text,
  kind,
  hasDuration,
  hasDate
}: {
  text: string;
  kind: 'event' | 'task';
  hasDuration: boolean;
  hasDate: boolean;
}) {
  let confidence = 0.4;
  const eventScore = scoreText(text, EVENT_KEYWORDS);
  const taskScore = scoreText(text, TASK_KEYWORDS);
  confidence += Math.min(eventScore + taskScore, 3) * 0.05;
  if (kind === 'event' && hasDuration) confidence += 0.2;
  if (kind === 'task' && !hasDuration) confidence += 0.1;
  if (hasDate) confidence += 0.15;
  return Math.max(0.1, Math.min(confidence, 0.98));
}

function buildNotes(title: string, url: string, quote: string) {
  return `From: ${title} — ${url}\nQuote: “${quote.trim()}”`;
}

function parseWithChrono(text: string, reference: DateTime) {
  return chrono.casual.parse(text, reference.toJSDate(), { forwardDate: true });
}

function toDateTime(value: chrono.ParsedComponents | undefined, tz: string, fallback: DateTime) {
  if (!value) return fallback;
  const timezoneOffset = value.get('timezoneOffset');
  const jsDate = value.date();
  if (typeof timezoneOffset === 'number') {
    return DateTime.fromJSDate(jsDate, { zone: 'utc' }).minus({ minutes: timezoneOffset }).setZone(tz);
  }
  return DateTime.fromJSDate(jsDate).setZone(tz);
}

function isAllDay(components: chrono.ParsedComponents | undefined) {
  if (!components) return false;
  return !components.isCertain('hour') && !components.isCertain('minute');
}

export function parseCapture(
  payload: ParsePayload,
  defaults: QuickAddDefaults = { ...DEFAULTS, tz: payload.tz }
): ParseResponse {
  const text = payload.text.trim();
  const tz = payload.tz || defaults.tz;
  const now = nowInTz(tz, payload.now);
  const notes = buildNotes(payload.title, payload.url, text);
  const attendees = extractAttendees(text);
  const location = extractLocation(text);

  const chronoResults = parseWithChrono(text, now);
  const hasDate = chronoResults.length > 0 && chronoResults[0].start != null;

  let forcedKind = payload.forcedKind;
  const eventScore = scoreText(text, EVENT_KEYWORDS);
  const taskScore = scoreText(text, TASK_KEYWORDS);
  const hasExplicitTime = /\b\d{1,2}[:\.\-]?\d{0,2}\s?(am|pm)?\b/i.test(text) || /\bnoon\b|\bmidnight\b/i.test(text);

  let chosenKind: 'event' | 'task';
  if (forcedKind) {
    chosenKind = forcedKind;
  } else if (chronoResults.length && (hasExplicitTime || eventScore > taskScore)) {
    chosenKind = 'event';
  } else if (!chronoResults.length && taskScore >= eventScore) {
    chosenKind = 'task';
  } else if (taskScore > eventScore) {
    chosenKind = 'task';
  } else {
    chosenKind = chronoResults.length ? 'event' : 'task';
  }

  const alternatives: Capture[] = [];
  const warnings: string[] = [];

  if (chronoResults.length > 1) {
    warnings.push('Multiple date interpretations detected');
  }

  const baseId = uuid();

  if (chosenKind === 'event' && chronoResults.length) {
    const primary = chronoResults[0];
    const start = toDateTime(primary.start, tz, now);
    const eventEnd = primary.end ? toDateTime(primary.end, tz, start) : ensureDuration(start, undefined, defaults.durationMinutes);
    const allDay = isAllDay(primary.start);

    const capture: EventCapture = {
      id: baseId,
      kind: 'event',
      title: inferTitle(text),
      start: toIso(start),
      end: toIso(eventEnd),
      allDay,
      location,
      attendees,
      notes,
      source: { url: payload.url, title: payload.title },
      tz,
      confidence: computeConfidence({ text, kind: 'event', hasDuration: true, hasDate }),
      reminderMinutes: defaults.reminderMinutes
    };

    if (chronoResults.length > 1) {
      for (let i = 1; i < Math.min(chronoResults.length, 3); i += 1) {
        const candidate = chronoResults[i];
        if (!candidate.start) continue;
        const altStart = toDateTime(candidate.start, tz, start);
        const altEnd = candidate.end
          ? toDateTime(candidate.end, tz, altStart)
          : ensureDuration(altStart, undefined, defaults.durationMinutes);
        alternatives.push({
          ...capture,
          id: uuid(),
          start: toIso(altStart),
          end: toIso(altEnd)
        });
      }
    }

    return {
      capture,
      alternatives: alternatives.length ? alternatives : undefined,
      warnings: warnings.length ? warnings : undefined,
      diagnostics: {
        chronoMatches: chronoResults.length
      }
    };
  }

  // Default to task
  const dueDateResult = chronoResults.find((r) => r.start);
  let dueDate = dueDateResult ? toDateTime(dueDateResult.start, tz, now) : defaultTaskDue(now, defaults.taskDueHour, defaults.taskDueMinute);
  let recurrence = undefined;
  if (dueDateResult?.text?.toLowerCase().includes('every')) {
    recurrence = 'RRULE:FREQ=WEEKLY';
  }

  const capture: TaskCapture = {
    id: baseId,
    kind: 'task',
    title: inferTitle(text),
    due: toIso(dueDate),
    notes,
    location,
    attendees,
    source: { url: payload.url, title: payload.title },
    tz,
    confidence: computeConfidence({ text, kind: 'task', hasDuration: false, hasDate }),
    reminderMinutes: defaults.reminderMinutes,
    priority: detectPriority(text),
    recurrence
  };

  if (chosenKind === 'event' && !chronoResults.length) {
    warnings.push('Could not detect a date/time. Captured as task.');
  }

  if (chronoResults.length > 1) {
    for (let i = 1; i < Math.min(chronoResults.length, 3); i += 1) {
      const candidate = chronoResults[i];
      if (!candidate.start) continue;
      const altDue = toDateTime(candidate.start, tz, dueDate);
      alternatives.push({
        ...capture,
        id: uuid(),
        due: toIso(altDue)
      });
    }
  }

  return {
    capture,
    alternatives: alternatives.length ? alternatives : undefined,
    warnings: warnings.length ? warnings : undefined,
    diagnostics: {
      chronoMatches: chronoResults.length,
      chosenKind
    }
  };
}
