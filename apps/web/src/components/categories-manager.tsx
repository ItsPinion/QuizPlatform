'use client';

import type { CategoryOption } from '@quiz/shared/quiz';
import { Check, FolderTree, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { client } from '@/lib/api';
import { parseApiFailure, toApiFailure } from '@/lib/api-error';
import { quizzesHref } from '@/lib/quiz-params';
import { cn } from '@/lib/utils';

interface Props {
  initialCategories: CategoryOption[];
}

/**
 * Category CRUD.
 *
 * Creating and renaming go through the same case-insensitive rule the quiz form
 * uses, so this screen cannot produce "React" and "react" either — a rename that
 * would collide answers `409 CATEGORY_EXISTS` and is shown verbatim. Deleting is
 * only offered for an empty category: the API refuses otherwise, and the button
 * says why before it is clicked.
 */
export function CategoriesManager({ initialCategories }: Props) {
  const router = useRouter();

  const [categories, setCategories] = useState(initialCategories);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', description: '' });
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function reload() {
    const res = await client.api.admin.categories.$get();

    if (res.ok) setCategories((await res.json()).categories);

    router.refresh();
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newName.trim().length < 2) {
      setError('Category names need at least 2 characters.');
      return;
    }

    setBusy('create');
    setError(null);
    setNotice(null);

    try {
      const res = await client.api.admin.categories.$post({ json: { name: newName } });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      const body = await res.json();
      setNewName('');
      setNotice(
        body.created
          ? `Created "${body.category.name}".`
          : `"${body.category.name}" already existed — selected it instead.`,
      );

      await reload();
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      setBusy(null);
    }
  }

  function startEditing(category: CategoryOption) {
    setEditingId(category.id);
    setDraft({ name: category.name, description: category.description ?? '' });
    setConfirmingDelete(null);
    setError(null);
    setNotice(null);
  }

  async function save(id: string) {
    setBusy(id);
    setError(null);
    setNotice(null);

    try {
      const res = await client.api.admin.categories[':id'].$patch({
        param: { id },
        json: { name: draft.name, description: draft.description },
      });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      setEditingId(null);
      setNotice('Category updated. Its slug stays the same.');
      await reload();
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (confirmingDelete !== id) {
      setConfirmingDelete(id);
      return;
    }

    setBusy(id);
    setError(null);
    setNotice(null);

    try {
      const res = await client.api.admin.categories[':id'].$delete({ param: { id } });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      setConfirmingDelete(null);
      setNotice('Category deleted.');
      await reload();
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={create}
        className="border-border/70 bg-background/40 flex flex-wrap items-end gap-3 rounded-xl border p-4"
      >
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <Label htmlFor="newCategory">New category</Label>
          <Input
            id="newCategory"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="e.g. Machine Learning"
            autoComplete="off"
            maxLength={80}
          />
        </div>
        <Button type="submit" disabled={busy === 'create'}>
          {busy === 'create' ? <Loader2 className="animate-spin" /> : <Plus />}
          Add category
        </Button>
        <p className="text-muted-foreground w-full text-[11.5px]">
          Matching ignores case and extra spaces — typing an existing name selects it instead of
          creating a duplicate.
        </p>
      </form>

      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-[12.5px]"
        >
          {error}
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          className="border-success/30 bg-success/10 text-success rounded-lg border px-3 py-2 text-[12.5px]"
        >
          {notice}
        </div>
      ) : null}

      <div className="border-border/70 overflow-hidden rounded-xl border">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-muted/40 text-muted-foreground border-border/60 border-b text-left text-[10px] tracking-wider uppercase">
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Quizzes</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-border/50 divide-y">
            {categories.map((category) => {
              const editing = editingId === category.id;
              const blocked = category.quizCount > 0;

              return (
                <tr key={category.id} className="align-top">
                  <td className="px-4 py-3">
                    {editing ? (
                      <div className="max-w-md space-y-2">
                        <Input
                          value={draft.name}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, name: event.target.value }))
                          }
                          aria-label={`Rename ${category.name}`}
                          autoComplete="off"
                        />
                        <Input
                          value={draft.description}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, description: event.target.value }))
                          }
                          placeholder="Description (optional)"
                          aria-label={`Describe ${category.name}`}
                          autoComplete="off"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => save(category.id)}
                            disabled={busy === category.id}
                          >
                            {busy === category.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Check />
                            )}
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            <X />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{category.name}</span>
                          <span className="text-muted-foreground font-mono text-[10.5px]">
                            {category.slug}
                          </span>
                        </div>
                        {category.description ? (
                          <p className="text-muted-foreground mt-0.5 text-[11.5px]">
                            {category.description}
                          </p>
                        ) : (
                          <p className="text-muted-foreground/60 mt-0.5 text-[11.5px]">
                            No description
                          </p>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    {blocked ? (
                      <Link
                        href={quizzesHref({ categoryId: category.id })}
                        className="text-primary inline-flex items-center gap-1.5 hover:underline"
                      >
                        <FolderTree className="size-3.5" />
                        {category.quizCount} quiz{category.quizCount === 1 ? '' : 'zes'}
                      </Link>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        empty
                      </Badge>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEditing(category)}
                        disabled={editing}
                        aria-label={`Edit ${category.name}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant={confirmingDelete === category.id ? 'secondary' : 'ghost'}
                        size="icon"
                        onClick={() => remove(category.id)}
                        disabled={blocked || busy === category.id}
                        aria-label={`Delete ${category.name}`}
                        title={
                          blocked
                            ? `Move or delete its ${category.quizCount} quiz${category.quizCount === 1 ? '' : 'zes'} first`
                            : 'Delete category'
                        }
                      >
                        {busy === category.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {categories.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">No categories yet.</p>
            <p className="text-muted-foreground mt-1 text-[12.5px]">
              Add one above — or type a new name into a quiz&apos;s category field and it will be
              created there.
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-[11.5px]">
          Deleting is blocked while quizzes are filed under a category — the API answers{' '}
          <code className="bg-muted rounded px-1 font-mono">409 CATEGORY_HAS_QUIZZES</code>.
        </p>
        <Link
          href="/admin/quizzes/new"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <Plus />
          New quiz
        </Link>
      </div>
    </div>
  );
}
