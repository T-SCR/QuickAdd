export type CaptureKind = 'event' | 'task';

export interface CaptureSource {
  url: string;
  title: string;
}

export interface CaptureAttendee {
  name?: string;
  email: string;
}

export interface BaseCapture {
  id: string;
  kind: CaptureKind;
  title: string;
  notes?: string;
  location?: string;
  attendees?: CaptureAttendee[];
  source: CaptureSource;
  tz: string;
  confidence: number;
  reminderMinutes?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface EventCapture extends BaseCapture {
  kind: 'event';
  start: string; // ISO string
  end: string;
  allDay?: boolean;
  recurrence?: string;
}

export interface TaskCapture extends BaseCapture {
  kind: 'task';
  due?: string;
  priority?: 'low' | 'medium' | 'high';
  recurrence?: string;
}

export type Capture = EventCapture | TaskCapture;

export type ProviderKind =
  | 'google-calendar'
  | 'google-tasks'
  | 'microsoft-calendar'
  | 'microsoft-todo'
  | 'todoist'
  | 'ics';

export interface ParsePayload {
  text: string;
  url: string;
  title: string;
  tz: string;
  forcedKind?: CaptureKind;
  now?: string;
}

export interface ParseResponse {
  capture: Capture;
  alternatives?: Capture[];
  warnings?: string[];
  diagnostics?: Record<string, unknown>;
}

export interface CreatePayload {
  capture: Capture;
  provider?: ProviderKind;
  allowDuplicates?: boolean;
}

export interface CreateResponse {
  ok: boolean;
  provider: ProviderKind;
  id?: string;
  url?: string;
  warning?: string;
  deduped?: boolean;
  error?: string;
}

export interface QuickAddDefaults {
  durationMinutes: number;
  reminderMinutes: number;
  taskDueHour: number;
  taskDueMinute: number;
  locale: string;
  tz: string;
}

export interface AIParserConfig {
  enabled: boolean;
  provider: 'gemini' | 'huggingface' | 'local';
  apiKey?: string;
}

export interface QuickAddSettings {
  defaults: QuickAddDefaults;
  provider: ProviderKind;
  voiceEnabled: boolean;
  telemetryEnabled: boolean;
  aiParser: AIParserConfig;
  lastUpdated: string;
}

export interface CommandEnvelope {
  mode: 'smart' | 'force-event' | 'force-task';
}
