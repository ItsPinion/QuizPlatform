import {
  ArrowRight,
  BarChart3,
  FolderTree,
  GraduationCap,
  ListChecks,
  Lock,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const AREAS = [
  {
    role: 'ADMIN' as const,
    title: 'Admin area',
    href: '/admin',
    api: '/api/admin/*',
    icon: ShieldCheck,
    tone: 'warning' as const,
    description: 'Guarded by requireAdmin on the API and a server-side role check on the page.',
    items: [
      { icon: ListChecks, label: 'Manage quizzes' },
      { icon: FolderTree, label: 'Categories & questions' },
      { icon: Users, label: 'Users' },
      { icon: BarChart3, label: 'Analytics' },
    ],
  },
  {
    role: 'STUDENT' as const,
    title: 'Student area',
    href: '/student',
    api: '/api/student/*',
    icon: GraduationCap,
    tone: 'secondary' as const,
    description: 'Guarded by requireStudent — an admin opening it is sent back to their own area.',
    items: [
      { icon: ListChecks, label: 'Take quizzes' },
      { icon: Trophy, label: 'Leaderboard' },
      { icon: GraduationCap, label: 'Results & history' },
    ],
  },
];

const DENIALS = [
  { code: '401', label: 'no session', detail: 'UNAUTHENTICATED' },
  { code: '403', label: 'wrong role', detail: 'FORBIDDEN' },
  { code: '403', label: 'disabled user', detail: 'ACCOUNT_INACTIVE' },
];

export function AccessAreas() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {AREAS.map((area) => (
          <Card key={area.role} className="card-sheen">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                  <area.icon className="text-primary size-4" />
                  {area.title}
                </CardTitle>
                <Badge variant={area.tone}>{area.role}</Badge>
              </div>
              <CardDescription>{area.description}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <ul className="grid grid-cols-2 gap-2">
                {area.items.map((item) => (
                  <li
                    key={item.label}
                    className="border-border/60 bg-background/40 flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px]"
                  >
                    <item.icon className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between gap-3">
                <code className="text-muted-foreground font-mono text-[11px]">{area.api}</code>
                <Link
                  href={area.href}
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                >
                  Open {area.href}
                  <ArrowRight />
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="border-border/70 bg-background/40 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[11.5px]">
          <Lock className="size-3.5" />
          Rejected before the handler runs
        </span>
        {DENIALS.map((denial) => (
          <span key={denial.detail} className="inline-flex items-center gap-1.5 text-[11.5px]">
            <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
              {denial.code}
            </code>
            <span className="text-muted-foreground">{denial.label}</span>
            <code className="text-muted-foreground font-mono text-[10.5px]">{denial.detail}</code>
          </span>
        ))}
        <span className="text-muted-foreground ml-auto text-[11.5px]">
          Signed out? Both links send you to <code className="font-mono">/login?next=…</code>.
        </span>
      </div>
    </div>
  );
}
