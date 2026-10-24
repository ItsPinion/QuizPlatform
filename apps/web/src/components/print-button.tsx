'use client';

import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Print.
 *
 * A certificate is a document: the useful action is "put this on paper or in a
 * PDF", and the browser already knows how. `window.print()` opens the native
 * dialog, which is the only print UI that can pick a printer, a page size and a
 * destination — anything custom would be worse.
 *
 * `print:` rules in the page hide the chrome, so what comes out is the document.
 */
export function PrintButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer aria-hidden />
      Print or save as PDF
    </Button>
  );
}
