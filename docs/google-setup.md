# Connecting Google: the three things the site needs

The site needs three things from Google. All three go into files on your server
and nowhere else. Never paste the key or the client secret into a chat, an
email, an issue or a commit.

| # | What | What it's for | Where it goes |
| --- | --- | --- | --- |
| 1 | **Service account key** (a JSON file) | Lets the site *read* your client folders in Drive, without your password. It can only see folders you share with it, and only as Viewer. | `deploy/secrets/drive-key.json` |
| 2 | **"Clientes" folder ID** | Tells the site which Drive folder holds the client galleries. | `DRIVE_ROOT_FOLDER_ID` in `deploy/.env` |
| 3 | **OAuth client** (ID + secret) | Lets *you* sign in to the Studio with your Google account. Only the emails in `ADMIN_EMAILS` get in. | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in `deploy/.env` |

It takes about 20 minutes. Use the Google account that owns the photos.

---

## Part 0. Create a Google Cloud project (once)

1. Go to <https://console.cloud.google.com> and sign in.
2. Click the **project picker** at the top left (next to "Google Cloud") and choose **New project**.
3. Name it `michaels-gallery`. If you're on Workspace, leave the organization as your domain. Click **Create**, then make sure the new project is selected in the picker.
4. Open the menu (☰) and go to **APIs & Services → Library**. Search for **Google Drive API**, open it and click **Enable**.

Nothing here costs money: the Drive API is free at this volume.

---

## Part 1. Service account key

### Create the service account

1. Menu (☰) → **IAM & Admin → Service Accounts** → **+ Create service account**.
2. Name: `gallery-drive`. Click **Create and continue**.
3. On "Grant this service account access to project", **don't add any role**. Click **Continue**, then **Done**. It doesn't need any project permissions. It only needs the Drive folder you share with it in Part 2.
4. Copy the service account's **email** from the list. It looks like
   `gallery-drive@michaels-gallery.iam.gserviceaccount.com`. You need it in Part 2.

### Create the key

1. Click the service account, open the **Keys** tab → **Add key → Create new key** → **JSON** → **Create**.
2. A `.json` file downloads to your computer. That file is the key. Anyone who has it can read the folders shared with the service account.

> **"Service account key creation is disabled"?** Workspace organizations created in
> the last few years block keys by default. To allow keys for this project only:
> 1. Make sure your account has the **Organization Policy Administrator** role. Select your
>    organization (not the project) in the picker, go to **IAM & Admin → IAM**, then
>    **Grant access**: add your own email with that role.
> 2. Switch back to the `michaels-gallery` project → **IAM & Admin → Organization Policies**.
> 3. Open **Disable service account key creation** (`iam.disableServiceAccountKeyCreation`)
>    → **Manage policy** → **Override parent's policy** → add a rule with
>    **Enforcement: Off** → **Set policy**.
> 4. Go back and create the key. You can turn the policy back on afterwards: existing keys
>    keep working.

### Put the key on your server

Copy the file straight from your computer to the server. For example, from the folder
where it was downloaded:

```bash
scp ~/Downloads/michaels-gallery-*.json  you@your-server:~/drive-powered-gallery/deploy/secrets/drive-key.json
```

Then on the server, make it readable only by the site's container user (ID 1001):

```bash
cd ~/drive-powered-gallery/deploy
sudo chown 1001:1001 secrets/drive-key.json
sudo chmod 400 secrets/drive-key.json
```

Finally, **delete the downloaded copy** from your computer (and empty the trash). If the
key ever leaks, go to the service account's **Keys** tab, delete it, and create a new one.

---

## Part 2. The "Clientes" folder

### Share it with the service account

1. In [Google Drive](https://drive.google.com), create a folder called **Clientes**, or use the one you have.
2. Right-click it → **Share → Share**.
3. Paste the service account email from Part 1, set the role to **Viewer**, untick
   **Notify people**, and click **Share**.

> **Workspace says you can't share outside your organization?** Your admin settings block
> external sharing. In the [Admin console](https://admin.google.com): **Apps → Google
> Workspace → Drive and Docs → Sharing settings → Sharing options**, allow sharing outside
> your organization. You can limit it to allowlisted domains and add
> `iam.gserviceaccount.com`. Then try sharing again.

### Copy the folder ID

Open the Clientes folder. The address bar shows:

```
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345
                                       └──────────── folder ID ───────────┘
```

Put that last part in `deploy/.env`:

```
DRIVE_MODE=google
DRIVE_ROOT_FOLDER_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz012345
```

### How to organise it

```
Clientes/
  2026-11 Ana y Diego, boda/       ← one folder per client (pick it in the Studio)
    01 Preparativos/               ← subfolders become chapters
    02 Ceremonia/                    the number sets the order and is hidden
    03 Fiesta/
  2026-12 Retratos Gómez/          ← photos directly inside work too (one chapter)
```

---

## Part 3. OAuth client for Studio sign-in

### Set up the consent screen (once)

1. Menu (☰) → **APIs & Services → OAuth consent screen**. It may be called
   **Google Auth Platform**. Click **Get started**.
2. **App name**: `Michael's Gallery Studio`. **User support email**: your email. **Next**.
3. **Audience**:
   - Choose **External** if you sign in with a regular `@gmail.com` account. That's the
     one in `ADMIN_EMAILS`.
   - Choose **Internal** only if every Studio account belongs to your Workspace domain.
4. **Contact information**: your email. Agree to the policy, then **Create**.
5. If you chose External: go to **Audience** and click **Publish app** → **Confirm**.
   The site only asks for your email address, so Google doesn't need to review the app.
   If you'd rather leave it in *Testing*, add your Gmail under **Test users** instead.

### Create the client

1. In the same area, open **Clients** → **+ Create client**. In older menus this is
   **Credentials → Create credentials → OAuth client ID**.
2. **Application type**: *Web application*. **Name**: `Studio`.
3. Leave **Authorized JavaScript origins** empty. Under **Authorized redirect URIs**, click
   **+ Add URI** and enter exactly (with your real domain):
   ```
   https://your-domain.com/api/auth/google/callback
   ```
   It must match `SITE_URL` in `deploy/.env`, with `https` and no trailing slash.
4. Click **Create**. Copy the **Client ID** and **Client secret** now. Newer consoles show
   the secret only once; if you lose it, add a new secret on the client's page.

Put them in `deploy/.env` on the server:

```
SITE_URL=https://your-domain.com
ADMIN_EMAILS=you@gmail.com
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

Once `GOOGLE_CLIENT_ID` is set, the password sign-in turns off, so you can clear
`ADMIN_PASSWORD`.

---

## Check it works

```bash
cd ~/drive-powered-gallery/deploy
chmod 600 .env
docker compose up -d --build
docker compose logs -f app
```

1. Open `https://your-domain.com/studio` and **Sign in with Google**.
2. Click **New album**: your client folders from Clientes should be listed.
3. Pick one, set a code, publish, then try the code at `https://your-domain.com/acceso`.

| Problem | Likely cause |
| --- | --- |
| `redirect_uri_mismatch` on sign-in | The redirect URI in Part 3 doesn't exactly match `SITE_URL` + `/api/auth/google/callback`. |
| "That Google account is not allowed into the Studio" | The email isn't in `ADMIN_EMAILS`. |
| No folders in New album | Clientes isn't shared with the service account email, or the folder ID is wrong. |
| `EACCES` on `/run/secrets/drive_key` in the logs | Run the `chown 1001:1001` and `chmod 400` commands from Part 1. |
