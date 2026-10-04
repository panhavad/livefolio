# Livefolio

A polished, responsive portfolio builder built with React and Vite.

## Features

- Account registration and login flow
- Editable public profile and introduction
- Project cards with automatic website snapshots from submitted URLs
- Active, inactive, and deprecated project states
- Shareable public portfolio URLs at `/p/your-name`
- Eight color themes for the public portfolio page (Midnight, Paper, Ocean, Sky,
  Forest, Sand, Plum, and Rose), chosen in Settings
- Responsive dashboard and public portfolio
- Local browser persistence for the prototype

## Run locally

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
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

When you run `docker compose up --build` from local source, the build cannot
see `.git`. It falls back to `YYYY.MM.DD-local` unless you pass the version in:

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

The container uses a multi-stage build and serves the production bundle from
Nginx. Client-side routes such as `/p/maya-chen` are routed back to the app,
and Docker checks `/health` to confirm the service is healthy.

## Automatic updates after a Git push

How it works:

1. You push to `master` (or `main`).
2. The [publish workflow](.github/workflows/publish-image.yml) builds the app
   and publishes `ghcr.io/panhavad/livefolio:latest` (plus a commit-SHA tag)
   for `linux/amd64` and `linux/arm64`.
3. [Watchtower](https://github.com/nicholas-fedor/watchtower) on the server
   polls the registry, pulls the new image, restarts the app container, and
   removes the old image.

On the deployment server:

1. Copy `.env.example` to `.env` and set:

   ```dotenv
   LIVEFOLIO_IMAGE=ghcr.io/panhavad/livefolio:latest
   AUTO_UPDATE=true
   ```

2. If the GHCR package is private, set `GHCR_USERNAME` and `GHCR_TOKEN` (a
   personal access token with `read:packages`) for Watchtower, and sign the
   host in for the first pull:

   ```bash
   echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
   ```

   Alternatively, make the package public under
   **GitHub → Packages → livefolio → Package settings**.

3. Pull the published image, then start the app and the update watcher:

   ```bash
   docker compose pull livefolio
   docker compose --profile auto-update up -d --no-build
   ```

Watchtower checks the registry every five minutes by default. Set
`UPDATE_INTERVAL_SECONDS` in `.env` to change the polling interval. To confirm
updates are being detected, run `docker logs -f livefolio-watchtower`.

> Watchtower only updates the `livefolio` container when `AUTO_UPDATE=true`
> and `LIVEFOLIO_IMAGE` points at the registry image. A locally built
> `livefolio:local` image is never auto-updated.
