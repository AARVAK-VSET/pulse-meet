import { BadRequestException, ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { CalenderService } from 'src/calender/calender.service';
import { at, conferenceRooms, ORGANIZER_EMAIL, people } from '../utils/fixtures';

const OAK = 'oak@resource.calendar.google.com'; // 4 seats, F1
const PINE = 'pine@resource.calendar.google.com'; // 8 seats, F2
const ELM = 'elm@resource.calendar.google.com'; // 12 seats, F10

const free = () => ({ busy: [] });
const busy = (start: string, end: string) => ({ busy: [{ start, end }] });

describe('CalenderService', () => {
  let service: CalenderService;
  let authService: { getDirectoryResources: jest.Mock; getPeopleResources: jest.Mock; getFloors: jest.Mock };
  let googleApi: Record<string, jest.Mock>;
  const client = {} as any;
  const logger = { log: jest.fn() } as unknown as Logger;

  beforeEach(() => {
    authService = {
      getDirectoryResources: jest.fn().mockResolvedValue(conferenceRooms()),
      getPeopleResources: jest.fn().mockResolvedValue(people()),
      getFloors: jest.fn().mockResolvedValue(['F1', 'F2', 'F10']),
    };
    googleApi = {
      getCalenderSchedule: jest.fn(),
      createCalenderEvent: jest.fn(),
      getCalenderEvent: jest.fn(),
      getCalenderEvents: jest.fn(),
      updateCalenderEvent: jest.fn(),
      deleteEvent: jest.fn(),
    };
    service = new CalenderService(authService as any, googleApi as any, logger);
  });

  describe('getAvailableRooms', () => {
    const start = at('10:00');
    const end = at('11:00');

    it('returns empty lists without calling Google when no room has enough seats', async () => {
      const result = await service.getAvailableRooms(client, start, end, 'UTC', 50);

      expect(result).toEqual({ preferred: [], others: [] });
      expect(googleApi.getCalenderSchedule).not.toHaveBeenCalled();
    });

    it('returns empty lists when the directory has no rooms', async () => {
      authService.getDirectoryResources.mockResolvedValue([]);

      await expect(service.getAvailableRooms(client, start, end, 'UTC', 1)).resolves.toEqual({ preferred: [], others: [] });
    });

    it('filters by minimum seats (inclusive) and only queries eligible rooms', async () => {
      googleApi.getCalenderSchedule.mockResolvedValue({ [PINE]: free(), [ELM]: free() });

      const result = await service.getAvailableRooms(client, start, end, 'UTC', 8);

      expect(googleApi.getCalenderSchedule).toHaveBeenCalledWith(client, start, end, 'UTC', [PINE, ELM]);
      expect(result.preferred.map((r) => r.email)).toEqual([PINE, ELM]);
    });

    it('coerces a string seat count coming from the query string', async () => {
      googleApi.getCalenderSchedule.mockResolvedValue({ [ELM]: free() });

      await service.getAvailableRooms(client, start, end, 'UTC', '10' as any);

      expect(googleApi.getCalenderSchedule).toHaveBeenCalledWith(client, start, end, 'UTC', [ELM]);
    });

    it('excludes rooms that are busy during the requested slot', async () => {
      googleApi.getCalenderSchedule.mockResolvedValue({ [OAK]: busy(at('10:30'), at('11:30')), [PINE]: free(), [ELM]: free() });

      const result = await service.getAvailableRooms(client, start, end, 'UTC', 1);

      expect(result.preferred.map((r) => r.email)).toEqual([PINE, ELM]);
    });

    it('treats back-to-back bookings as available', async () => {
      googleApi.getCalenderSchedule.mockResolvedValue({ [OAK]: busy(at('09:00'), at('10:00')), [PINE]: busy(at('11:00'), at('12:00')) });

      const result = await service.getAvailableRooms(client, start, end, 'UTC', 1);

      expect(result.preferred.map((r) => r.email)).toEqual([OAK, PINE]);
    });

    it('splits rooms into preferred (requested floor) and others', async () => {
      googleApi.getCalenderSchedule.mockResolvedValue({ [OAK]: free(), [PINE]: free(), [ELM]: free() });

      const result = await service.getAvailableRooms(client, start, end, 'UTC', 1, 'F2');

      expect(result.preferred.map((r) => r.email)).toEqual([PINE]);
      expect(result.others.map((r) => r.email)).toEqual([OAK, ELM]);
    });

    it('treats an empty floor as "any floor"', async () => {
      googleApi.getCalenderSchedule.mockResolvedValue({ [OAK]: free(), [PINE]: free(), [ELM]: free() });

      const result = await service.getAvailableRooms(client, start, end, 'UTC', 1, '');

      expect(result.others).toEqual([]);
      expect(result.preferred).toHaveLength(3);
    });

    it('returns no rooms when everything is booked', async () => {
      const allDay = busy(at('00:00'), at('23:59'));
      googleApi.getCalenderSchedule.mockResolvedValue({ [OAK]: allDay, [PINE]: allDay, [ELM]: allDay });

      await expect(service.getAvailableRooms(client, start, end, 'UTC', 1)).resolves.toEqual({ preferred: [], others: [] });
    });

    it('propagates Google API failures instead of reporting rooms as free', async () => {
      googleApi.getCalenderSchedule.mockRejectedValue(new Error('Google API quota exceeded'));

      await expect(service.getAvailableRooms(client, start, end, 'UTC', 1)).rejects.toThrow('Google API quota exceeded');
    });

    describe('when editing an existing event', () => {
      const existingEvent = {
        id: 'evt-1',
        start: { dateTime: at('10:00'), timeZone: 'UTC' },
        end: { dateTime: at('11:00'), timeZone: 'UTC' },
        attendees: [{ email: PINE, resource: true, responseStatus: 'accepted' }],
      };

      it("keeps the event's own room at the top even though it is 'busy' with that same event", async () => {
        googleApi.getCalenderEvent.mockResolvedValue(existingEvent);
        googleApi.getCalenderSchedule.mockResolvedValue({ [OAK]: free(), [PINE]: busy(at('10:00'), at('11:00')), [ELM]: free() });

        const result = await service.getAvailableRooms(client, at('10:00'), at('11:00'), 'UTC', 1, undefined, 'evt-1');

        expect(result.preferred.map((r) => r.email)).toEqual([PINE, OAK, ELM]);
      });

      it("drops the event's room when the extended slot collides with another booking", async () => {
        googleApi.getCalenderEvent.mockResolvedValue(existingEvent);
        googleApi.getCalenderSchedule.mockImplementation(async (_c, s, _e, _tz, rooms: string[]) => {
          // extension 11:00-11:30 for the event's own room is taken by someone else
          if (rooms.length === 1 && s === at('11:00')) return { [PINE]: busy(at('11:00'), at('12:00')) };
          return { [OAK]: free(), [PINE]: busy(at('10:00'), at('11:00')), [ELM]: free() };
        });

        const result = await service.getAvailableRooms(client, at('10:00'), at('11:30'), 'UTC', 1, undefined, 'evt-1');

        expect(result.preferred.map((r) => r.email)).toEqual([OAK, ELM]);
      });

      it('ignores rooms that declined the event', async () => {
        googleApi.getCalenderEvent.mockResolvedValue({ ...existingEvent, attendees: [{ email: PINE, resource: true, responseStatus: 'declined' }] });
        googleApi.getCalenderSchedule.mockResolvedValue({ [OAK]: free(), [PINE]: busy(at('10:00'), at('11:00')), [ELM]: free() });

        const result = await service.getAvailableRooms(client, at('10:00'), at('11:00'), 'UTC', 1, undefined, 'evt-1');

        expect(result.preferred.map((r) => r.email)).toEqual([OAK, ELM]);
      });
    });
  });

  describe('isRoomAvailable', () => {
    it('is false when the room is busy', async () => {
      googleApi.getCalenderSchedule.mockResolvedValue({ [OAK]: busy(at('10:00'), at('11:00')) });

      await expect(service.isRoomAvailable(client, at('10:30'), at('11:30'), OAK)).resolves.toBe(false);
    });

    it('is false when Google returns no calendar for the room', async () => {
      googleApi.getCalenderSchedule.mockResolvedValue({});

      await expect(service.isRoomAvailable(client, at('10:00'), at('11:00'), OAK)).resolves.toBe(false);
    });

    it('is true when the room is free', async () => {
      googleApi.getCalenderSchedule.mockResolvedValue({ [OAK]: free() });

      await expect(service.isRoomAvailable(client, at('10:00'), at('11:00'), OAK, 'UTC')).resolves.toBe(true);
      expect(googleApi.getCalenderSchedule).toHaveBeenCalledWith(client, at('10:00'), at('11:00'), 'UTC', [OAK]);
    });
  });

  describe('createEvent', () => {
    beforeEach(() => {
      googleApi.getCalenderSchedule.mockResolvedValue({ [PINE]: free() });
      googleApi.createCalenderEvent.mockImplementation(async (_c, event) => ({ ...event, id: 'evt-new', hangoutLink: 'https://meet.example.test/x' }));
    });

    it('books the room with organizer and attendees', async () => {
      const result = await service.createEvent(client, at('10:00'), at('11:00'), PINE, ORGANIZER_EMAIL, true, '  Standup ', [
        { email: 'alice@example.com', name: 'Alice' },
      ]);

      const sent = googleApi.createCalenderEvent.mock.calls[0][1];
      expect(sent.summary).toBe('Standup');
      expect(sent.attendees).toEqual([
        { email: 'alice@example.com', name: 'Alice', photo: undefined },
        { email: PINE },
        { email: ORGANIZER_EMAIL, organizer: true, responseStatus: 'accepted' },
      ]);
      expect(sent.conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet');
      expect(result).toMatchObject({ eventId: 'evt-new', room: 'Pine', roomEmail: PINE, seats: 8, floor: 'F2', isEditable: true });
    });

    it('defaults an empty title to "-" and skips conference data', async () => {
      await service.createEvent(client, at('10:00'), at('11:00'), PINE, ORGANIZER_EMAIL, false, '   ');

      const sent = googleApi.createCalenderEvent.mock.calls[0][1];
      expect(sent.summary).toBe('-');
      expect(sent.conferenceData).toBeUndefined();
    });

    it('drops oversized attendee photos', async () => {
      await service.createEvent(client, at('10:00'), at('11:00'), PINE, ORGANIZER_EMAIL, false, 't', [{ email: 'alice@example.com', photo: 'x'.repeat(2000) }]);

      expect(googleApi.createCalenderEvent.mock.calls[0][1].attendees[0].photo).toBe('');
    });

    it('rejects an unknown room', async () => {
      await expect(service.createEvent(client, at('10:00'), at('11:00'), 'nope@resource.calendar.google.com', ORGANIZER_EMAIL)).rejects.toThrow(
        NotFoundException,
      );
      expect(googleApi.createCalenderEvent).not.toHaveBeenCalled();
    });

    it('rejects a double booking with 409 Conflict', async () => {
      googleApi.getCalenderSchedule.mockResolvedValue({ [PINE]: busy(at('10:30'), at('11:30')) });

      await expect(service.createEvent(client, at('10:00'), at('11:00'), PINE, ORGANIZER_EMAIL)).rejects.toThrow(ConflictException);
      expect(googleApi.createCalenderEvent).not.toHaveBeenCalled();
    });

    it('rejects invalid attendee emails', async () => {
      await expect(service.createEvent(client, at('10:00'), at('11:00'), PINE, ORGANIZER_EMAIL, false, 't', [{ email: 'not-an-email' }])).rejects.toThrow(
        BadRequestException,
      );
      expect(googleApi.createCalenderEvent).not.toHaveBeenCalled();
    });
  });

  describe('updateEvent', () => {
    const event = () => ({
      id: 'evt-1',
      organizer: { email: ORGANIZER_EMAIL },
      start: { dateTime: at('10:00'), timeZone: 'UTC' },
      end: { dateTime: at('11:00'), timeZone: 'UTC' },
      attendees: [
        { email: PINE, resource: true },
        { email: ORGANIZER_EMAIL, organizer: true, responseStatus: 'accepted' },
      ],
    });

    beforeEach(() => {
      googleApi.getCalenderEvent.mockResolvedValue(event());
      googleApi.updateCalenderEvent.mockImplementation(async (_c, _id, e) => e);
    });

    it('forbids non-organizers from editing', async () => {
      await expect(service.updateEvent(client, 'evt-1', at('10:00'), at('11:00'), 'someone@example.com', PINE)).rejects.toThrow(ForbiddenException);
      expect(googleApi.updateCalenderEvent).not.toHaveBeenCalled();
    });

    it('rejects extending into a slot that is already booked', async () => {
      googleApi.getCalenderSchedule.mockResolvedValue({ [PINE]: busy(at('11:00'), at('12:00')) });

      await expect(service.updateEvent(client, 'evt-1', at('10:00'), at('11:30'), ORGANIZER_EMAIL, PINE)).rejects.toThrow(ConflictException);
    });

    it('does not re-check availability when the slot shrinks', async () => {
      await service.updateEvent(client, 'evt-1', at('10:15'), at('10:45'), ORGANIZER_EMAIL, PINE);

      expect(googleApi.getCalenderSchedule).not.toHaveBeenCalled();
      expect(googleApi.updateCalenderEvent).toHaveBeenCalled();
    });
  });

  describe('updateEventResponse', () => {
    it('forbids users who are not attendees', async () => {
      googleApi.getCalenderEvent.mockResolvedValue({ organizer: { email: ORGANIZER_EMAIL }, attendees: [{ email: ORGANIZER_EMAIL }] });

      await expect(service.updateEventResponse(client, 'stranger@example.com', 'evt-1', 'accepted')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('misc', () => {
    it('getHighestSeatCapacity returns the largest room, or -1 when there are none', async () => {
      await expect(service.getHighestSeatCapacity(client)).resolves.toBe(12);

      authService.getDirectoryResources.mockResolvedValue([]);
      await expect(service.getHighestSeatCapacity(client)).resolves.toBe(-1);
    });

    it('searchPeople matches case-insensitively and skips people without an email', async () => {
      await expect(service.searchPeople(client, 'ALICE')).resolves.toEqual([people()[0]]);
    });

    it('deleteEvent delegates to Google', async () => {
      await expect(service.deleteEvent(client, 'evt-1')).resolves.toEqual({ deleted: true });
      expect(googleApi.deleteEvent).toHaveBeenCalledWith(client, 'evt-1');
    });
  });
});
