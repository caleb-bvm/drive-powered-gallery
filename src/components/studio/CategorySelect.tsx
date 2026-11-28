'use client';

import Link from 'next/link';
import { groupCategories, OTHER, type Category } from '@/lib/categories';

/** Category dropdown for albums, grouped, with a link to add new ones. */
export function CategorySelect({ id, value, categories, onChange }: { id: string; value: string; categories: Category[]; onChange: (v: string) => void }) {
  return (
    <>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {groupCategories(categories).map((g) => (
          <optgroup key={g.id} label={g.en}>
            {g.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.en.trim() || c.es}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={OTHER.id}>Other</option>
      </select>
      <small className="fhint">
        Missing one? <Link href="/studio/categories">Add a category</Link>
      </small>
    </>
  );
}
