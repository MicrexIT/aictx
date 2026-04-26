import { describe, expect, it } from "vitest";

import {
  createFixedClock,
  formatIsoDateTimeWithOffset,
  parseIsoDateTimeOffset,
  systemClock
} from "../../../src/core/clock.js";
import {
  createFixedTestClock,
  FIXED_TIMESTAMP,
  FIXED_TIMESTAMP_NEXT_MINUTE
} from "../../fixtures/time.js";

const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

describe("core clock", () => {
  it("returns stable fixed dates and timestamps", () => {
    const clock = createFixedTestClock();

    expect(clock.nowIso()).toBe(FIXED_TIMESTAMP);
    expect(clock.nowIso()).toBe(FIXED_TIMESTAMP);
    expect(clock.now().getTime()).toBe(clock.now().getTime());
  });

  it("preserves explicit fixed timestamp offsets", () => {
    const clock = createFixedClock(FIXED_TIMESTAMP_NEXT_MINUTE);

    expect(clock.nowIso()).toBe("2026-04-25T14:01:00+02:00");
    expect(parseIsoDateTimeOffset(clock.nowIso())).toBe(120);
  });

  it("formats timestamps with positive offsets", () => {
    const date = new Date("2026-04-25T12:00:00Z");

    expect(formatIsoDateTimeWithOffset(date, 120)).toBe("2026-04-25T14:00:00+02:00");
  });

  it("formats timestamps with negative offsets", () => {
    const date = new Date("2026-04-25T12:00:00Z");

    expect(formatIsoDateTimeWithOffset(date, -300)).toBe("2026-04-25T07:00:00-05:00");
  });

  it("formats timestamps with UTC offsets", () => {
    const date = new Date("2026-04-25T12:00:00Z");

    expect(formatIsoDateTimeWithOffset(date, 0)).toBe("2026-04-25T12:00:00+00:00");
  });

  it("returns system dates and schema-compatible system timestamps", () => {
    expect(systemClock.now()).toBeInstanceOf(Date);
    expect(systemClock.nowIso()).toMatch(ISO_DATE_TIME_PATTERN);
  });
});
