import { extractRoomByEmail, isRoomAvailable, validateEmail } from 'src/calender/util/calender.util';
import { toMs } from 'src/helpers/helper.util';
import { at, conferenceRooms } from '../utils/fixtures';

describe('calender.util', () => {
  describe('isRoomAvailable', () => {
    const busy = [{ start: at('10:00'), end: at('11:00') }];
    const check = (start: string, end: string, busyTimes = busy) => isRoomAvailable(busyTimes, new Date(start), new Date(end));

    it('is available when there are no bookings', () => {
      expect(check(at('10:00'), at('11:00'), [])).toBe(true);
    });

    it.each([
      ['exact same slot', '10:00', '11:00'],
      ['overlapping the start', '09:30', '10:30'],
      ['overlapping the end', '10:30', '11:30'],
      ['inside the booking', '10:15', '10:45'],
      ['surrounding the booking', '09:00', '12:00'],
    ])('is unavailable when %s', (_, start, end) => {
      expect(check(at(start), at(end))).toBe(false);
    });

    it.each([
      ['ending exactly when the booking starts', '09:00', '10:00'],
      ['starting exactly when the booking ends', '11:00', '12:00'],
    ])('is available when %s', (_, start, end) => {
      expect(check(at(start), at(end))).toBe(true);
    });

    it('is available for the same time on a different day', () => {
      expect(check(at('10:00', '2030-01-16'), at('11:00', '2030-01-16'))).toBe(true);
    });

    it('checks every busy slot, not just the first', () => {
      const busyTimes = [...busy, { start: at('14:00'), end: at('15:00') }];

      expect(check(at('14:30'), at('14:45'), busyTimes)).toBe(false);
      expect(check(at('12:00'), at('13:00'), busyTimes)).toBe(true);
    });
  });

  describe('extractRoomByEmail', () => {
    it('matches case-insensitively', () => {
      expect(extractRoomByEmail(conferenceRooms(), 'PINE@resource.calendar.google.com')?.name).toBe('Pine');
    });

    it.each([['unknown@resource.calendar.google.com'], [undefined], ['']])('returns null for %p', (email) => {
      expect(extractRoomByEmail(conferenceRooms(), email)).toBeNull();
    });

    it('returns null when there are no rooms', () => {
      expect(extractRoomByEmail([], 'pine@resource.calendar.google.com')).toBeNull();
    });
  });

  describe('validateEmail', () => {
    it.each(['alice@example.com', 'first.last+tag@sub.example.co.uk'])('accepts %s', (email) => {
      expect(validateEmail(email)).toBeTruthy();
    });

    it.each(['', 'plainaddress', '@example.com', 'alice@', 'alice@example', 'a b@example.com', undefined])('rejects %p', (email) => {
      expect(validateEmail(email)).toBeFalsy();
    });
  });
});

describe('helper.util toMs', () => {
  it.each([
    ['30s', 30_000],
    ['5m', 300_000],
    ['2h', 7_200_000],
    ['15d', 1_296_000_000],
  ])('converts %s', (input, expected) => {
    expect(toMs(input)).toBe(expected);
  });

  it('rejects malformed input', () => {
    expect(() => toMs('abc')).toThrow('Invalid time format');
    expect(() => toMs('5w')).toThrow('Unknown time unit: w');
  });
});
