'use client';

import { Check, ChevronDown } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { useFloatingList } from '@/lib/use-floating-list';
import { cn } from '@/lib/utils';

/**
 * A select whose popup belongs to this product.
 *
 * A native `<select>` is the right element for the job, and everything about it
 * that matters is kept: it is focusable, it announces itself as a combobox, it
 * opens with the keyboard, and it submits with its form. What cannot be kept is
 * the *popup* — that list is painted by the operating system, so on a black page
 * it arrives as a white panel with black type (or, worse, white type over a
 * white panel in browsers that honour `option { color }` but not its background).
 * `color-scheme: dark` fixes Chrome and Safari and does nothing for the GTK
 * popup on Linux. There is no CSS that reaches it.
 *
 * So the list is drawn here instead — same material as the console, in every
 * browser — while the control keeps native semantics:
 *
 *   - `role="combobox"` with `aria-expanded`, `aria-controls` and
 *     `aria-activedescendant` (the ARIA 1.2 pattern for a custom select);
 *   - arrows, Home/End, Enter/Space, Escape and Tab behave the way a select
 *     should, and focus never leaves the trigger;
 *   - a hidden input with the field's `name`, so a plain GET form still submits
 *     exactly what the picker shows — no JavaScript needed to *send* the value.
 *
 * The list is **portalled to `document.body`** and placed with `position: fixed`.
 * That is not decoration: the field usually sits inside a `Card`, and a card
 * carries `backdrop-filter`, which makes it a stacking context of its own. A
 * `z-50` list inside that context still loses to the next card down the page —
 * which is exactly the bug where a filter dropdown opens *under* the quiz grid.
 * Out at the body there is no ancestor to lose to, and `floating.ts` does the
 * arithmetic for where the box goes, how tall it may be, and whether it opens
 * upward near the bottom of the window.
 *
 * The API is the native one: `value` / `defaultValue` / `onChange` / `name` /
 * `id` / `children` as `<option>` elements. Call sites did not have to change.
 */

const FIELD =
  'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-white/12 bg-white/[0.04] py-0 pr-2.5 pl-3 ' +
  'text-left text-[13px] text-white transition-colors outline-none ' +
  'hover:border-white/20 focus-visible:border-white/30 focus-visible:ring-2 focus-visible:ring-white/15 ' +
  'disabled:pointer-events-none disabled:opacity-50';

interface OptionInfo {
  value: string;
  label: React.ReactNode;
  /** Plain text, for the trigger and for type-ahead. */
  text: string;
  disabled: boolean;
}

function textOf(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node))
    return textOf(node.props.children);
  return '';
}

/** Read the `<option>` children into the shape the picker needs. */
function readOptions(children: React.ReactNode): OptionInfo[] {
  const out: OptionInfo[] = [];

  React.Children.forEach(children, (child) => {
    if (
      !React.isValidElement<{
        value?: string | number;
        disabled?: boolean;
        children?: React.ReactNode;
      }>(child)
    ) {
      return;
    }

    if (child.type !== 'option') return;

    const text = textOf(child.props.children);
    out.push({
      value: child.props.value === undefined ? text : String(child.props.value),
      label: child.props.children,
      text,
      disabled: Boolean(child.props.disabled),
    });
  });

  return out;
}

export function Select({
  className,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  name,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: React.ComponentPropsWithoutRef<'select'>) {
  const options = readOptions(children);
  const controlled = value !== undefined;

  const [internal, setInternal] = React.useState<string>(() =>
    String(defaultValue ?? options.find((option) => !option.disabled)?.value ?? ''),
  );

  const selectedValue = controlled ? String(value ?? '') : internal;
  const selected = options.find((option) => option.value === selectedValue) ?? options[0] ?? null;

  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(() =>
    Math.max(
      0,
      options.findIndex((option) => option.value === selectedValue),
    ),
  );

  const rootRef = React.useRef<HTMLDivElement>(null);
  const { triggerRef, placement } = useFloatingList<HTMLButtonElement>(open, 300);
  const listRef = React.useRef<HTMLUListElement>(null);
  const reactId = React.useId();
  const listId = `${reactId}-list`;
  const optionId = (index: number) => `${reactId}-option-${index}`;

  // Close when the click lands anywhere else. Pointerdown rather than click, so
  // the list is gone before the underlying control reacts.
  React.useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;

      // The list lives in a portal, so it is not inside `rootRef` — it counts as
      // "inside" all the same, or picking an option would close before the click.
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;

      setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Keep the active row in view when the list is longer than the fold.
  React.useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  function commit(next: OptionInfo) {
    if (next.disabled) return;

    if (!controlled) setInternal(next.value);

    // React's select contract: a change event carrying the new value.
    onChange?.({
      target: { value: next.value, name },
      currentTarget: { value: next.value, name },
    } as unknown as React.ChangeEvent<HTMLSelectElement>);

    setOpen(false);
    triggerRef.current?.focus();
  }

  function openList() {
    if (disabled || options.length === 0) return;

    setActiveIndex(
      Math.max(
        0,
        options.findIndex((option) => option.value === selectedValue),
      ),
    );
    setOpen(true);
  }

  function move(delta: number) {
    if (options.length === 0) return;

    let index = activeIndex;

    for (let step = 0; step < options.length; step += 1) {
      index = (index + delta + options.length) % options.length;
      if (!options[index]?.disabled) break;
    }

    setActiveIndex(index);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openList();
        else move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openList();
        else move(-1);
        break;
      case 'Home':
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case 'End':
        if (open) {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!open) openList();
        else if (options[activeIndex]) commit(options[activeIndex]);
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {/* What a plain form submits. The visible control is a button, which does
          not carry a value of its own. */}
      {name ? <input type="hidden" name={name} value={selectedValue} /> : null}

      <button
        ref={triggerRef}
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={FIELD}
        data-slot="select"
      >
        <span className="truncate">{selected ? selected.label : ''}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 text-gray-400 transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && placement
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-labelledby={id}
              tabIndex={-1}
              data-side={placement.side}
              style={{
                left: placement.left,
                top: placement.top,
                width: placement.width,
                maxHeight: placement.maxHeight,
              }}
              className="select-popup fixed z-[120] overflow-y-auto overscroll-contain rounded-xl border border-white/12 bg-[#0a0a0a] p-1 shadow-[0_28px_60px_-20px_rgba(0,0,0,0.9)] outline-none"
            >
              {options.map((option, index) => {
                const isSelected = option.value === selectedValue;
                const isActive = index === activeIndex;

                return (
                  <li
                    key={`${option.value}-${index}`}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    data-active={isActive}
                    onPointerEnter={() => setActiveIndex(index)}
                    onClick={() => commit(option)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] transition-colors',
                      option.disabled && 'pointer-events-none opacity-40',
                      isActive ? 'bg-white/10 text-white' : 'text-gray-300',
                      isSelected && 'font-medium',
                    )}
                  >
                    <Check
                      aria-hidden
                      className={cn('size-3.5 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')}
                    />
                    <span className="truncate">{option.label}</span>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
