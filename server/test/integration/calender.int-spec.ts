import * as request from 'supertest';
import { at } from '../utils/fixtures';
import { createTestApp, TestApp } from '../utils/create-test-app';

const OAK = 'oak@resource.calendar.google.com'; // 4 seats, F1
const PINE = 'pine@resource.calendar.google.com'; // 8 seats, F2
const ELM = 'elm@resource.calendar.google.com'; // 12 seats, F10

describe('Calendar API (integration)', () => {
  let t: TestApp;
  let cookies: string[];

  const api = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    t.googleApi.reset();
    cookies = await t.authCookies();
  });

  describe('authentication', () => {
    it.each([
      ['GET', '/api/events'],
      ['GET', '/api/rooms/available'],
      ['GET', '/api/floors'],
      ['POST', '/api/event'],
      ['DELETE', '/api/event?id=1'],
    ])('%s %s returns 401 without a session', async (method, path) => {
      const res = await (api() as any)[method.toLowerCase()](path).expect(401);

      expect(res.body).toMatchObject({ status: 'error', redirect: true });
    });

    it('rejects a forged session cookie', async () => {
      await api()
        .get('/api/floors')
        .set('Cookie', ['accessToken=deadbeef', `accessTokenIv=${'ab'.repeat(16)}`])
        .expect(401);
    });
  });

  describe('GET /api/rooms/available', () => {
    const query = { startTime: at('10:00'), duration: 60, timeZone: 'UTC' };

    it('lists free rooms and hides booked ones', async () => {
      t.googleApi.book(PINE, at('09:30'), at('10:30'));

      const res = await api()
        .get('/api/rooms/available')
        .query({ ...query, seats: 1 })
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body.data.preferred.map((r) => r.email)).toEqual([OAK, ELM]);
    });

    it('splits results by preferred floor and respects seat count', async () => {
      const res = await api()
        .get('/api/rooms/available')
        .query({ ...query, seats: 5, floor: 'F2' })
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body.data).toMatchObject({ preferred: [{ email: PINE }], others: [{ email: ELM }] });
    });

    it('returns empty lists when no room is large enough', async () => {
      const res = await api()
        .get('/api/rooms/available')
        .query({ ...query, seats: 500 })
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body.data).toEqual({ preferred: [], others: [] });
    });

    it.each([
      ['an invalid start time', { startTime: 'tomorrow-ish' }],
      ['an invalid time zone', { timeZone: 'Mars/Olympus_Mons' }],
      ['a non-numeric duration', { duration: 'long' }],
    ])('returns 400 for %s', async (_, override) => {
      const res = await api()
        .get('/api/rooms/available')
        .query({ ...query, seats: 1, ...override })
        .set('Cookie', cookies)
        .expect(400);

      expect(res.body.status).toBe('error');
      expect(Array.isArray(res.body.error)).toBe(true);
    });
  });

  describe('booking lifecycle', () => {
    const booking = { startTime: at('10:00'), duration: 30, seats: 4, room: OAK, title: 'Sync', attendees: [{ email: 'alice@example.com' }] };

    it('creates, lists and deletes an event', async () => {
      const created = await api().post('/api/event').set('Cookie', cookies).send(booking).expect(201);
      expect(created.body.data).toMatchObject({ room: 'Oak', roomEmail: OAK, summary: 'Sync', start: at('10:00'), end: at('10:30') });
      expect(t.googleApi.events[0].organizer.email).toBe(t.googleApi.userEmail);
      expect(t.googleApi.events[0].attendees).toEqual(
        expect.arrayContaining([expect.objectContaining({ email: t.googleApi.userEmail, organizer: true, responseStatus: 'accepted' })]),
      );

      const listed = await api()
        .get('/api/events')
        .query({ startTime: at('00:00'), endTime: at('23:59'), timeZone: 'UTC' })
        .set('Cookie', cookies)
        .expect(200);
      expect(listed.body.data).toHaveLength(1);
      expect(listed.body.data[0]).toMatchObject({ eventId: created.body.data.eventId, isEditable: true, attendees: [{ email: 'alice@example.com' }] });

      await api().delete('/api/event').query({ id: created.body.data.eventId }).set('Cookie', cookies).expect(200);
      expect(t.googleApi.events).toHaveLength(0);
    });

    it('returns 409 when the room is already booked', async () => {
      t.googleApi.book(OAK, at('10:15'), at('11:00'), 'someone-else@example.com');

      const res = await api().post('/api/event').set('Cookie', cookies).send(booking).expect(409);

      expect(res.body).toMatchObject({ status: 'error', message: 'Room has already been booked.' });
      expect(t.googleApi.events).toHaveLength(1);
    });

    it('returns 404 for an unknown room', async () => {
      await api()
        .post('/api/event')
        .set('Cookie', cookies)
        .send({ ...booking, room: 'ghost@resource.calendar.google.com' })
        .expect(404);
    });

    it('returns 400 for an invalid attendee email', async () => {
      await api()
        .post('/api/event')
        .set('Cookie', cookies)
        .send({ ...booking, attendees: [{ email: 'not-an-email' }] })
        .expect(400);
    });

    it("returns 403 when editing someone else's event", async () => {
      const seeded = t.googleApi.book(OAK, at('10:00'), at('10:30'), 'someone-else@example.com');

      await api()
        .put('/api/event')
        .set('Cookie', cookies)
        .send({ ...booking, eventId: seeded.id })
        .expect(403);
    });
  });

  it('GET /api/floors returns floors in natural order', async () => {
    const res = await api().get('/api/floors').set('Cookie', cookies).expect(200);

    expect(res.body.data).toEqual(['F1', 'F2', 'F10']);
  });

  it('GET /api/rooms/highest-seat-count returns the largest room', async () => {
    const res = await api().get('/api/rooms/highest-seat-count').set('Cookie', cookies).expect(200);

    expect(res.body.data).toBe(12);
  });
});
