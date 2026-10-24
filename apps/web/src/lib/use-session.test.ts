// @vitest-environment jsdom

import type { AuthUser } from '@quiz/shared/auth';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The header's session, which is where the reported bug lived.
 *
 * "Sometimes the dashboard button doesn't show up, it still shows Sign up" was a
 * stale module snapshot: the visitor arrived as a guest (so the snapshot said
 * guest), signed in, and the header — a component that persists across the
 * navigation — kept rendering from the snapshot it had already read. The seed
 * the *server* hands a page now wins, and `adoptSession` publishes the account
 * the API just signed in.
 *
 * `@/lib/api` is mocked because these tests are about the state machine, not the
 * network: `me.$get` answers "not signed in", which is exactly the state the
 * header is in before anything is adopted. The module is re-imported per test so
 * the module-level snapshot starts clean.
 */

vi.mock('@/lib/api', () => ({
  client: {
    api: {
      auth: {
        me: { $get: async () => ({ ok: false, json: async () => ({}) }) },
        logout: { $post: async () => ({ ok: true }) },
      },
    },
  },
}));

const STUDENT: AuthUser = {
  id: 'student-1',
  name: 'Ada Lovelace',
  email: 'ada@quiz.dev',
  role: 'STUDENT',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const ADMIN: AuthUser = { ...STUDENT, id: 'admin-1', role: 'ADMIN', email: 'admin@quiz.dev' };

let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  container.remove();
  vi.resetModules();
});

/** Loads a fresh copy of the module, wrapper and all. */
async function loadSession() {
  const session = await import('./use-session');

  function Status({ seed }: { seed?: AuthUser | null }) {
    const state = session.useSession(seed);

    return createElement(
      'span',
      { 'data-status': state.status },
      state.status === 'authenticated' ? `signed in as ${state.user.role}` : state.status,
    );
  }

  return { session, Status };
}

async function render(children: React.ReactElement) {
  root = createRoot(container);

  await act(async () => {
    root?.render(children);
  });
}

function status(): string | null {
  return container.querySelector('span')?.getAttribute('data-status') ?? null;
}

describe('useSession', () => {
  it('paints the server’s account on the first frame, over a guest snapshot', async () => {
    const { Status } = await loadSession();

    // First page: the visitor is a guest, so the snapshot becomes "guest".
    await render(createElement(Status, { seed: null }));
    expect(status()).toBe('guest');

    // Then they sign in and land on a page whose server seed knows them. The
    // snapshot still says guest; the header must not.
    await act(async () => {
      root?.render(createElement(Status, { seed: STUDENT }));
    });

    expect(status()).toBe('authenticated');
  });

  it('adopts the account a sign-in returns, without a second request', async () => {
    const { session, Status } = await loadSession();

    await render(createElement(Status, { seed: null }));
    expect(status()).toBe('guest');

    await act(async () => {
      session.adoptSession(ADMIN);
    });

    expect(status()).toBe('authenticated');
  });

  it('shows the guest state after signing out', async () => {
    const { session, Status } = await loadSession();

    await render(createElement(Status, { seed: STUDENT }));
    expect(status()).toBe('authenticated');

    await act(async () => {
      await session.signOutEverywhere();
    });

    expect(status()).toBe('guest');
  });

  it('keeps the server’s account when the snapshot already agrees', async () => {
    const { session, Status } = await loadSession();

    session.adoptSession(STUDENT);
    await render(createElement(Status, { seed: STUDENT }));

    expect(status()).toBe('authenticated');
  });

  it('does not overwrite a signed-in snapshot with a page that was rendered for a guest', async () => {
    const { session, Status } = await loadSession();

    session.adoptSession(STUDENT);
    await render(createElement(Status, { seed: null }));

    // The client knows better than a stale render: the live session wins until
    // the API or a sign-out says otherwise.
    expect(status()).toBe('authenticated');
  });
});
