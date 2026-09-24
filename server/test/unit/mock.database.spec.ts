import { CalenderMockDb } from '../../src/google-api/mock.database';

describe('CalenderMockDb', () => {
  let db: CalenderMockDb;
  let store: Map<string, unknown>;

  beforeEach(() => {
    store = new Map();

    const cacheManager = {
      get: jest.fn(async (key: string) => store.get(key)),
      set: jest.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
    };

    db = new CalenderMockDb(cacheManager as any);
  });

  it('creates, updates and lists events safely', async () => {
    const created = await db.createEvent({
      summary: 'Test Meeting',
      start: { dateTime: '2026-09-25T10:00:00.000Z' },
      end: { dateTime: '2026-09-25T11:00:00.000Z' },
    });

    expect(created.id).toBeDefined();

    const updated = await db.updateEvent(created.id!, {
      summary: 'Updated Meeting',
    });

    expect(updated?.summary).toBe('Updated Meeting');

    const events = await db.listEvents(
      '2026-09-25T00:00:00.000Z',
      '2026-09-26T00:00:00.000Z',
    );

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(created.id);
  });

  it('lists events without attendees without crashing', async () => {
    await db.createEvent({
      summary: 'Solo Meeting',
      start: { dateTime: '2026-09-25T10:00:00.000Z' },
      end: { dateTime: '2026-09-25T11:00:00.000Z' },
    });

    await expect(db.listEvents()).resolves.toHaveLength(1);
  });

  it('contains a valid Cascade room email', async () => {
    const rooms = await db.getRooms();
    const cascade = rooms.find((room) => room.resourceName === 'Cascade');

    expect(cascade?.resourceEmail).toBe(
      'cascade.room@resource.calendar.google.com',
    );
  });
});