import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { admin_directory_v1, calendar_v3, people_v1 } from 'googleapis';
import { OAuthTokenResponse } from 'src/auth/dto';
import { IGoogleApiService } from 'src/google-api/interfaces/google-api.interface';
import { directoryPeople, directoryRooms, ORGANIZER_EMAIL, TEST_DOMAIN } from './fixtures';

/**
 * In-memory stand-in for GoogleApiService used by integration tests.
 *
 * Holds rooms, people and calendar events in plain arrays so every test starts from a
 * known state (call `reset()`), responds synchronously (unlike GoogleApiMockService,
 * which adds artificial 1s delays), and never performs network I/O.
 */
export class InMemoryGoogleApi implements IGoogleApiService {
  rooms: admin_directory_v1.Schema$CalendarResource[] = [];
  people: people_v1.Schema$Person[] = [];
  events: calendar_v3.Schema$Event[] = [];
  revokedTokens: string[] = [];
  userEmail = ORGANIZER_EMAIL;

  private nextId = 1;
  private readonly jwt = new JwtService();

  constructor() {
    this.reset();
  }

  reset(): void {
    this.rooms = directoryRooms();
    this.people = directoryPeople();
    this.events = [];
    this.revokedTokens = [];
    this.userEmail = ORGANIZER_EMAIL;
    this.nextId = 1;
  }

  /** Seeds an existing booking of `roomEmail` between start and end. */
  book(roomEmail: string, start: string, end: string, organizer = ORGANIZER_EMAIL): calendar_v3.Schema$Event {
    const event: calendar_v3.Schema$Event = {
      id: `evt-${this.nextId++}`,
      summary: 'Seeded meeting',
      start: { dateTime: start, timeZone: 'UTC' },
      end: { dateTime: end, timeZone: 'UTC' },
      organizer: { email: organizer },
      attendees: [
        { email: roomEmail, resource: true, responseStatus: 'accepted' },
        { email: organizer, organizer: true, responseStatus: 'accepted' },
      ],
    };
    this.events.push(event);
    return event;
  }

  getOAuthClient(): OAuth2Client {
    // a stub client: every method that would hit Google's OAuth endpoints is replaced
    const revoked = this.revokedTokens;
    const client = {
      credentials: {} as Record<string, unknown>,
      setCredentials(creds: Record<string, unknown>) {
        this.credentials = creds;
      },
      async revokeCredentials() {
        revoked.push(String(this.credentials.access_token));
        return { data: {} };
      },
      async refreshAccessToken() {
        if (this.credentials.refresh_token === 'revoked-refresh-token') {
          throw new Error('invalid_grant');
        }
        return { credentials: { access_token: 'refreshed-access-token' } };
      },
    };
    return client as unknown as OAuth2Client;
  }

  getOAuthUrl(client: 'web' | 'chrome' = 'web'): string {
    return `https://accounts.example.test/o/oauth2/auth?client=${client}`;
  }

  async getToken(_: OAuth2Client, code: string): Promise<OAuthTokenResponse> {
    if (code !== 'valid-code') {
      throw new Error('invalid_grant');
    }
    const id_token = this.jwt.sign({ hd: TEST_DOMAIN, email: this.userEmail }, { secret: 'test-only-secret' });
    return { tokens: { access_token: 'google-access-token', refresh_token: 'google-refresh-token', id_token, token_type: 'Bearer' } };
  }

  async getCalendarResources(): Promise<admin_directory_v1.Schema$CalendarResources> {
    return { items: this.rooms.map((r) => ({ ...r })) };
  }

  async listPeople(): Promise<people_v1.Schema$Person[]> {
    return this.people;
  }

  async getCalenderSchedule(_: OAuth2Client, start: string, end: string, __: string, rooms: string[]): Promise<any> {
    const rangeStart = new Date(start).getTime();
    const rangeEnd = new Date(end).getTime();
    const result: Record<string, calendar_v3.Schema$FreeBusyCalendar> = {};

    for (const roomEmail of rooms) {
      const busy = this.events
        .filter((e) => e.attendees?.some((a) => a.email === roomEmail && a.responseStatus !== 'declined'))
        .filter((e) => new Date(e.start.dateTime).getTime() < rangeEnd && new Date(e.end.dateTime).getTime() > rangeStart)
        .map((e) => ({ start: e.start.dateTime, end: e.end.dateTime }));
      result[roomEmail] = { busy };
    }

    return result;
  }

  async createCalenderEvent(_: OAuth2Client, event: calendar_v3.Schema$Event): Promise<calendar_v3.Schema$Event> {
    const organizer = event.attendees?.find((a) => a.organizer)?.email ?? this.userEmail;
    const created: calendar_v3.Schema$Event = {
      ...event,
      id: `evt-${this.nextId++}`,
      organizer: { email: organizer },
      attendees: event.attendees?.map((a) => (a.email.endsWith('resource.calendar.google.com') ? { ...a, resource: true } : a)),
      hangoutLink: event.conferenceData ? 'https://meet.example.test/abc-defg-hij' : undefined,
    };
    this.events.push(created);
    return created;
  }

  async getCalenderEvents(_: OAuth2Client, start: string, end: string): Promise<calendar_v3.Schema$Event[]> {
    const rangeStart = new Date(start).getTime();
    const rangeEnd = new Date(end).getTime();
    return this.events.filter((e) => new Date(e.start.dateTime).getTime() < rangeEnd && new Date(e.end.dateTime).getTime() > rangeStart);
  }

  async getCalenderEvent(_: OAuth2Client, id: string): Promise<calendar_v3.Schema$Event> {
    const event = this.events.find((e) => e.id === id);
    if (!event) {
      throw new Error(`Event ${id} not found`);
    }
    return structuredClone(event);
  }

  async updateCalenderEvent(_: OAuth2Client, id: string, event: calendar_v3.Schema$Event): Promise<calendar_v3.Schema$Event> {
    const index = this.events.findIndex((e) => e.id === id);
    this.events[index] = { ...this.events[index], ...event, id };
    return this.events[index];
  }

  async deleteEvent(_: OAuth2Client, id: string): Promise<void> {
    this.events = this.events.filter((e) => e.id !== id);
  }
}
