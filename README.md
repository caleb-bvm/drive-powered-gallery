# Michael's Gallery

Portfolio and private client galleries for Michael, photographer in El Salvador.
A dark, editorial "darkroom" site: strictly black and white, with red only on the
client access key.

- **Public site**: hero slideshow, selected work, About, contact. Spanish at `/`, English at `/en`.
- **Client area**: a 6-character code opens a private gallery. The cover develops out of
  black, then a camera flash leads into the gallery: chapters, viewer, favourites, and
  downloads of the untouched originals (single files or ZIPs in ~2 GB parts).
- **Studio** (`/studio`, English): albums from Drive folders, codes, expiry, activity,
  photography categories, and editing the main page in both languages.

Photos stay in Michael's Google Drive. The site makes web previews once, and pulls
originals from Drive only when someone downloads.

## Running it locally

```bash
npm install
npm run seed      # builds a mock Drive in .data/mock-drive from the sample images
npm run dev       # http://localhost:3000
```

With no settings at all the app uses an embedded Postgres (PGlite, in `.data/db`) and
the mock Drive. Open `http://localhost:3000/studio`, choose **Enter the Studio**
(development sign-in), create an album from one of the sample folders with any code,
then open `http://localhost:3000/acceso` and type that code.

Other commands: `npm test` (unit tests), `npm run lint` (type check), `npm run build`.

## Running it on a server

The site ships as a Docker image with Postgres, set up in `deploy/`:

- [docs/deploy.md](docs/deploy.md): install, HTTPS, updates and backups.
- [docs/google-setup.md](docs/google-setup.md): the service account key, the photo library folder
  and the Studio sign-in, step by step.

## Settings

Locally, copy `.env.example` to `.env.local`. On the server, `deploy/.env.example` lists
the same settings for Docker. In production these are required:

| Variable | What it is |
| --- | --- |
| `APP_SECRET` | 32+ random characters. Signs sessions and preview links, hashes and encrypts codes. Never change it after launch (all codes would stop working). |
| `SITE_URL` | The public address, e.g. `https://michaelsgallery.com` |
| `DATABASE_URL` | Postgres. Set by Docker Compose; migrations in `drizzle/` run automatically on start. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS` | Google sign-in for the Studio, limited to the listed accounts |
| `DRIVE_MODE=google`, `DRIVE_ROOT_FOLDER_ID`, `GOOGLE_SERVICE_ACCOUNT_FILE` | Real Google Drive access (the key file is mounted as a Docker secret) |

`DRIVE_ROOT_FOLDER_ID` points at the photo library (e.g. "Photo Repository"). In the
Studio you browse down it (year, month, event) and pick any folder as an album.
Subfolders of that folder become chapters; start their names with a number to set the
order (`01 Preparativos`, `02 Ceremonia`); the number is hidden on the site.

## How it works

```
src/
  app/[locale]/        public site, /acceso (/en/access), /galeria (/en/gallery)
  app/studio/          Studio pages and server actions
  app/api/             previews (signed URLs), originals, ZIP streaming, favourites, auth
  lib/albums.ts        create, publish job (previews), sync from Drive, codes, lifecycle
  lib/drive/           Drive interface: google.ts (service account) and mock.ts (disk)
  lib/storage/         preview store (local disk now; S3/R2 slot for hosting)
  lib/zip.ts           streaming ZIP writer (stored, no recompression)
  lib/session.ts       signed gallery session cookie + signed preview URLs
  messages/            Spanish and English text
```

**Access codes.** Exactly 6 letters/numbers typed by Michael, case-insensitive. Stored as
an HMAC (lookup and global uniqueness) plus an encrypted copy so the Studio can show
it. Weak codes get a warning. Five failed tries per device or IP in 15 minutes locks
entry, plus a site-wide cap. A working code is swapped for a signed HttpOnly cookie;
every request re-checks that the album is open and the code wasn't changed. Changing
a code or closing a gallery signs out every device. Optional guest code: view and
favourite, no downloads.

**Publishing.** Creating an album lists the Drive folder, then a background job reads
each original once and stores 2400 px and 640 px WebP previews with all metadata (GPS
included) removed. The job is resumable: *Sync from Drive* adds new photos, drops
deleted ones and redoes edited ones (Drive md5 changed).

**Main-page images.** Photos uploaded in the Studio (hero, selected work, portrait) are
encoded once at upload: 640 to 3200 px wide, AVIF and WebP, plus a tiny blurred
placeholder. Pages pick the size that fits the screen and the server never resizes on
request. The hero is never taller than a 3:2 frame, so camera-ratio photos keep almost
their full width on wide screens; click a photo in the Studio to set the point that
stays in frame when it is cropped (phones, portrait frames).

**Categories.** Each album has a category (wedding, XV años, newborn, product, street…),
shown to the client in their language. About a hundred come built in, grouped in
`src/lib/categories.ts`; more can be added, renamed or removed under Studio → Categories
(stored in the `categories` table). Ids are saved on albums, so never change a built-in id.
A category can only be removed once no album uses it.

**Downloads.** Originals stream from Drive through the server; the browser never sees a
Drive link or file ID. ZIPs stream as they are built, split into ~2 GB parts, with
chapter folders inside.

## Before launch

- Previews go to local disk (the `gallery-data` Docker volume). Back it up with the
  database (see docs/deploy.md).
- The reverse proxy must allow long requests and not buffer them, for ZIP downloads.
- Email sending (delivery and the 7-day reminder) is not wired yet; the Studio gives a
  ready-to-copy delivery email.
- Replace the sample images in the Studio's Main page editor with real work and a portrait.
