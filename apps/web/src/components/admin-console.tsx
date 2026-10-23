import {
  ArrowRight,
  BarChart3,
  LayoutDashboard,
  ListChecks,
  Lock,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Sidebar of the real console, reproduced so the section needs no session. */
const NAV = [
  { icon: LayoutDashboard, label: 'Overview', active: true },
  { icon: Users, label: 'Users', active: false },
  { icon: ListChecks, label: 'Quizzes', day: 5 },
  { icon: BarChart3, label: 'Analytics', day: 11 },
];

const ROWS = [
  { name: 'Alex Admin', email: 'admin@quiz.dev', role: 'ADMIN', status: 'ACTIVE', attempts: 0 },
  { name: 'Priya Sharma', email: 'priya@quiz.dev', role: 'STUDENT', status: 'ACTIVE', attempts: 3 },
  { name: 'Amit Verma', email: 'amit@quiz.dev', role: 'STUDENT', status: 'INACTIVE', attempts: 5 },
];

const STATS = [
  { label: 'Accounts', value: '4', hint: '4 active · 0 inactive' },
  { label: 'Quizzes', value: '10', hint: '8 published · 1 draft' },
  { label: 'Questions', value: '47', hint: '188 options · 10 categories' },
  { label: 'Pass rate', value: '57.1%', hint: '8 passed · 6 failed' },
];

const CAPABILITIES = [
  {
    icon: BarChart3,
    title: 'One aggregate call',
    body: 'GET /api/admin/stats returns user, content and attempt counts plus the five newest accounts and attempts — one round trip, not one request per card.',
  },
  {
    icon: Search,
    title: 'A real directory',
    body: 'GET /api/admin/users pages, searches name and email, filters by role and status, and attaches attempt totals and best scores from a grouped join.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Safe mutations',
    body: 'PATCH /api/admin/users/:id changes a role or status. The API refuses to let the signed-in admin demote or deactivate themselves — 409 SELF_LOCKOUT.',
  },
];

/**
 * Landing-page preview of the Day 4 admin console.
 *
 * Static by design: the landing page has no session, so it mirrors the real
 * screens instead of fetching them. Signed-in admins get the live version at
 * /admin and /admin/users.
 */
export function AdminConsole() {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-border/70 bg-muted/20 flex items-center gap-2 border-b px-4 py-2.5">
          <span className="bg-warning/20 text-warning inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10.5px]">
            <Lock className="size-3" /> ADMIN
          </span>
          <span className="text-muted-foreground font-mono text-[11px]">/admin · /admin/users</span>
          <span className="text-muted-foreground/70 ml-auto hidden font-mono text-[10.5px] sm:inline">
            requireAdmin → handler
          </span>
        </div>

        <div className="grid gap-0 lg:grid-cols-[170px_minmax(0,1fr)]">
          <div className="border-border/70 bg-background/30 border-b p-3 lg:border-r lg:border-b-0">
            <ul className="flex gap-1.5 overflow-x-auto lg:flex-col">
              {NAV.map((item) => {
                const disabled = item.day !== undefined;

                return (
                  <li key={item.label} className="shrink-0">
                    <span
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[12px]',
                        item.active
                          ? 'bg-primary/15 text-primary ring-primary/25 ring-1'
                          : 'text-muted-foreground',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <item.icon className="size-3.5" />
                        {item.label}
                      </span>
                      {disabled ? (
                        <span className="border-border/70 text-muted-foreground/70 rounded-full border px-1.5 text-[9.5px]">
                          D{item.day}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="border-border/60 bg-background/50 rounded-lg border px-3 py-2.5"
                >
                  <p className="text-muted-foreground text-[10px] tracking-wider uppercase">
                    {stat.label}
                  </p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums">{stat.value}</p>
                  <p className="text-muted-foreground/80 mt-0.5 text-[10px] leading-tight">
                    {stat.hint}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-border/60 overflow-hidden rounded-lg border">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="bg-muted/40 text-muted-foreground border-border/60 border-b text-left text-[9.5px] tracking-wider uppercase">
                    <th className="px-2.5 py-1.5 font-medium">Account</th>
                    <th className="px-2 py-1.5 font-medium">Role</th>
                    <th className="px-2 py-1.5 font-medium">Status</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-border/50 divide-y">
                  {ROWS.map((row) => (
                    <tr key={row.email}>
                      <td className="px-2.5 py-1.5">
                        <span className="font-medium">{row.name}</span>
                        <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">
                          {row.email}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge
                          variant={row.role === 'ADMIN' ? 'warning' : 'secondary'}
                          className="text-[9.5px]"
                        >
                          {row.role}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge
                          variant={row.status === 'ACTIVE' ? 'success' : 'destructive'}
                          className="text-[9.5px]"
                        >
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-2.5 py-1.5 text-right">
                        <span className="border-border/60 text-muted-foreground rounded border px-1.5 py-0.5 text-[9.5px]">
                          {row.role === 'ADMIN' ? 'Make student' : 'Make admin'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {CAPABILITIES.map((item) => (
          <div key={item.title} className="border-border/70 bg-background/40 rounded-xl border p-4">
            <item.icon className="text-primary size-4" />
            <h3 className="mt-2.5 text-[13px] font-medium">{item.title}</h3>
            <p className="text-muted-foreground mt-1.5 text-[12px] leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>

      <Card className="py-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground flex items-center gap-2 text-[12px]">
            <ShieldCheck className="text-success size-3.5" />
            Sign in as{' '}
            <code className="bg-muted rounded px-1 font-mono text-[11px]">
              admin@quiz.dev
            </code> ·{' '}
            <code className="bg-muted rounded px-1 font-mono text-[11px]">Admin12345</code> to open
            the live console.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              Open /admin
              <ArrowRight />
            </Link>
            <Link href="/admin/users" className={cn(buttonVariants({ size: 'sm' }))}>
              <Users />
              Manage users
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
