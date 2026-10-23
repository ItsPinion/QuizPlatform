/**
 * The hero's two buttons, decided by who is looking.
 *
 * A landing page that offers "Take the demo quiz" to a signed-in student is
 * asking them to sign in to a page they are already on. The primary action is
 * therefore a function of the session:
 *
 *   - nobody signed in → create an account (the funnel);
 *   - a student        → the catalogue, which is where a quiz actually starts;
 *   - an admin         → the console, because they do not sit quizzes.
 *
 * Pure, so the rule is testable without rendering the hero.
 */

export interface HeroAction {
  label: string;
  href: string;
}

export interface HeroActions {
  primary: HeroAction;
  secondary: HeroAction;
}

export function heroActions(role: string | null): HeroActions {
  if (role === 'STUDENT') {
    return {
      primary: { label: 'Take a quiz', href: '/student/quizzes' },
      secondary: { label: 'My dashboard', href: '/student' },
    };
  }

  if (role === 'ADMIN') {
    return {
      primary: { label: 'Open the console', href: '/admin' },
      secondary: { label: 'View analytics', href: '/admin/analytics' },
    };
  }

  return {
    primary: { label: 'Get started', href: '/register' },
    secondary: { label: 'See it working', href: '#tour' },
  };
}
