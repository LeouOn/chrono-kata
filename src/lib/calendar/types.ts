export interface GoogleCalendarEvent {
  id?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  summary: string;
  description?: string;
}

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
}

export interface GoogleTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date; // 1 hour from issuance
  scope: string;
}
