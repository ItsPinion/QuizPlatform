import { describe, expect, it } from 'vitest';

import { availabilityOf, isOpen } from './availability';

const NOW = Date.parse('2026-10-24T12:00:00.000Z');

describe('availabilityOf', () => {
  it('is open when there is no window at all', () => {
    expect(availabilityOf({}, NOW)).toEqual({ state: 'OPEN', opensAt: null, closesAt: null });
  });

  it('is open inside the window', () => {
    const window = {
      availableFrom: '2026-10-24T09:00:00.000Z',
      availableUntil: '2026-10-24T18:00:00.000Z',
    };
    expect(availabilityOf(window, NOW).state).toBe('OPEN');
  });

  it('is scheduled before it opens', () => {
    const window = { availableFrom: '2026-10-25T09:00:00.000Z' };
    expect(availabilityOf(window, NOW).state).toBe('SCHEDULED');
  });

  it('is closed at the closing instant, not a millisecond later', () => {
    const window = { availableUntil: '2026-10-24T12:00:00.000Z' };
    expect(availabilityOf(window, NOW).state).toBe('CLOSED');
  });

  it('opens exactly at the opening instant', () => {
    const window = { availableFrom: '2026-10-24T12:00:00.000Z' };
    expect(availabilityOf(window, NOW).state).toBe('OPEN');
  });

  it('treats an equal start and end as closed, never as always-open', () => {
    const at = '2026-10-24T12:00:00.000Z';
    expect(availabilityOf({ availableFrom: at, availableUntil: at }, NOW).state).toBe('CLOSED');
  });

  it('accepts Dates and milliseconds as well as strings', () => {
    const window = { availableFrom: new Date('2026-10-24T11:00:00.000Z'), availableUntil: NOW };
    const result = availabilityOf(window, NOW);
    expect(result.state).toBe('CLOSED');
    expect(result.opensAt).toBe('2026-10-24T11:00:00.000Z');
  });

  it('ignores an unparseable bound rather than closing the quiz', () => {
    expect(availabilityOf({ availableUntil: 'not a date' }, NOW).state).toBe('OPEN');
  });

  it('isOpen is the same answer in one word', () => {
    expect(isOpen({ availableUntil: '2027-01-01T00:00:00.000Z' }, NOW)).toBe(true);
    expect(isOpen({ availableFrom: '2027-01-01T00:00:00.000Z' }, NOW)).toBe(false);
  });
});
