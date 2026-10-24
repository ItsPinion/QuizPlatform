import { describe, expect, it } from 'vitest';

import {
  AREA,
  SITE_LINKS,
  SITE_SECTIONS,
  activeHref,
  activeSection,
  areaFor,
  isActivePath,
  pathnameOf,
} from './nav-sections';

describe('isActivePath', () => {
  it('matches the page itself', () => {
    expect(isActivePath('/student', '/student')).toBe(true);
    expect(isActivePath('/student/results', '/student/results')).toBe(true);
  });

  it('matches a path that continues after a slash', () => {
    expect(isActivePath('/student/results/42', '/student/results')).toBe(true);
    expect(isActivePath('/student/results', '/student')).toBe(true);
  });

  it('does not match a prefix that is not a path segment', () => {
    expect(isActivePath('/studentish', '/student')).toBe(false);
    expect(isActivePath('/stud', '/student')).toBe(false);
    expect(isActivePath('/admin', '/student')).toBe(false);
  });

  it('treats the root as exact only', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/login', '/')).toBe(false);
  });

  it('ignores external links and bare anchors', () => {
    expect(isActivePath('/student', 'https://github.com/x')).toBe(false);
    expect(isActivePath('/student', '#tour')).toBe(false);
  });

  it('ignores a query string on the link', () => {
    expect(isActivePath('/student/quizzes', '/student/quizzes?page=2')).toBe(true);
  });
});

describe('activeHref', () => {
  const links = [
    { href: '/student', label: 'Dashboard' },
    { href: '/student/results', label: 'Results' },
    { href: '/student/quizzes', label: 'Quizzes' },
  ];

  it('picks the most specific match', () => {
    expect(activeHref('/student/results', links)).toBe('/student/results');
    expect(activeHref('/student/results/9', links)).toBe('/student/results');
  });

  it('falls back to the shorter match when only it applies', () => {
    expect(activeHref('/student', links)).toBe('/student');
    expect(activeHref('/student/profile', links)).toBe('/student');
  });

  it('returns nothing when nothing matches', () => {
    expect(activeHref('/admin', links)).toBeNull();
    expect(activeHref('/', links)).toBeNull();
  });
});

describe('pathnameOf', () => {
  it('strips the origin and the query', () => {
    expect(pathnameOf('/a/b?c=1#d')).toBe('/a/b');
    expect(pathnameOf('https://quiz.dev/student?x=1')).toBe('/student');
  });
});

describe('areaFor', () => {
  it('knows both roles', () => {
    expect(areaFor('STUDENT')?.href).toBe('/student');
    expect(areaFor('ADMIN')?.href).toBe('/admin');
  });

  it('has nothing for a visitor or an unknown role', () => {
    expect(areaFor(null)).toBeNull();
    expect(areaFor('TEACHER')).toBeNull();
    expect(Object.keys(AREA)).toHaveLength(2);
  });
});

describe('activeSection', () => {
  it('returns the first visible section in page order', () => {
    expect(activeSection(['tour'], ['platform', 'tour'])).toBe('tour');
    expect(activeSection(['tour', 'platform'], ['platform', 'tour'])).toBe('platform');
  });

  it('returns nothing when no section is in view', () => {
    expect(activeSection([], ['platform', 'tour'])).toBeNull();
  });

  it('exposes the anchors the spy should watch', () => {
    expect(SITE_SECTIONS).toEqual(['platform', 'formats', 'tour']);
    expect(SITE_LINKS.filter((link) => link.hash)).toHaveLength(3);
  });
});
