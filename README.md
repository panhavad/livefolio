# Livefolio

A polished, responsive portfolio builder built with React and Vite, with a small
Node.js server for accounts and storage.

## Features

- Accounts with server-side password checks and secure session cookies
- Editable public profile and introduction
- Project cards with automatic website snapshots that skip bot-check pages and
  refresh themselves when the studio or portfolio page is opened
- Upload or replace a custom image for any project
- Active, inactive, and deprecated project states
- Shareable public portfolio URLs at `/p/your-name`
- A "Your public page" card on the studio's main Projects screen for the page
  title, public URL, publish switch, and theme. There are eight themes:
  Midnight, Paper, Ocean, Sky, Forest, Sand, Plum, and Rose.
- Responsive dashboard and public portfolio
- Portfolios saved on the server, so they work across devices and public links
  work for every visitor

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` serves the API too. Local accounts, portfolios, and images are
stored in `.data/` (ignored by Git). Website snapshots use a locally installed
Chrome, Chromium, or Edge (found automatically, or set `CHROME_PATH`). Without
one, snapshots are unavailable but image uploads still work.

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
- Everything is stored in `DATA_DIR` (`/data` in Docker, kept in the
  `livefolio-data` volume so it survives redeploys): `db.json` plus project
  images in `images/`. Back it up with:

  ```bash
  docker cp livefolio:/data ./livefolio-backup
  ```

## Project images and snapshots

When you add a project URL, the server opens the page in Chromium, checks it,
and stores a screenshot on the server. In Docker, Chromium runs as a regular
windowed browser on a virtual display (Xvfb). That passes far more automatic bot
checks, such as Cloudflare's "Performing security verification", than headless
mode. If Xvfb isn't available, it falls back to headless. Before keeping a
snapshot, it makes sure the page isn't a bot check:

- **Skipped pages:** interstitials and overlays from Cloudflare, DataDome,
  PerimeterX, Imperva, AWS WAF, DDoS-Guard, hCaptcha, and reCAPTCHA. Pages that
  return 401, 403, or 429 and screenshots that come back blank are skipped too.
- **Same render:** the check and the screenshot come from the same page load.
  A second check right after the screenshot discards it if a challenge pops up
  mid-capture.
- **Self-clearing checks:** a "Just a moment…" check that clears on its own
  gets up to 20 seconds to finish, and then the real page is captured.

Snapshots stay current on their own. Opening the studio, returning to its tab,
or opening a public portfolio page refreshes them in the background. You see
the current image right away, and the new one appears as soon as it's ready;
the studio shows a small "Updating" badge while that happens. Each project is
re-captured at most once every 10 minutes, so page views can't keep the server
busy (set `SNAPSHOT_REFRESH_MINUTES` in `.env` to change this). If a refresh is
blocked or the site is down, the last good snapshot stays. Uploaded images and
image URLs are never replaced.

When a snapshot is skipped, the editor explains why. You can upload your own
image (PNG, JPEG, WebP, or GIF, up to 5 MB) or paste an image URL. Use
**Replace image** or **Use snapshot** to change it later. Uploaded photos are
resized and re-encoded in the browser, which also strips location metadata.
Projects without an image show a tidy placeholder with the site's domain.

If a site still shows an interactive challenge (for example "Press & Hold" or
a checkbox), Livefolio doesn't try to solve it. If it's your own site, the most
reliable fix is to let Livefolio through. In Cloudflare, add a WAF custom rule
that skips the challenge for your Livefolio server's IP address, then press
**Retake**.

Snapshots made before this checker existed came from a third-party service and
were never checked, so some of them show a bot-check page. They're never
displayed. The server re-captures them automatically shortly after it starts,
and opening such a project in the editor re-captures it right away. Any that
are still blocked show the placeholder instead.

The snapshot browser only reaches public websites. All of its traffic goes
through a built-in proxy that refuses private, loopback, link-local, and cloud
metadata addresses, including after redirects. Unused images are cleaned up a
few hours after they're replaced.

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

The container uses a multi-stage build. A Node.js server serves the production
bundle and the `/api` routes. The runtime image includes Chromium and fonts for
snapshots, which run with `--no-sandbox` because containers can't create
Chromium's sandbox; the container itself is the isolation boundary. Client-side routes such as
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
