import { DateTime } from 'luxon';

export function now(tz: string, override?: string) {
  return override ? DateTime.fromISO(override, { zone: tz }) : DateTime.now().setZone(tz);
}

export function toIso(dt: DateTime) {
  const iso = dt.toISO({ suppressMilliseconds: true });
  if (!iso) {
    throw new Error('Invalid DateTime instance');
  }
  return iso;
}

export function clampDate(dt: DateTime, tz: string) {
  return dt.setZone(tz, { keepLocalTime: true });
}

export function ensureDuration(start: DateTime, end: DateTime | undefined, defaultMinutes: number) {
  if (end) return end;
  return start.plus({ minutes: defaultMinutes });
}

export function defaultTaskDue(nowDt: DateTime, dueHour: number, dueMinute: number) {
  const candidate = nowDt.set({ hour: dueHour, minute: dueMinute, second: 0, millisecond: 0 });
  if (candidate < nowDt) {
    return candidate.plus({ days: 1 });
  }
  return candidate;
}

export function upcomingWeekday(reference: DateTime, weekday: number) {
  let diff = weekday - reference.weekday;
  if (diff <= 0) diff += 7;
  return reference.plus({ days: diff });
}

export function hasOverlap(aStart: DateTime, aEnd: DateTime, bStart: DateTime, bEnd: DateTime) {
  return aStart < bEnd && bStart < aEnd;
}
