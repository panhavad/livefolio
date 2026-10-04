# Livefolio

A polished, responsive portfolio builder built with React and Vite, with a small
Node.js server for accounts and storage.

## Features

- Accounts with server-side password checks and secure session cookies
- Editable public profile and introduction
- Project cards with automatic website snapshots from submitted URLs
- Active, inactive, and deprecated project states
- Shareable public portfolio URLs at `/p/your-name`
- Eight color themes for the public portfolio page (Midnight, Paper, Ocean, Sky,
  Forest, Sand, Plum, and Rose), chosen on the studio's Projects page
- Responsive dashboard and public portfolio
- Portfolios saved on the server, so they work across devices and public links
  work for every visitor

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` serves the API too. Local accounts and portfolios are stored in
`.data/` (ignored by Git).

For a production build:

```bash
npm run build
npm start   # serves dist/ and the API on http://localhost:8080
```

## Accounts and data

- Passwords are hashed with scrypt; plain-text passwords are never stored.
- Logging in sets an `HttpOnly`, `SameSite=Lax` session cookie (`Secure` behind
  HTTPS). Sessions last 30 days and end on logout.
- Wrong credentials always get the same `Incorrect email or password.` message,
  and repeated failures are rate limited.
- Only the owner can change a portfolio. Visitors can see it only once it is
  published, and inactive projects stay hidden.
- Everything is stored in `db.json` inside `DATA_DIR` (`/data` in Docker, kept
  in the `livefolio-data` volume so it survives redeploys). Back it up with:

  ```bash
  docker cp livefolio:/data/db.json ./livefolio-backup.json
  ```

## Versioning

The app shows its version in the landing page footer and at the bottom of the
studio sidebar, e.g. `v2026.10.04-b6e22f7`. Hover over it to see the exact
build time.

The version is generated automatically on every build. You never need to edit
it by hand:

- `YYYY.MM.DD` is the date of the latest Git commit (in the committer's timezone)
- the suffix is the short commit hash, so several updates on the same day stay distinct
- builds with uncommitted changes use today's date and add `-dirty`
- set `APP_VERSION` to override it. The GitHub Actions workflow does this
  automatically and also tags each published image with the version.

The auto-update profile sets `APP_VERSION` for you. When you run
`docker compose up --build` yourself, the build cannot see `.git`. It falls
back to `YYYY.MM.DD-local` unless you pass the version in:

```bash
APP_VERSION="$(git log -1 --format=%cd --date=format:%Y.%m.%d)-$(git rev-parse --short=7 HEAD)" docker compose up -d --build
```

## Docker Compose

Build and run the app from local source:

```bash
docker compose up -d --build
```

The site is available at `http://localhost:8080`. Change the host port by
copying `.env.example` to `.env` and setting `LIVEFOLIO_PORT`.

The container uses a multi-stage build. A Node.js server (built-in modules only)
serves the production bundle and the `/api` routes. Client-side routes such as
`/p/maya-chen` are routed back to the app, and Docker checks `/health` to
confirm the service is healthy.

## Automatic updates after a Git push

There is nothing to configure. On the server, from the cloned repository, run:

```bash
docker compose --profile auto-update up -d --build --remove-orphans
```

That starts the app plus a small `livefolio-updater` container. Every minute,
the updater:

1. Fetches the branch the server checkout is on (normally `master`/`main`).
2. Fast-forwards the checkout when there are new commits.
3. Rebuilds and restarts the app with `docker compose up -d --build livefolio`,
   stamping it with the new version, then removes the old image.

If a build fails, the previous version keeps running and the updater retries
on the next check. Changes to the updater script deploy themselves. Changes to
the `updater` service in `compose.yml` need the command above to be run again.

Watch it work with `docker logs -f livefolio-updater`. To check more or less
often, set `UPDATE_INTERVAL_SECONDS` in `.env`.

Notes:

- The updater only fast-forwards. If you commit or edit tracked files directly
  on the server, it logs `Cannot fast-forward` until you clean up the checkout
  (for example with `git reset --hard origin/master`).
- Git runs as the owner of the checkout, so file ownership does not change.
- Public repositories cloned over SSH are fetched over HTTPS, so no keys are
  needed.
- The updater uses the host's Docker socket (`/var/run/docker.sock`) to
  rebuild the app.

The GitHub Actions workflow still publishes images to GitHub Container Registry
on every push, but the deployment no longer depends on it.
