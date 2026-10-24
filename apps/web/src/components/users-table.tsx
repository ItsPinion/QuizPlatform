'use client';

import type { AdminUser } from '@quiz/shared/admin';
import {
  ArrowUpRight,
  Loader2,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { client } from '@/lib/api';
import { parseApiFailure, toApiFailure } from '@/lib/api-error';
import { initials, relativeDay } from '@/lib/admin-params';
import { cn } from '@/lib/utils';

interface Props {
  users: AdminUser[];
  /** The signed-in admin: their own row is read-only, matching the API rule. */
  currentUserId: string;
}

type PatchBody = { role?: 'ADMIN' | 'STUDENT'; status?: 'ACTIVE' | 'INACTIVE' };

/**
 * User directory with inline role/status editing.
 *
 * Every action is a `PATCH /api/admin/users/:id`; the API decides, and the UI
 * only displays the answer. `router.refresh()` then re-renders the server
 * component so counts and pagination stay truthful after a change.
 */
export function UsersTable({ users, currentUserId }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Deleting a person.
   *
   * Two clicks, and the second one says what it will take with it. There is no
   * undo, so the confirmation names the number of attempts that go too — an
   * administrator should not have to guess what "delete" cascades to.
   */
  async function remove(id: string) {
    setPendingId(id);
    setError(null);

    try {
      const res = await client.api.admin.users[':id'].$delete({ param: { id } });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      router.refresh();
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      setPendingId(null);
      setConfirmingId(null);
    }
  }

  /** The switch uses its own endpoint: one field, so a role cannot change by accident. */
  async function status(id: string, next: 'ACTIVE' | 'INACTIVE') {
    setPendingId(id);
    setError(null);

    try {
      const res = await client.api.admin.users[':id'].status.$patch({
        param: { id },
        json: { status: next },
      });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      router.refresh();
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      setPendingId(null);
    }
  }

  async function patch(id: string, body: PatchBody) {
    setPendingId(id);
    setError(null);

    try {
      const res = await client.api.admin.users[':id'].$patch({
        param: { id },
        json: body,
      });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      router.refresh();
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      setPendingId(null);
    }
  }

  if (users.length === 0) {
    return (
      <div className="border-border/70 bg-card/40 rounded-xl border border-dashed px-6 py-12 text-center">
        <p className="text-sm font-medium">No accounts match these filters.</p>
        <p className="text-muted-foreground mt-1 text-[12.5px]">
          Clear the search or pick a different role to see more people.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-[12.5px]"
        >
          {error}
        </div>
      ) : null}

      <div className="border-border/70 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="bg-muted/40 text-muted-foreground border-border/70 border-b text-left text-[11px] tracking-wider uppercase">
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-3 py-2.5 font-medium">Role</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Attempts</th>
              <th className="px-3 py-2.5 font-medium">Joined</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-border/60 divide-y">
            {users.map((user) => {
              const self = user.id === currentUserId;
              const busy = pendingId === user.id;
              const nextRole = user.role === 'ADMIN' ? 'STUDENT' : 'ADMIN';
              const nextStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

              return (
                <tr key={user.id} className="hover:bg-accent/25 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="bg-secondary text-secondary-foreground grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold">
                        {initials(user.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-medium">
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {user.name}
                          </Link>
                          {self ? (
                            <Badge variant="outline" className="text-[10px]">
                              you
                            </Badge>
                          ) : null}
                        </p>
                        <p className="text-muted-foreground truncate font-mono text-[11.5px]">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3">
                    <Badge variant={user.role === 'ADMIN' ? 'warning' : 'secondary'}>
                      {user.role}
                    </Badge>
                  </td>

                  <td className="px-3 py-3">
                    <Badge variant={user.status === 'ACTIVE' ? 'success' : 'destructive'}>
                      {user.status}
                    </Badge>
                  </td>

                  <td className="px-3 py-3">
                    <span className="tabular-nums">
                      {user.attempts}
                      <span className="text-muted-foreground/70">
                        {' '}
                        ({user.completedAttempts} graded)
                      </span>
                    </span>
                    <p className="text-muted-foreground text-[11.5px]">
                      {user.averagePercentage === null || user.bestPercentage === null
                        ? 'no score yet'
                        : `avg ${user.averagePercentage.toFixed(1)}% · best ${user.bestPercentage.toFixed(1)}%`}
                      {user.lastAttemptAt ? ` · ${relativeDay(user.lastAttemptAt)}` : ''}
                    </p>
                  </td>

                  <td className="text-muted-foreground px-3 py-3 text-[12px]">
                    {relativeDay(user.createdAt)}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {busy ? (
                        <Loader2 className="text-muted-foreground size-4 animate-spin" />
                      ) : null}

                      {/* The name is a link too, but a row whose only route to the
                          profile is guessing that is not a table you can use. */}
                      <Link
                        href={`/admin/users/${user.id}`}
                        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
                        title={`Open ${user.name}'s profile, history and performance`}
                      >
                        <ArrowUpRight />
                        <span className="hidden sm:inline">View</span>
                        <span className="sr-only sm:hidden">View {user.name}</span>
                      </Link>

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || self}
                        title={
                          self ? 'You cannot change your own role' : `Make this user ${nextRole}`
                        }
                        onClick={() => patch(user.id, { role: nextRole })}
                      >
                        {user.role === 'ADMIN' ? <ShieldOff /> : <ShieldCheck />}
                        <span className="hidden sm:inline">
                          {user.role === 'ADMIN' ? 'Make student' : 'Make admin'}
                        </span>
                      </Button>

                      <Button
                        variant={user.status === 'ACTIVE' ? 'ghost' : 'secondary'}
                        size="sm"
                        disabled={busy || self}
                        title={
                          self
                            ? 'You cannot deactivate your own account'
                            : `${nextStatus === 'ACTIVE' ? 'Reactivate' : 'Deactivate'} this account`
                        }
                        onClick={() => status(user.id, nextStatus)}
                      >
                        {user.status === 'ACTIVE' ? <UserX /> : <UserCheck />}
                        <span className="hidden sm:inline">
                          {user.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                        </span>
                      </Button>

                      {confirmingId === user.id ? (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            title={`Delete ${user.name} and their ${user.attempts} attempts`}
                            onClick={() => remove(user.id)}
                          >
                            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
                            <span className="hidden sm:inline">Confirm</span>
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmingId(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy || self}
                          title={
                            self
                              ? 'You cannot delete your own account'
                              : 'Delete this account and its attempts'
                          }
                          onClick={() => setConfirmingId(user.id)}
                        >
                          <Trash2 />
                          <span className="sr-only sm:not-sr-only">Delete</span>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground text-[11.5px] leading-relaxed">
        Deactivation takes effect on the next request: the API re-reads the account on every guarded
        call, so an existing session stops working immediately. Deleting is permanent — the
        attempts, answers and certificates cascade with the account, which is why the API refuses to
        let you delete yourself.
      </p>
    </div>
  );
}
