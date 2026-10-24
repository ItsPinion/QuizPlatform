import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { developmentFeatures } from '@/lib/runtime';

/**
 * A build-plan badge, printed only where the build plan is the point.
 *
 * "Day 11 · analytics" means something to the person who built this and nothing
 * to the person using it. It is useful in development and in a showcase demo; on
 * a production deployment it is noise that advertises the software's history.
 *
 * So the label is rendered from the outside in: the string stays in the page
 * (readable in the source, next to the page it describes) and this component
 * decides whether it reaches the DOM. `ENV_NODE` unset means production, which
 * means nothing here is rendered — see `docs/runtime-modes.md`.
 *
 * It is a server component: the pages that use it are server components, and
 * `@/lib/runtime` reads `process.env` on the server. Rendering nothing is a
 * deliberate null, not an empty badge.
 */
export function BuildBadge({ children, className }: { children: ReactNode; className?: string }) {
  if (!developmentFeatures) return null;

  return (
    <Badge variant="outline" className={className}>
      {children}
    </Badge>
  );
}
