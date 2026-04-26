import type { IsoDateTime } from "./types.js";

export interface Clock {
  now(): Date;
  nowIso(): IsoDateTime;
}

export interface FixedClock extends Clock {
  readonly timestamp: IsoDateTime;
}

export function parseIsoDateTimeOffset(timestamp: IsoDateTime): number {
  if (timestamp.endsWith("Z")) {
    return 0;
  }

  const match = /([+-])(\d{2}):(\d{2})$/.exec(timestamp);
  if (match === null) {
    throw new Error(`Invalid ISO 8601 timestamp offset: ${timestamp}`);
  }

  const [, sign, hoursText, minutesText] = match;
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const offset = hours * 60 + minutes;

  return sign === "-" ? -offset : offset;
}

export function formatIsoDateTimeWithOffset(
  date: Date,
  offsetMinutes = -date.getTimezoneOffset()
): IsoDateTime {
  if (Number.isNaN(date.getTime())) {
    throw new Error("Cannot format an invalid Date.");
  }

  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hours = shifted.getUTCHours();
  const minutes = shifted.getUTCMinutes();
  const seconds = shifted.getUTCSeconds();
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainderMinutes = absoluteOffset % 60;

  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}${sign}${pad(offsetHours)}:${pad(offsetRemainderMinutes)}`;
}

export const systemClock: Clock = {
  now(): Date {
    return new Date();
  },
  nowIso(): IsoDateTime {
    return formatIsoDateTimeWithOffset(new Date());
  }
};

export function createFixedClock(timestamp: IsoDateTime): FixedClock {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid fixed clock timestamp: ${timestamp}`);
  }

  return {
    timestamp,
    now(): Date {
      return new Date(date.getTime());
    },
    nowIso(): IsoDateTime {
      return timestamp;
    }
  };
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}
