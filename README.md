# Livefolio

A polished, responsive portfolio builder built with React and Vite.

## Features

- Account registration and login flow
- Editable public profile and introduction
- Project cards with automatic website snapshots from submitted URLs
- Active, inactive, and deprecated project states
- Four customizable color themes
- Shareable public portfolio URLs at `/p/your-name`
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

The included GitHub Actions workflow publishes a new container image to GitHub
Container Registry whenever code is pushed to `main`.

On the deployment server:

1. Set `LIVEFOLIO_IMAGE=ghcr.io/OWNER/REPOSITORY:latest` in `.env`.
2. Set `AUTO_UPDATE=true` in `.env`.
3. Sign in once if the package is private:

   ```bash
   echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
   ```

   Set `DOCKER_CONFIG_PATH` to the resulting `config.json` path if Docker is
   running under a user other than `root`.

4. Pull the first published image, then start the app and update watcher:

   ```bash
   docker compose pull
   docker compose --profile auto-update up -d
   ```

Watchtower checks the registry every five minutes by default. When the
workflow publishes a new image, it pulls the update, replaces the app
container, and removes the old image. Set `UPDATE_INTERVAL_SECONDS` in `.env`
to change the polling interval.
