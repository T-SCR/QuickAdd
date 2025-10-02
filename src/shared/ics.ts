import { DateTime } from 'luxon';
import { v4 as uuid } from 'uuid';
import type { Capture, EventCapture, TaskCapture } from './types';

function formatDate(value: string, isAllDay = false) {
  const dt = DateTime.fromISO(value);
  if (isAllDay) {
    return dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
  }
  return dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
}

function escapeText(input?: string) {
  if (!input) return '';
  return input
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function serializeEvent(capture: EventCapture) {
  const uid = capture.id || uuid();
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${DateTime.utc().toFormat("yyyyMMdd'T'HHmmss'Z'")}`,
    `DTSTART:${formatDate(capture.start, !!capture.allDay)}`,
    `DTEND:${formatDate(capture.end, !!capture.allDay)}`,
    `SUMMARY:${escapeText(capture.title)}`
  ];

  if (capture.location) {
    lines.push(`LOCATION:${escapeText(capture.location)}`);
  }

  if (capture.notes) {
    lines.push(`DESCRIPTION:${escapeText(capture.notes)}`);
  }

  if (capture.attendees?.length) {
    for (const attendee of capture.attendees) {
      const cn = attendee.name ? `;CN=${escapeText(attendee.name)}` : '';
      lines.push(`ATTENDEE;RSVP=FALSE${cn}:mailto:${attendee.email}`);
    }
  }

  if (capture.recurrence) {
    lines.push(`RRULE:${capture.recurrence}`);
  }

  if (capture.reminderMinutes != null) {
    const minutes = capture.reminderMinutes;
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`TRIGGER:-PT${minutes}M`);
    lines.push('DESCRIPTION:Reminder');
    lines.push('END:VALARM');
  }

  lines.push('END:VEVENT');
  return lines;
}

function serializeTask(capture: TaskCapture) {
  const uid = capture.id || uuid();
  const lines = [
    'BEGIN:VTODO',
    `UID:${uid}`,
    `DTSTAMP:${DateTime.utc().toFormat("yyyyMMdd'T'HHmmss'Z'")}`,
    `SUMMARY:${escapeText(capture.title)}`
  ];

  if (capture.due) {
    lines.push(`DUE:${formatDate(capture.due)}`);
  }

  if (capture.notes) {
    lines.push(`DESCRIPTION:${escapeText(capture.notes)}`);
  }

  if (capture.priority) {
    const priorityNumber = capture.priority === 'high' ? 1 : capture.priority === 'medium' ? 5 : 9;
    lines.push(`PRIORITY:${priorityNumber}`);
  }

  if (capture.recurrence) {
    lines.push(`RRULE:${capture.recurrence}`);
  }

  if (capture.reminderMinutes != null) {
    const minutes = capture.reminderMinutes;
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`TRIGGER:-PT${minutes}M`);
    lines.push('DESCRIPTION:Reminder');
    lines.push('END:VALARM');
  }

  lines.push('END:VTODO');
  return lines;
}

export function captureToICS(capture: Capture) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//QuickAdd//EN'];
  if (capture.kind === 'event') {
    lines.push(...serializeEvent(capture));
  } else {
    lines.push(...serializeTask(capture));
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
