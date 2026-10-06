import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "./api.js";
import { closeSnapshotBrowser } from "./snapshot.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.resolve(process.env.DIST_DIR || path.join(root, "dist"));
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, ".data"));
const port = Number(process.env.PORT || 8080);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
};

const handleApi = createApi({ dataDir });

async function fileAt(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() ? info : null;
  } catch {
    return null;
  }
}

async function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = "/";
  }
  let filePath = path.join(distDir, path.normalize(decoded));
  if (!filePath.startsWith(distDir + path.sep) && filePath !== distDir) filePath = distDir;

  let info = await fileAt(filePath);
  const isAsset = pathname.startsWith("/assets/");
  if (!info) {
    // Unknown assets are real 404s; everything else is a client-side route.
    if (isAsset || path.extname(decoded)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...SECURITY_HEADERS });
      return res.end("Not found\n");
    }
    filePath = path.join(distDir, "index.html");
    info = await fileAt(filePath);
    if (!info) {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("App bundle not found. Run `npm run build` first.\n");
    }
  }

  res.writeHead(200, {
    "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
    ...SECURITY_HEADERS,
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");

  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("healthy\n");
  }
  if (pathname.startsWith("/api/")) return handleApi(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return res.end();
  }
  return serveStatic(req, res, pathname);
});

server.listen(port, () => console.log(`Livefolio listening on port ${port}`));

const shutdown = () => {
  closeSnapshotBrowser().finally(() => server.close(() => process.exit(0)));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
