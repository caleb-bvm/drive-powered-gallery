import { requireAdminPage } from '@/lib/admin';
import { NewAlbumForm } from '@/components/studio/NewAlbumForm';
import { env } from '@/lib/env';
import { allCategories } from '@/lib/categories-db';

export const metadata = { title: 'New album' };

export default async function NewAlbumPage() {
  await requireAdminPage();
  const categories = await allCategories();
  return (
    <main className="gut">
      <div className="head">
        <div>
          <h1>New album</h1>
          <p>Pick the Drive folder, check the details, publish. The site makes the previews; you write the code.</p>
        </div>
      </div>
      <NewAlbumForm siteUrl={env.siteUrl} driveMode={env.driveMode} categories={categories} />
    </main>
  );
}
