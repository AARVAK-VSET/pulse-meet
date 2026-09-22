import { IConferenceRoom } from '@pulse-meet/shared';
import { BusyTimes } from '../interfaces/freebusy.interface';

export function isRoomAvailable(busyTimes: BusyTimes[], startTime: Date, endTime: Date) {
  for (const timeSlot of busyTimes) {
    const busyStart = new Date(timeSlot.start);
    const busyEnd = new Date(timeSlot.end);

    if (startTime < busyEnd && endTime > busyStart) {
      return false;
    }
  }

  return true;
}

export function extractRoomByEmail(rooms: IConferenceRoom[], email: string) {
  const targetEmail = String(email).toLowerCase();
  const index = rooms.findIndex((room) => String(room.email).toLowerCase() === targetEmail);
  if (index !== -1) {
    return rooms[index];
  }

  return null;
}

export const validateEmail = (email: string) => {
  return String(email)
    .toLowerCase()
    .match(
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
    );
};
