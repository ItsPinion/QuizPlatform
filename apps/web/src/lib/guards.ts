import type { AuthSession } from '@quiz/shared/auth';

export type ProtectedRole = AuthSession['user']['role'];

/**
 * Decide whether a visitor may see a role-scoped page.
 *
 * Kept as a pure function so the rule is testable without rendering React
 * Server Components: "no session → sign in, wrong role → your own area,
 * otherwise allow".
 */
export type AccessDecision =
  { allowed: true; session: AuthSession } | { allowed: false; redirectTo: string };

const AREA_BY_ROLE: Record<ProtectedRole, string> = {
  ADMIN: '/admin',
  STUDENT: '/student',
};

export function decideAccess(
  session: AuthSession | null,
  requiredRole: ProtectedRole,
  target: string,
): AccessDecision {
  if (!session) {
    return { allowed: false, redirectTo: `/login?next=${encodeURIComponent(target)}` };
  }

  if (session.user.role !== requiredRole) {
    return { allowed: false, redirectTo: AREA_BY_ROLE[session.user.role] };
  }

  return { allowed: true, session };
}
