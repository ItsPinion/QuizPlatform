'use client';

import type { CategoryOption } from '@quiz/shared/quiz';
import { findCategoryByName } from '@quiz/shared/quiz';
import { Check, CornerDownLeft, Plus, Tag } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { rankCategories } from '@/lib/quiz-params';
import { useFloatingList } from '@/lib/use-floating-list';
import { cn } from '@/lib/utils';

interface Props {
  id: string;
  categories: CategoryOption[];
  /** The text in the box: an existing category's name, or a new one. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Category picker that is also a category creator.
 *
 * You type; it narrows the existing categories as you go. Pick one and the quiz
 * is bound to that category. Type something new and the API creates it — but
 * matching is case-insensitive first ("javascript" resolves to "JavaScript"),
 * so the list cannot grow a second copy of a category that already exists.
 *
 * The API does the authoritative matching on submit; this component uses the
 * same shared helpers so its hint tells the truth before you click save.
 *
 * The list is portalled to `document.body`, like the select's: this field lives
 * inside a `Card`, a card with `backdrop-filter` is a stacking context, and a
 * `z-20` list inside it loses to whatever card comes next. Out at the body, the
 * only thing that decides the order is the popup's own `z-index`.
 */
export function CategoryCombobox({ id, categories, value, onChange, placeholder }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const { triggerRef, placement } = useFloatingList<HTMLInputElement>(open, 260);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => rankCategories(value, categories), [value, categories]);
  const exact = findCategoryByName(value, categories);
  const typed = value.trim();
  const isNew = typed.length > 0 && !exact;

  function choose(category: CategoryOption) {
    onChange(category.name);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'Enter' && open && matches[active]) {
      // Enter picks the highlighted category instead of submitting the form.
      event.preventDefault();
      choose(matches[active]);
      return;
    }

    if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative space-y-1.5">
      <div className="relative">
        <Tag className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
        <input
          ref={triggerRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={value}
          placeholder={placeholder ?? 'Start typing a category…'}
          onChange={(event) => {
            onChange(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border py-1 pr-3 pl-8 text-[13px] focus-visible:ring-[3px] focus-visible:outline-none"
        />
      </div>

      {open && matches.length > 0 && placement
        ? createPortal(
            <ul
              id={listId}
              role="listbox"
              aria-label="Categories"
              data-side={placement.side}
              style={{
                left: placement.left,
                top: placement.top,
                width: Math.min(placement.width, 384),
                maxHeight: placement.maxHeight,
              }}
              className="border-border bg-popover fixed z-[120] overflow-auto overscroll-contain rounded-xl border p-1 shadow-[0_28px_60px_-20px_rgba(0,0,0,0.9)]"
            >
              {matches.map((category, index) => (
                <li key={category.id}>
                  <button
                    type="button"
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    // Keep focus in the input so the blur handler does not race the click.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(category)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12.5px]',
                      index === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Check
                        className={cn(
                          'size-3.5',
                          category.name.toLowerCase() === typed.toLowerCase()
                            ? 'text-primary opacity-100'
                            : 'opacity-0',
                        )}
                      />
                      {category.name}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-[10.5px]">
                      {category.quizCount} quiz{category.quizCount === 1 ? '' : 'z'}
                    </span>
                  </button>
                </li>
              ))}

              {isNew ? (
                <li className="border-border/60 text-muted-foreground mt-1 flex items-center gap-2 border-t px-2 pt-2 pb-1 text-[11.5px]">
                  <Plus className="size-3.5" />
                  <span>
                    <span className="text-foreground font-medium">{typed}</span> will be created
                  </span>
                </li>
              ) : null}
            </ul>,
            document.body,
          )
        : null}

      <p className="text-muted-foreground flex items-center gap-1.5 text-[11.5px]">
        {exact ? (
          <>
            <Check className="text-success size-3" />
            Existing category · <span className="text-foreground">{exact.name}</span>
          </>
        ) : typed.length >= 2 ? (
          <>
            <Plus className="text-primary size-3" />
            New category <span className="text-foreground">“{typed}”</span> will be created
            (case-insensitive match is checked first)
          </>
        ) : (
          <>
            <CornerDownLeft className="size-3" />
            Pick an existing category or type a new name.
          </>
        )}
      </p>
    </div>
  );
}
