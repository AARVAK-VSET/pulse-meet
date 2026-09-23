import { IConferenceRoom, IPeopleInformation } from '@pulse-meet/shared';
import { admin_directory_v1, people_v1 } from 'googleapis';

export const ORGANIZER_EMAIL = 'organizer@example.com';
export const TEST_DOMAIN = 'example.com';

/** Raw Google Admin Directory calendar resources, as returned by the Google API. */
export const directoryRooms = (): admin_directory_v1.Schema$CalendarResource[] => [
  { resourceId: 'r-oak', resourceName: 'Oak', resourceEmail: 'oak@resource.calendar.google.com', floorName: 'F1', capacity: 4 },
  { resourceId: 'r-pine', resourceName: 'Pine', resourceEmail: 'pine@resource.calendar.google.com', floorName: 'F2', capacity: 8 },
  { resourceId: 'r-elm', resourceName: 'Elm', resourceEmail: 'elm@resource.calendar.google.com', floorName: 'F10', capacity: 12 },
];

/** The same rooms, mapped to the app's IConferenceRoom shape and sorted by seats. */
export const conferenceRooms = (): IConferenceRoom[] =>
  directoryRooms().map((r) => ({
    id: r.resourceId,
    name: r.resourceName,
    email: r.resourceEmail,
    floor: r.floorName,
    seats: r.capacity,
    description: undefined,
  }));

export const directoryPeople = (): people_v1.Schema$Person[] => [
  {
    names: [{ displayName: 'Alice Doe', metadata: { primary: true } }],
    emailAddresses: [{ value: 'alice@example.com', metadata: { primary: true, verified: true } }],
    photos: [{ url: 'https://example.com/alice.png', metadata: { primary: true } }],
  },
  {
    names: [{ displayName: 'Bob Unverified', metadata: { primary: true } }],
    emailAddresses: [{ value: 'bob@example.com', metadata: { primary: true, verified: false } }],
  },
];

export const people = (): IPeopleInformation[] => [
  { email: 'alice@example.com', name: 'Alice Doe', photo: 'https://example.com/alice.png' },
  { email: undefined, name: 'Bob Unverified', photo: undefined },
];

/** Builds an ISO timestamp for a fixed day so tests are timezone- and clock-independent. */
export const at = (hhmm: string, day = '2030-01-15'): string => new Date(`${day}T${hhmm}:00.000Z`).toISOString();
