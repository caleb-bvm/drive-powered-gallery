'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCategory, removeCategory, updateCategory } from '@/app/studio/actions';
import { groupCategories, type Category } from '@/lib/categories';
import { useToast } from './Toast';

const used = (n: number) => (n ? `${n} album${n === 1 ? '' : 's'}` : 'Not used yet');

export function CategoriesEditor({ builtin, initial, usage }: { builtin: Category[]; initial: Category[]; usage: Record<string, number> }) {
  const router = useRouter();
  const [toast, Toast] = useToast();
  const [pending, start] = useTransition();
  const [list, setList] = useState(initial);
  const [es, setEs] = useState('');
  const [en, setEn] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id: string; es: string; en: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const add = () =>
    start(async () => {
      setError('');
      const r = await createCategory(es, en);
      if (!r.ok) return setError(r.error);
      setList((l) => [...l, r.category]);
      setEs('');
      setEn('');
      toast(`Added "${r.category.es}"`);
      router.refresh();
    });

  const save = () =>
    editing &&
    start(async () => {
      setError('');
      const r = await updateCategory(editing.id, editing.es, editing.en);
      if (!r.ok) return setError(r.error);
      setList((l) => l.map((x) => (x.id === editing.id ? { ...x, es: editing.es.trim(), en: editing.en.trim() } : x)));
      setEditing(null);
      toast('Saved');
      router.refresh();
    });

  const del = (id: string) =>
    start(async () => {
      setError('');
      const r = await removeCategory(id);
      setConfirmDel(null);
      if (!r.ok) return setError(r.error);
      setList((l) => l.filter((x) => x.id !== id));
      toast('Category removed');
      router.refresh();
    });

  return (
    <div className="cats">
      <section className="step">
        <h2>Add a category</h2>
        <p>Spanish is the main name. Leave English empty and it falls back to Spanish.</p>
        <form
          className="fgrid"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="f">
            <label htmlFor="ces">
              <b>ES</b> Name
            </label>
            <input id="ces" placeholder="Fotografía de autos clásicos" maxLength={40} value={es} onChange={(e) => setEs(e.target.value)} />
          </div>
          <div className="f">
            <label htmlFor="cen">
              <b>EN</b> Name
            </label>
            <input id="cen" placeholder="Falls back to Spanish" maxLength={40} value={en} onChange={(e) => setEn(e.target.value)} />
          </div>
          <div className="f wide">
            <div>
              <button className="pill solid" type="submit" disabled={pending || !es.trim()}>
                Add category
              </button>
            </div>
          </div>
        </form>
        {error && (
          <p className="hint bad" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="step">
        <h2>My categories</h2>
        <p>{list.length ? 'Yours to rename or remove. A category in use by an album cannot be removed.' : 'Nothing added yet. New ones show up here and in every album dropdown.'}</p>
        {list.length > 0 && (
          <ul className="catlist">
            {list.map((c) =>
              editing?.id === c.id ? (
                <li key={c.id} className="editing">
                  <div className="fgrid">
                    <div className="f">
                      <label htmlFor={`e-es-${c.id}`}>
                        <b>ES</b> Name
                      </label>
                      <input id={`e-es-${c.id}`} maxLength={40} value={editing.es} onChange={(e) => setEditing({ ...editing, es: e.target.value })} autoFocus />
                    </div>
                    <div className="f">
                      <label htmlFor={`e-en-${c.id}`}>
                        <b>EN</b> Name
                      </label>
                      <input id={`e-en-${c.id}`} maxLength={40} value={editing.en} placeholder="Falls back to Spanish" onChange={(e) => setEditing({ ...editing, en: e.target.value })} />
                    </div>
                  </div>
                  <div className="acts">
                    <button className="pill solid" onClick={save} disabled={pending || !editing.es.trim()}>
                      Save
                    </button>
                    <button className="pill quiet" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </li>
              ) : (
                <li key={c.id}>
                  <div>
                    <b>{c.es}</b>
                    <span>{c.en || 'No English name'}</span>
                  </div>
                  <small>{used(usage[c.id] ?? 0)}</small>
                  <div className="acts">
                    {confirmDel === c.id ? (
                      <>
                        <button className="pill solid" onClick={() => del(c.id)} disabled={pending}>
                          Remove
                        </button>
                        <button className="pill quiet" onClick={() => setConfirmDel(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="pill" onClick={() => (setConfirmDel(null), setEditing({ id: c.id, es: c.es, en: c.en }))}>
                          Rename
                        </button>
                        <button className="pill quiet" onClick={() => setConfirmDel(c.id)} disabled={!!usage[c.id]} title={usage[c.id] ? 'In use by an album' : undefined}>
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className="step">
        <h2>Built in</h2>
        <p>{builtin.length} categories that come with the site. Numbers show how many albums use each.</p>
        {groupCategories(builtin).map((g) => (
          <div key={g.id} className="chaps">
            <span className="lbl">{g.en}</span>
            {g.items.map((c) => (
              <span key={c.id} title={c.en === c.es ? c.es : `${c.es} / ${c.en}`}>
                {c.es}
                {usage[c.id] ? <em>{usage[c.id]}</em> : null}
              </span>
            ))}
          </div>
        ))}
      </section>
      {Toast}
    </div>
  );
}
