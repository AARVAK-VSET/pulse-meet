/**
 * Tests for convertToRFC3339 (client/src/helpers/utility.ts).
 *
 * The bug being fixed: the old implementation computed the UTC offset for
 * "right now" rather than for the meeting's own date, and used it to shift
 * an already-converted timestamp - correct only when the meeting falls on a
 * date with the same DST status as today, and wrong (by up to an hour)
 * whenever it doesn't. It also parsed "<date> <time>" with the built-in
 * Date constructor, a format that is not standardised and that WebKit does
 * not reliably accept. These tests pin down the exact RFC 3339 output for
 * positive, negative and zero offsets, specifically across a DST boundary,
 * and cover the inputs that previously produced Invalid Date.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { convertToRFC3339 } from '../utility';

describe('convertToRFC3339', () => {
  const originalTZ = process.env.TZ;

  function withTimeZone(tz: string, run: () => void) {
    process.env.TZ = tz;
    try {
      run();
    } finally {
      process.env.TZ = originalTZ;
    }
  }

  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  // ---- exact RFC 3339 output, one case per kind of offset -----------------

  it('produces the exact RFC 3339 string for a zero (UTC) offset', () => {
    withTimeZone('UTC', () => {
      expect(convertToRFC3339('2026-09-22', '2:30 PM')).toBe('2026-09-22T14:30:00+00:00');
    });
  });

  it('produces the exact RFC 3339 string for a positive, non-hour-aligned offset (+05:30)', () => {
    withTimeZone('Asia/Kolkata', () => {
      expect(convertToRFC3339('2026-09-22', '2:30 PM')).toBe('2026-09-22T14:30:00+05:30');
    });
  });

  it('produces the exact RFC 3339 string for a negative offset (-05:00)', () => {
    withTimeZone('America/New_York', () => {
      // Sept 22 is during US daylight saving time, so New York is UTC-4, not UTC-5.
      expect(convertToRFC3339('2026-09-22', '2:30 PM')).toBe('2026-09-22T14:30:00-04:00');
    });
  });

  it('produces the exact RFC 3339 string for a negative offset outside daylight saving (-05:00)', () => {
    withTimeZone('America/New_York', () => {
      expect(convertToRFC3339('2026-01-15', '2:30 PM')).toBe('2026-01-15T14:30:00-05:00');
    });
  });

  it('produces the exact RFC 3339 string for an extreme positive offset (+14:00)', () => {
    withTimeZone('Pacific/Kiritimati', () => {
      expect(convertToRFC3339('2026-09-22', '2:30 PM')).toBe('2026-09-22T14:30:00+14:00');
    });
  });

  // ---- would have failed under the old double-shift bug -------------------

  it('uses the offset that applies on the meeting date, not on the date the code runs (regression guard)', () => {
    // This is the case the old implementation got wrong: it read *today's* UTC
    // offset (getTimezoneOffset() has no notion of "the offset on some other
    // date") and reused it for a meeting on a date with a different DST status.
    // "Today" here is whatever date vitest runs on; a meeting six months out
    // reliably lands on the other side of a Northern-hemisphere DST boundary.
    withTimeZone('America/New_York', () => {
      const summer = convertToRFC3339('2026-07-15', '2:30 PM'); // EDT, -04:00
      const winter = convertToRFC3339('2026-01-15', '2:30 PM'); // EST, -05:00

      expect(summer).toBe('2026-07-15T14:30:00-04:00');
      expect(winter).toBe('2026-01-15T14:30:00-05:00');
      // Same wall-clock time in the string; only the offset suffix should differ.
      expect(summer.slice(11, 16)).toBe(winter.slice(11, 16));
    });
  });

  it('gets the correct offset right at a DST transition (America/New_York, spring 2026)', () => {
    withTimeZone('America/New_York', () => {
      // Clocks spring forward on 2026-03-08 in the US.
      expect(convertToRFC3339('2026-03-07', '2:30 PM')).toBe('2026-03-07T14:30:00-05:00');
      expect(convertToRFC3339('2026-03-08', '2:30 PM')).toBe('2026-03-08T14:30:00-04:00');
    });
  });

  it('gives the same wall-clock hour and minute in every timezone (only the offset changes)', () => {
    for (const tz of ['UTC', 'Asia/Kolkata', 'America/New_York', 'Pacific/Kiritimati']) {
      withTimeZone(tz, () => {
        const result = convertToRFC3339('2026-09-22', '2:30 PM');
        expect(result.slice(0, 16)).toBe('2026-09-22T14:30');
      });
    }
  });

  // ---- boundary times -------------------------------------------------------

  it('handles midnight (12:00 AM) correctly', () => {
    withTimeZone('UTC', () => {
      expect(convertToRFC3339('2026-09-22', '12:00 AM')).toBe('2026-09-22T00:00:00+00:00');
    });
  });

  it('handles noon (12:00 PM) correctly', () => {
    withTimeZone('UTC', () => {
      expect(convertToRFC3339('2026-09-22', '12:00 PM')).toBe('2026-09-22T12:00:00+00:00');
    });
  });

  it('handles the last quarter-hour slot of the day (11:45 PM)', () => {
    withTimeZone('UTC', () => {
      expect(convertToRFC3339('2026-09-22', '11:45 PM')).toBe('2026-09-22T23:45:00+00:00');
    });
  });

  // ---- accepts both time formats the app can pass in -----------------------

  it('accepts 24-hour time strings ("14:30") as well as 12-hour ("2:30 PM")', () => {
    withTimeZone('UTC', () => {
      expect(convertToRFC3339('2026-09-22', '14:30')).toBe(convertToRFC3339('2026-09-22', '2:30 PM'));
    });
  });

  // ---- would have crashed (Invalid Date) under the old implementation -------

  it('does not produce "Invalid Date" for any input it is expected to handle', () => {
    withTimeZone('UTC', () => {
      const result = convertToRFC3339('2026-09-22', '2:30 PM');
      expect(result).not.toContain('Invalid');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    });
  });

  // ---- malformed input is rejected loudly, not silently miscalculated -------

  it('throws rather than silently miscalculating on an unparsable time', () => {
    withTimeZone('UTC', () => {
      expect(() => convertToRFC3339('2026-09-22', 'not a time')).toThrow();
    });
  });

  it('throws rather than silently miscalculating on an unparsable date', () => {
    withTimeZone('UTC', () => {
      expect(() => convertToRFC3339('not-a-date', '2:30 PM')).toThrow();
    });
  });

  it('rejects an out-of-range time value instead of overflowing into the next day', () => {
    withTimeZone('UTC', () => {
      // 13:30 PM is not a valid 12-hour time; strict parsing must reject it rather
      // than silently wrapping.
      expect(() => convertToRFC3339('2026-09-22', '13:30 PM')).toThrow();
    });
  });
});
