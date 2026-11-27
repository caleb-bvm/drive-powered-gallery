# Running the site on your own server with Docker

Everything for the deployment lives in `deploy/`. The stack has two containers:

- **app**: the site, listening on `127.0.0.1:3000`. Web previews and uploaded images are
  kept in the `gallery-data` volume.
- **db**: Postgres 17, with its data in the `db-data` volume.

A reverse proxy on the server, such as Caddy or nginx, provides HTTPS and forwards
traffic to the app.

## What the server needs

- Linux with **Docker** and the **Compose plugin** (`docker compose version` should work).
- A domain pointing at the server, with ports 80 and 443 open.
- Disk space for previews: about 1 MB per photo. The originals stay in Drive.

## First install

```bash
git clone https://github.com/caleb-bvm/drive-powered-gallery.git
cd drive-powered-gallery/deploy
cp .env.example .env
chmod 600 .env
nano .env                 # fill it in, see below
```

In `.env`:

1. `SITE_URL`: your address with `https`, e.g. `https://michaelsgallery.com`.
2. `APP_SECRET`: run `openssl rand -base64 36` and paste the result. **Never change it
   later**: every access code and session depends on it. Keep a copy in your password
   manager.
3. `POSTGRES_PASSWORD`: run `openssl rand -base64 24` and paste the result.
4. The Google values: follow [google-setup.md](google-setup.md). The Drive key file goes in
   `deploy/secrets/drive-key.json`.

Then start it:

```bash
docker compose up -d --build
docker compose ps          # both should become "healthy"
docker compose logs -f app
```

The database tables are created automatically on first start.

## HTTPS with Caddy (simplest)

Install [Caddy](https://caddyserver.com/docs/install) on the server and put this in
`/etc/caddy/Caddyfile`:

```
michaelsgallery.com {
	reverse_proxy 127.0.0.1:3000 {
		header_up X-Real-IP {remote_host}
	}
}
```

Then run `sudo systemctl reload caddy`. Caddy gets and renews the certificate on its own.

<details>
<summary>Using nginx instead</summary>

```nginx
server {
    server_name michaelsgallery.com;
    client_max_body_size 30m;            # Studio image uploads

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;             # stream ZIP downloads as they're built
        proxy_read_timeout 900s;         # large ZIPs take a while
    }
    # add certificates with: sudo certbot --nginx -d michaelsgallery.com
}
```
</details>

The site must be served over HTTPS: sign-in and gallery cookies are marked Secure in
production. The proxy must also set `X-Real-IP`, because the attempt limits on access
codes count per visitor.

## Updating

```bash
cd drive-powered-gallery
git pull
cd deploy
docker compose up -d --build
```

## Backups

The database holds albums, codes, favourites and site text. Previews can be rebuilt from
Drive, but the site images you upload in the Studio live only in the `gallery-data` volume.

```bash
# database, e.g. nightly from cron
docker compose exec -T db pg_dump -U gallery gallery | gzip > ~/backups/gallery-$(date +%F).sql.gz

# uploaded images and previews
docker run --rm -v michaels-gallery_gallery-data:/data -v ~/backups:/b alpine tar czf /b/gallery-data-$(date +%F).tgz -C /data .
```

Also keep `deploy/.env` (above all `APP_SECRET`) somewhere safe.

To restore the database:

```bash
gunzip -c gallery-YYYY-MM-DD.sql.gz | docker compose exec -T db psql -U gallery gallery
```
