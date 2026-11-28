import { requireAdminPage } from '@/lib/admin';
import { categoryUsage, customCategories } from '@/lib/categories-db';
import { BUILTIN_CATEGORIES } from '@/lib/categories';
import { CategoriesEditor } from '@/components/studio/CategoriesEditor';

export const metadata = { title: 'Categories' };

export default async function CategoriesPage() {
  await requireAdminPage();
  const [custom, usage] = await Promise.all([customCategories(), categoryUsage()]);
  return (
    <main className="gut">
      <div className="head">
        <div>
          <h1>Categories</h1>
          <p>The kinds of shoots you can pick for an album. The client sees the name on their gallery, in Spanish or English.</p>
        </div>
      </div>
      <CategoriesEditor builtin={BUILTIN_CATEGORIES} initial={custom} usage={usage} />
    </main>
  );
}
