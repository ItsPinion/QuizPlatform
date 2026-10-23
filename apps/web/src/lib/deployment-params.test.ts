import { describe, expect, it } from 'vitest';

import {
  actionableChecks,
  countsLabel,
  hostLabel,
  latencyLabel,
  runtimeLabel,
  statusGlyphTone,
  statusTone,
  STATUS_GLYPHS,
  STATUS_LABELS,
  verdictTone,
  VERDICT_LABELS,
} from './deployment-params';

describe('labels', () => {
  it('names every verdict and status', () => {
    expect(VERDICT_LABELS.ready).toBe('Ready to serve');
    expect(VERDICT_LABELS.blocked).toMatch(/not ready/i);
    expect(STATUS_LABELS.fail).toBe('Failure');
    expect(STATUS_GLYPHS.skip).toBe('–');
  });

  it('gives each status its own tone', () => {
    const tones = (['pass', 'warn', 'fail', 'skip'] as const).map(statusTone);

    expect(new Set(tones).size).toBe(4);
    expect(statusTone('pass')).toContain('success');
    expect(statusTone('fail')).toContain('destructive');
    expect(statusGlyphTone('warn')).toContain('warning');
  });

  it('colours the verdict banner by severity', () => {
    expect(verdictTone('ready')).toContain('success');
    expect(verdictTone('attention')).toContain('warning');
    expect(verdictTone('blocked')).toContain('destructive');
  });
});

describe('runtimeLabel', () => {
  it('shows minutes for a fresh process', () => {
    expect(runtimeLabel(92.4, 60)).toBe('92.4 MB · 1m up');
  });

  it('adds hours and days once they exist', () => {
    expect(runtimeLabel(100, 3_600)).toBe('100 MB · 1h 0m up');
    expect(runtimeLabel(100, 90_000)).toBe('100 MB · 1d 1h 0m up');
  });

  it('never renders a negative uptime', () => {
    expect(runtimeLabel(50, -10)).toBe('50 MB · 0m up');
  });
});

describe('latencyLabel', () => {
  it('formats a slow round trip', () => {
    expect(latencyLabel(12.444)).toBe('12.44 ms');
    expect(latencyLabel(0)).toBe('0 ms');
  });

  it('says so when the database did not answer', () => {
    expect(latencyLabel(null)).toBe('no answer');
  });
});

describe('countsLabel', () => {
  it('summarises the row counts', () => {
    expect(countsLabel({ users: 4, quizzes: 10, attempts: 15 })).toBe(
      '4 users · 10 quizzes · 15 attempts',
    );
  });

  it('pluralises a single row', () => {
    expect(countsLabel({ users: 1, quizzes: 1, attempts: 1 })).toBe('1 user · 1 quiz · 1 attempt');
  });

  it('explains an unavailable database', () => {
    expect(countsLabel(null)).toMatch(/did not answer/);
  });
});

describe('actionableChecks', () => {
  it('keeps failures and warnings, in that order of appearance', () => {
    const checks = [
      { id: 'a', status: 'pass' as const },
      { id: 'b', status: 'warn' as const },
      { id: 'c', status: 'skip' as const },
      { id: 'd', status: 'fail' as const },
    ];

    expect(actionableChecks(checks).map((entry) => entry.id)).toEqual(['b', 'd']);
  });

  it('is empty when everything passes', () => {
    expect(actionableChecks([{ status: 'pass' as const }])).toEqual([]);
  });
});

describe('hostLabel', () => {
  it('reduces a URL to its host', () => {
    expect(hostLabel('http://quiz-api:3001')).toBe('quiz-api:3001');
    expect(hostLabel('https://quiz.example.com/api')).toBe('quiz.example.com');
  });

  it('passes through what it cannot parse', () => {
    expect(hostLabel('not a url')).toBe('not a url');
    expect(hostLabel(null)).toBe('not set');
  });
});
