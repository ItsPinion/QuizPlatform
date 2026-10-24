import { describe, expect, it } from 'vitest';

import {
  AMBIENCE_START_EVENTS,
  ambienceToggleLabel,
  ambienceTooltip,
  MUSIC_STORAGE_KEY,
  parseMusicPreference,
  serializeMusicPreference,
  shouldArmStarters,
} from './ambience';

describe('stored preference', () => {
  it('reads the two choices this build writes', () => {
    expect(parseMusicPreference('on')).toBe('on');
    expect(parseMusicPreference('muted')).toBe('muted');
  });

  it('keeps honouring the value older builds wrote', () => {
    expect(parseMusicPreference('off')).toBe('muted');
  });

  it('treats anything else as a first visit, never as "on"', () => {
    for (const raw of [null, undefined, '', 'yes', 'ON ', 'true']) {
      expect(parseMusicPreference(raw)).toBe('unset');
    }
  });

  it('round-trips what the toggle writes', () => {
    for (const preference of ['on', 'muted'] as const) {
      expect(parseMusicPreference(serializeMusicPreference(preference))).toBe(preference);
    }
  });

  it('keyed under a stable name', () => {
    expect(MUSIC_STORAGE_KEY).toBe('quiz:music');
  });
});

describe('starting', () => {
  it('arms the automatic starters only when music is wanted', () => {
    expect(shouldArmStarters('on')).toBe(true);
    expect(shouldArmStarters('muted')).toBe(false);
    expect(shouldArmStarters('unset')).toBe(false);
  });

  it('listens for the earliest legal interaction — not just a click', () => {
    expect(AMBIENCE_START_EVENTS).toEqual(
      expect.arrayContaining(['pointermove', 'pointerdown', 'keydown', 'touchstart']),
    );
    // No duplicates: a duplicated listener would have to be removed twice.
    expect(new Set(AMBIENCE_START_EVENTS).size).toBe(AMBIENCE_START_EVENTS.length);
  });
});

describe('wording', () => {
  it('names the state, not the action', () => {
    expect(ambienceToggleLabel(true)).toMatch(/turn off/i);
    expect(ambienceToggleLabel(false)).toMatch(/play/i);
  });

  it('explains the wait when the browser has not allowed sound yet', () => {
    expect(ambienceTooltip(false, 'on')).toMatch(/waiting/i);
    expect(ambienceTooltip(false, 'on')).toMatch(/click|key/i);
  });

  it('says a remembered mute is remembered', () => {
    expect(ambienceTooltip(false, 'muted')).toMatch(/remembered/i);
    expect(ambienceTooltip(false, 'unset')).toMatch(/off/i);
    expect(ambienceTooltip(true, 'on')).toMatch(/on/i);
  });
});
