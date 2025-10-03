import { DateTime } from 'luxon';
import type { EventCapture, TaskCapture, CreateResponse } from '../shared/types';
import { getAccessToken, invalidateAccessToken } from './google-auth';

const API_BASE = 'https://www.googleapis.com';

async function googleFetch(input: RequestInfo | URL, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401 && retry) {
    await invalidateAccessToken(token);
    return googleFetch(input, init, false);
  }
  return response;
}

function mapAttendees(attendees: EventCapture['attendees'] | undefined) {
  return attendees?.map((attendee) => ({
    email: attendee.email,
    ...(attendee.name ? { displayName: attendee.name } : {})
  }));
}

function buildEventBody(capture: EventCapture) {
  const base = {
    summary: capture.title,
    description: capture.notes,
    location: capture.location,
    attendees: mapAttendees(capture.attendees),
    source: {
      url: capture.source.url,
      title: capture.source.title
    },
    reminders: capture.reminderMinutes != null
      ? {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: capture.reminderMinutes }]
        }
      : undefined
  } as any;

  if (capture.allDay) {
    const startDate = DateTime.fromISO(capture.start).toISODate();
    const endDate = DateTime.fromISO(capture.end).toISODate();
    base.start = { date: startDate };
    base.end = { date: endDate };
  } else {
    base.start = { dateTime: capture.start, timeZone: capture.tz };
    base.end = { dateTime: capture.end, timeZone: capture.tz };
  }

  return base;
}

export async function createGoogleCalendarEvent(capture: EventCapture): Promise<CreateResponse> {
  try {
    const body = buildEventBody(capture);
    const response = await googleFetch(`${API_BASE}/calendar/v3/calendars/primary/events`, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message ?? response.statusText);
    }

    const data = await response.json();
    return {
      ok: true,
      provider: 'google-calendar',
      id: data.id,
      url: data.htmlLink
    };
  } catch (error: any) {
    return {
      ok: false,
      provider: 'google-calendar',
      error: error?.message ?? 'Failed to create Google Calendar event.'
    };
  }
}

export async function createGoogleTask(capture: TaskCapture): Promise<CreateResponse> {
  try {
    const body: Record<string, unknown> = {
      title: capture.title,
      notes: capture.notes,
      due: capture.due ?? undefined
    };

    const response = await googleFetch(`${API_BASE}/tasks/v1/lists/@default/tasks`, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message ?? response.statusText);
    }

    const data = await response.json();
    return {
      ok: true,
      provider: 'google-tasks',
      id: data.id,
      url: data.selfLink
    };
  } catch (error: any) {
    return {
      ok: false,
      provider: 'google-tasks',
      error: error?.message ?? 'Failed to create Google Task.'
    };
  }
}
