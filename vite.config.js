import { execSync } from "node:child_process";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createApi } from "./server/api.js";

function git(args) {
  try {
    return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

// Version format: YYYY.MM.DD-<short commit>. The date comes from the latest commit
// (in the committer's timezone); uncommitted local changes use today's date and a "-dirty" suffix.
// CI passes APP_VERSION explicitly because the Docker build context excludes .git.
function resolveVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;

  const commit = git("rev-parse --short=7 HEAD");
  if (!commit) return `${formatDate(new Date())}-local`;

  if (git("status --porcelain")) return `${formatDate(new Date())}-${commit}-dirty`;

  const commitDate = git("log -1 --format=%cd --date=format:%Y.%m.%d");
  return `${commitDate}-${commit}`;
}

// Serves the same /api routes as server/index.js during `npm run dev` and `npm run preview`.
function livefolioApi() {
  let handleApi;
  const mount = (server) => {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith("/api/")) return next();
      handleApi ??= createApi({ dataDir: path.resolve(process.env.DATA_DIR || ".data") });
      handleApi(req, res);
    });
  };
  return { name: "livefolio-api", configureServer: mount, configurePreviewServer: mount };
}

export default defineConfig({
  plugins: [react(), livefolioApi()],
  define: {
    __APP_VERSION__: JSON.stringify(resolveVersion()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
