/**
 * When a quiz may be taken.
 *
 * A published quiz is not necessarily an *open* quiz: an admin can schedule it
 * to open on Monday and close on Friday, and the whole product has to agree on
 * that. This module is the single answer, used by the API before an attempt is
 * created and by the catalogue and detail pages to explain a disabled button.
 *
 * Three states, and only three:
 *
 *   - `OPEN`      — now is inside the window (or there is no window);
 *   - `SCHEDULED` — opens later;
 *   - `CLOSED`    — the window has passed.
 *
 * A quiz with neither bound is open for as long as it is published, which is
 * the behaviour every quiz had before scheduling existed.
 */
export type AvailabilityState = 'OPEN' | 'SCHEDULED' | 'CLOSED';

export interface AvailabilityWindow {
  availableFrom?: string | number | Date | null;
  availableUntil?: string | number | Date | null;
}

export interface Availability {
  state: AvailabilityState;
  /** ISO timestamp of the opening, or null when there is no lower bound. */
  opensAt: string | null;
  /** ISO timestamp of the closing, or null when there is no upper bound. */
  closesAt: string | null;
}

function toMillis(value: string | number | Date | null | undefined): number | null {
  if (value == null) return null;
  const millis = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(millis) ? millis : null;
}

function toIso(value: string | number | Date | null | undefined): string | null {
  const millis = toMillis(value);
  return millis === null ? null : new Date(millis).toISOString();
}

/**
 * Where `now` sits relative to a window.
 *
 * Boundaries are inclusive at the start and exclusive at the end: a quiz that
 * closes at 17:00 is not open at 17:00. Equal start and end means a window of
 * zero length, which is closed — safer than accidentally leaving it open.
 */
export function availabilityOf(window: AvailabilityWindow, now: number = Date.now()): Availability {
  const from = toMillis(window.availableFrom);
  const until = toMillis(window.availableUntil);

  const opensAt = toIso(window.availableFrom);
  const closesAt = toIso(window.availableUntil);

  if (from !== null && now < from) return { state: 'SCHEDULED', opensAt, closesAt };
  if (until !== null && now >= until) return { state: 'CLOSED', opensAt, closesAt };

  return { state: 'OPEN', opensAt, closesAt };
}

/** Does this window admit an attempt right now? */
export function isOpen(window: AvailabilityWindow, now: number = Date.now()): boolean {
  return availabilityOf(window, now).state === 'OPEN';
}
