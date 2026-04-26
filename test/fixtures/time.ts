import { createFixedClock } from "../../src/core/clock.js";
import type { IsoDateTime } from "../../src/core/types.js";

export const FIXED_TIMESTAMP: IsoDateTime = "2026-04-25T14:00:00+02:00";
export const FIXED_TIMESTAMP_NEXT_MINUTE: IsoDateTime = "2026-04-25T14:01:00+02:00";

export function createFixedTestClock(timestamp: IsoDateTime = FIXED_TIMESTAMP) {
  return createFixedClock(timestamp);
}
