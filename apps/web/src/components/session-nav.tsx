'use client';

import type { AuthUser } from '@quiz/shared/auth';
import { LayoutDashboard, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { client } from '@/lib/api';
import { cn } from '@/lib/utils';

type SessionState =
  { status: 'loading' } | { status: 'guest' } | { status: 'authenticated'; user: AuthUser };

/**
 * Session-aware header controls.
 *
 * The cookie is httpOnly, so the browser cannot inspect it — the only way to
 * know who is signed in is to ask the API.
 *
 * The area button used to be a `sm` ghost link reading "My area": 32px tall,
 * transparent, in a row of outlines, and effectively invisible to anyone who
 * had just signed in. It is now the only filled button in the header, 44px
 * tall, with an icon and a sentence-case label that says where it goes.
 */
export function SessionNav() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await client.api.auth.me.$get();

      if (res.ok) {
        const body = await res.json();
        setSession({ status: 'authenticated', user: body.user });
        return;
      }

      setSession({ status: 'guest' });
    } catch {
      // API unreachable (for example while the database is not configured yet).
      setSession({ status: 'guest' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function signOut() {
    setSigningOut(true);

    try {
      await client.api.auth.logout.$post();
    } finally {
      setSession({ status: 'guest' });
      setSigningOut(false);
      router.refresh();
    }
  }

  if (session.status === 'loading') {
    return <div className="bg-muted/50 h-9 w-32 animate-pulse rounded-lg" aria-hidden="true" />;
  }

  if (session.status === 'guest') {
    return (
      <>
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: 'ghost', size: 'default' }), 'text-[13px]')}
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className={cn(buttonVariants({ size: 'default' }), 'shine text-[13px] font-semibold')}
        >
          Get started
        </Link>
      </>
    );
  }

  const { user } = session;
  const isAdmin = user.role === 'ADMIN';
  const areaHref = isAdmin ? '/admin' : '/student';

  return (
    <>
      <Link
        href={areaHref}
        className={cn(
          buttonVariants({ size: 'default' }),
          'shine shadow-primary/40 h-10 gap-2 rounded-lg px-3.5 text-[13px] font-semibold shadow-[0_10px_30px_-14px] sm:px-4',
        )}
      >
        {isAdmin ? (
          <ShieldCheck aria-hidden className="size-4" />
        ) : (
          <LayoutDashboard aria-hidden className="size-4" />
        )}
        <span className="hidden sm:inline">{isAdmin ? 'Admin console' : 'My dashboard'}</span>
        <span className="sm:hidden">{isAdmin ? 'Admin' : 'Dashboard'}</span>
      </Link>

      <div className="border-border/70 bg-card/60 hidden items-center gap-2 rounded-full border py-1 pr-3 pl-1 lg:flex">
        <span className="bg-primary/15 text-primary grid size-6 place-items-center rounded-full">
          {isAdmin ? <ShieldCheck className="size-3.5" /> : <UserRound className="size-3.5" />}
        </span>
        <span className="max-w-32 truncate text-xs font-medium">{user.name}</span>
        <Badge variant={isAdmin ? 'warning' : 'secondary'} className="text-[10px]">
          {user.role}
        </Badge>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={signOut}
        disabled={signingOut}
        aria-label="Sign out"
      >
        <LogOut />
        <span className="hidden lg:inline">{signingOut ? 'Signing out…' : 'Sign out'}</span>
      </Button>
    </>
  );
}
