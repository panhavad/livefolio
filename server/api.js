import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { promisify } from "node:util";
import { captureSnapshot, detectImageType, SnapshotError } from "./snapshot.js";
import { createStore } from "./store.js";

const scryptAsync = promisify(scrypt);

const SESSION_COOKIE = "livefolio_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 1_000_000;
const MAX_IMAGE_BYTES = 5_000_000;
const MAX_IMAGES_PER_USER = 400;
// Unsaved uploads and snapshots stay around this long before cleanup removes them.
const IMAGE_GRACE_MS = 6 * 60 * 60 * 1000;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const LOGIN_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };
const SIGNUP_LIMIT = { max: 20, windowMs: 60 * 60 * 1000 };
const SNAPSHOT_LIMIT = { max: 40, windowMs: 15 * 60 * 1000 };
const UPLOAD_LIMIT = { max: 60, windowMs: 60 * 60 * 1000 };

// "maya-chen" is the built-in demo portfolio linked from the landing page.
const RESERVED_SLUGS = new Set(["maya-chen", "api", "admin", "studio", "assets", "health"]);
const THEMES = new Set(["midnight", "paper", "ocean", "sky", "forest", "sand", "plum", "rose"]);
const STATUSES = new Set(["active", "inactive", "deprecated"]);
const IMAGE_SOURCES = new Set(["snapshot", "upload", "url"]);
const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const IMAGE_PATH_RE = /^\/api\/images\/([A-Za-z0-9_-]{22})\.(png|jpg|webp|gif)$/;
// Snapshots from the old third-party service were never checked for bot-check pages.
const LEGACY_SNAPSHOT_RE = /^https:\/\/image\.thum\.io\//;
const LEGACY_RETRY_MS = 6 * 60 * 60 * 1000;
// Website snapshots refresh in the background when the studio or a public page is opened,
// at most this often per project so page views can't keep the browser busy.
const SNAPSHOT_REFRESH_MS = Math.max(1, Number(process.env.LIVEFOLIO_SNAPSHOT_REFRESH_MINUTES || 10)) * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const slugify = (value) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function verifyPassword(password, stored) {
  const [scheme, salt, key] = String(stored).split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

function createRateLimiter({ max, windowMs }) {
  const hits = new Map();
  const entry = (key) => {
    const now = Date.now();
    let item = hits.get(key);
    if (!item || item.resetAt <= now) {
      item = { count: 0, resetAt: now + windowMs };
      hits.set(key, item);
    }
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    return item;
  };
  return {
    check(key) {
      if (entry(key).count >= max) {
        throw new HttpError(429, "Too many attempts. Please wait a few minutes and try again.");
      }
    },
    hit(key) {
      entry(key).count += 1;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

function text(value, max, label, { required = false } = {}) {
  if (value == null) value = "";
  if (typeof value !== "string") throw new HttpError(400, `${label} must be text.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new HttpError(400, `${label} is required.`);
  if (trimmed.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer.`);
  return trimmed;
}

function httpUrl(value, label, { required = false } = {}) {
  const raw = text(value, 2048, label, { required });
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, `${label} must be a valid web address.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, `${label} must start with http:// or https://.`);
  }
  return raw;
}

function email(value, label, { required = false } = {}) {
  const address = text(value, 254, label, { required }).toLowerCase();
  if (address && !EMAIL_RE.test(address)) throw new HttpError(400, `${label} must be a valid email address.`);
  return address;
}

// Project images are either an external http(s) URL or one of the owner's stored images.
function projectImage(value, label, ownsImage) {
  const raw = text(value, 2048, label);
  if (!raw) return "";
  const stored = IMAGE_PATH_RE.exec(raw);
  if (stored) {
    if (!ownsImage(stored[1])) throw new HttpError(400, `${label} is no longer available. Upload it again.`);
    return raw;
  }
  return httpUrl(raw, label);
}

function sanitizeProject(project, index, ownsImage) {
  if (!project || typeof project !== "object") throw new HttpError(400, "Invalid project.");
  const label = `Project ${index + 1}`;
  const id = (typeof project.id === "number" && Number.isFinite(project.id)) ||
    (typeof project.id === "string" && project.id.length <= 64)
    ? project.id
    : randomUUID();
  const tags = Array.isArray(project.tags)
    ? project.tags.slice(0, 10).map((tag) => text(tag, 40, `${label} tag`)).filter(Boolean)
    : [];
  const image = projectImage(project.image, `${label} image`, ownsImage);
  return {
    id,
    title: text(project.title, 80, `${label} name`, { required: true }),
    url: httpUrl(project.url, `${label} URL`, { required: true }),
    description: text(project.description, 180, `${label} description`),
    status: STATUSES.has(project.status) ? project.status : "active",
    year: text(project.year, 10, `${label} year`),
    tags,
    image,
    imageSource: IMAGE_SOURCES.has(project.imageSource) ? project.imageSource
      : !image || /^https:\/\/image\.thum\.io\//.test(image) ? "snapshot" : "url",
  };
}

function sanitizeData(input, ownsImage) {
  if (!input || typeof input !== "object") throw new HttpError(400, "Invalid portfolio data.");
  const slug = text(input.slug, 60, "Public URL", { required: true }).toLowerCase();
  if (slug.length < 3 || !SLUG_RE.test(slug)) {
    throw new HttpError(400, "Public URL must be at least 3 letters, numbers, or single hyphens.");
  }
  if (!Array.isArray(input.projects)) throw new HttpError(400, "Projects must be a list.");
  if (input.projects.length > 200) throw new HttpError(400, "You can add up to 200 projects.");
  return {
    name: text(input.name, 80, "Name", { required: true }),
    role: text(input.role, 100, "Role"),
    intro: text(input.intro, 280, "Introduction"),
    location: text(input.location, 100, "Location"),
    email: email(input.email, "Contact email"),
    slug,
    pageTitle: text(input.pageTitle, 80, "Page title"),
    published: Boolean(input.published),
    studioDark: Boolean(input.studioDark),
    portfolioTheme: THEMES.has(input.portfolioTheme) ? input.portfolioTheme : "midnight",
    projects: input.projects.map((project, index) => sanitizeProject(project, index, ownsImage)),
  };
}

const publicPortfolio = (data) => ({
  name: data.name,
  role: data.role,
  intro: data.intro,
  location: data.location,
  email: data.email,
  slug: data.slug,
  pageTitle: data.pageTitle || "",
  published: true,
  portfolioTheme: data.portfolioTheme,
  projects: data.projects
    .filter((project) => project.status !== "inactive")
    .map((project) => (LEGACY_SNAPSHOT_RE.test(project.image || "") ? { ...project, image: "" } : project)),
});

function parseCookies(header = "") {
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

// Bodies a little over the limit are drained so the client gets a clean 413;
// anything far larger is cut off.
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > maxBytes * 4) {
      reject(new HttpError(413, "Request is too large."));
      req.resume();
      return;
    }
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        if (size > maxBytes * 4) req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => (tooLarge ? reject(new HttpError(413, "Request is too large.")) : resolve(Buffer.concat(chunks))));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const body = await readBody(req, MAX_BODY_BYTES);
  try {
    return body.length ? JSON.parse(body.toString("utf8")) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

const isSecure = (req) =>
  Boolean(req.socket?.encrypted) || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";

function sessionCookie(req, token, maxAgeSeconds) {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    isSecure(req) ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

// Blocks cross-site form posts: mutations must be JSON (or a raw image upload, which
// browsers can't send cross-site without a CORS preflight) and, when the browser
// reports an Origin, it must match the host being called.
function assertSameOrigin(req, { allowImages = false } = {}) {
  const contentType = String(req.headers["content-type"] || "");
  const allowed = contentType.startsWith("application/json") || (allowImages && /^image\/(png|jpeg|webp|gif)\b/.test(contentType));
  if (!allowed) throw new HttpError(415, allowImages ? "Upload a PNG, JPEG, WebP, or GIF image." : "Expected a JSON request.");
  const origin = req.headers.origin;
  if (origin) {
    let originHost;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = "";
    }
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    if (originHost !== host) throw new HttpError(403, "Cross-site request blocked.");
  }
}

export function createApi({ dataDir }) {
  const store = createStore(dataDir);
  const loginLimiter = createRateLimiter(LOGIN_LIMIT);
  const signupLimiter = createRateLimiter(SIGNUP_LIMIT);
  const snapshotLimiter = createRateLimiter(SNAPSHOT_LIMIT);
  const uploadLimiter = createRateLimiter(UPLOAD_LIMIT);
  let dummyHash;

  const findUserByEmail = (db, address) => Object.values(db.users).find((user) => user.email === address);

  const slugTaken = (db, slug, exceptUserId) =>
    RESERVED_SLUGS.has(slug) ||
    Object.values(db.users).some((user) => user.id !== exceptUserId && user.data.slug === slug);

  function uniqueSlug(db, name) {
    let base = slugify(name).slice(0, 50) || "folio";
    if (base.length < 3) base = `${base}-folio`;
    let slug = base;
    for (let n = 2; slugTaken(db, slug); n += 1) slug = `${base}-${n}`;
    return slug;
  }

  function getSession(db, req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const key = sha256(token);
    const session = db.sessions[key];
    if (!session) return null;
    const user = db.users[session.userId];
    if (!user || session.expiresAt <= Date.now()) {
      delete db.sessions[key];
      return null;
    }
    return { key, user };
  }

  function startSession(db, req, userId) {
    const now = Date.now();
    for (const [key, session] of Object.entries(db.sessions)) {
      if (session.expiresAt <= now) delete db.sessions[key];
    }
    const token = randomBytes(32).toString("base64url");
    db.sessions[sha256(token)] = { userId, createdAt: now, expiresAt: now + SESSION_TTL_MS };
    return sessionCookie(req, token, SESSION_TTL_MS / 1000);
  }

  const account = (user) => ({ user: { email: user.email }, data: user.data });

  async function signup(req, res, db) {
    const ip = req.socket.remoteAddress || "unknown";
    signupLimiter.check(ip);
    const body = await readJson(req);
    const name = text(body.name, 80, "Name", { required: true });
    const address = email(body.email, "Email", { required: true });
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < MIN_PASSWORD) throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters.`);
    if (password.length > MAX_PASSWORD) throw new HttpError(400, `Password must be ${MAX_PASSWORD} characters or fewer.`);
    signupLimiter.hit(ip);
    if (findUserByEmail(db, address)) throw new HttpError(409, "An account with this email already exists. Log in instead.");

    const passwordHash = await hashPassword(password);
    // Re-check after the async hash in case of a concurrent signup.
    if (findUserByEmail(db, address)) throw new HttpError(409, "An account with this email already exists. Log in instead.");
    const user = {
      id: randomUUID(),
      email: address,
      passwordHash,
      createdAt: new Date().toISOString(),
      data: {
        name,
        role: "",
        intro: "",
        location: "",
        email: address,
        slug: uniqueSlug(db, name),
        pageTitle: "",
        published: false,
        studioDark: false,
        portfolioTheme: "midnight",
        projects: [],
      },
    };
    db.users[user.id] = user;
    const cookie = startSession(db, req, user.id);
    await store.persist();
    send(res, 201, account(user), { "Set-Cookie": cookie });
  }

  async function login(req, res, db) {
    const body = await readJson(req);
    const address = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const limitKey = `${req.socket.remoteAddress || "unknown"}|${address}`;
    loginLimiter.check(limitKey);

    const user = address && findUserByEmail(db, address);
    let valid = false;
    if (user && password && password.length <= MAX_PASSWORD) {
      valid = await verifyPassword(password, user.passwordHash);
    } else {
      // Spend the same time as a real check so responses don't reveal which emails exist.
      dummyHash ??= await hashPassword(randomBytes(16).toString("hex"));
      await verifyPassword(password.slice(0, MAX_PASSWORD) || "x", dummyHash);
    }
    if (!valid) {
      loginLimiter.hit(limitKey);
      throw new HttpError(401, "Incorrect email or password.");
    }

    loginLimiter.reset(limitKey);
    const cookie = startSession(db, req, user.id);
    await store.persist();
    send(res, 200, account(user), { "Set-Cookie": cookie });
  }

  async function logout(req, res, db) {
    const session = getSession(db, req);
    if (session) {
      delete db.sessions[session.key];
      await store.persist();
    }
    send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });
  }

  function requireSession(db, req) {
    const session = getSession(db, req);
    if (!session) throw new HttpError(401, "Your session has expired. Please log in again.");
    return session;
  }

  const ownsImage = (db, userId) => (id) => db.images[id]?.userId === userId;

  const referencedImages = (data) => new Set(
    data.projects.map((project) => IMAGE_PATH_RE.exec(project.image || "")?.[1]).filter(Boolean),
  );

  // Removes the user's stored images that no saved project uses (after a grace
  // period, so images in an unsaved editor survive).
  async function pruneImages(db, user) {
    const keep = referencedImages(user.data);
    const cutoff = Date.now() - IMAGE_GRACE_MS;
    const removed = [];
    for (const [id, image] of Object.entries(db.images)) {
      if (image.userId === user.id && !keep.has(id) && image.createdAt < cutoff) {
        delete db.images[id];
        removed.push(store.deleteImage(`${id}.${image.type}`));
      }
    }
    await Promise.all(removed);
    return removed.length;
  }

  async function storeImage(db, user, buffer, type, source) {
    await pruneImages(db, user);
    const count = Object.values(db.images).filter((image) => image.userId === user.id).length;
    if (count >= MAX_IMAGES_PER_USER) throw new HttpError(429, "You’ve reached the image limit. Remove unused projects and try again.");
    const id = randomBytes(16).toString("base64url");
    await store.writeImage(`${id}.${type}`, buffer);
    db.images[id] = { userId: user.id, type, source, size: buffer.length, createdAt: Date.now() };
    await store.persist();
    return `/api/images/${id}.${type}`;
  }

  // Re-captures old third-party snapshots with the bot-check-aware capture. Images that
  // turn out to be bot checks are removed (the project shows a placeholder); temporary
  // failures are retried later. Returns how many still need another attempt.
  async function migrateLegacySnapshots() {
    const db = await store.load();
    let remaining = 0;
    let replaced = 0;
    for (const user of Object.values(db.users)) {
      for (const project of [...user.data.projects]) {
        const legacy = project.image;
        if (!LEGACY_SNAPSHOT_RE.test(legacy || "")) continue;
        let image = "";
        try {
          const shot = await captureSnapshot(project.url);
          image = await storeImage(db, user, shot.buffer, shot.type, "snapshot");
        } catch (error) {
          if (!(error instanceof SnapshotError && ["blocked", "blank", "invalid"].includes(error.status))) {
            remaining += 1;
            continue;
          }
        }
        // The owner may have edited the project meanwhile; only swap out the legacy image.
        const current = user.data.projects.find((item) => item.id === project.id);
        if (current?.image !== legacy) continue;
        current.image = image;
        current.imageSource = "snapshot";
        replaced += 1;
        await store.persist();
      }
    }
    if (replaced) console.log(`Livefolio: re-checked ${replaced} old snapshot(s).`);
    return remaining;
  }

  function scheduleLegacyMigration(delayMs) {
    const timer = setTimeout(async () => {
      let remaining = 1;
      try {
        remaining = await migrateLegacySnapshots();
      } catch (error) {
        console.error("Livefolio: re-checking old snapshots failed", error);
      }
      if (remaining) scheduleLegacyMigration(LEGACY_RETRY_MS);
    }, delayMs);
    timer.unref?.();
  }
  scheduleLegacyMigration(Number(process.env.LIVEFOLIO_MIGRATION_DELAY_MS || 10_000));

  const refreshing = new Set();
  const lastRefreshAttempt = new Map();
  const userQueues = new Map();
  const refreshKey = (user, projectId) => `${user.id}:${projectId}`;
  const isSnapshotProject = (project) => (project.imageSource || "snapshot") === "snapshot";
  const storedImage = (db, image) => {
    const id = IMAGE_PATH_RE.exec(image || "")?.[1];
    return id ? db.images[id] : null;
  };

  async function refreshProjectSnapshot(db, user, projectId, url) {
    lastRefreshAttempt.set(refreshKey(user, projectId), Date.now());
    let shot;
    try {
      shot = await captureSnapshot(url);
    } catch {
      // Blocked, blank, or unreachable this time: keep showing the last good snapshot.
      return;
    }
    const stillWanted = () => {
      const current = user.data.projects.find((item) => item.id === projectId);
      return current && current.url === url && isSnapshotProject(current) ? current : null;
    };
    if (!stillWanted()) return;
    const image = await storeImage(db, user, shot.buffer, shot.type, "snapshot");
    const current = stillWanted();
    if (!current) return;
    current.image = image;
    current.imageSource = "snapshot";
    await store.persist();
  }

  // Queues a background refresh for the user's snapshot projects that are due one.
  // Captures for one portfolio run one at a time; the browser itself is shared.
  function refreshSnapshots(db, user, { visibleOnly = false } = {}) {
    const now = Date.now();
    for (const project of user.data.projects) {
      const key = refreshKey(user, project.id);
      if (!isSnapshotProject(project) || refreshing.has(key)) continue;
      if (visibleOnly && project.status === "inactive") continue;
      const last = Math.max(storedImage(db, project.image)?.createdAt || 0, lastRefreshAttempt.get(key) || 0);
      if (now - last < SNAPSHOT_REFRESH_MS) continue;
      refreshing.add(key);
      const { id, url } = project;
      const queue = (userQueues.get(user.id) || Promise.resolve())
        .then(() => refreshProjectSnapshot(db, user, id, url))
        .catch((error) => console.error("Livefolio: snapshot refresh failed", error))
        .finally(() => refreshing.delete(key));
      userQueues.set(user.id, queue);
    }
  }

  const snapshotStatus = (user, projects = user.data.projects) => ({
    refreshing: projects.filter((project) => refreshing.has(refreshKey(user, project.id))).map((project) => project.id),
    images: Object.fromEntries(projects.filter(isSnapshotProject).map((project) => [project.id, project.image])),
  });

  // A save sent from a page loaded before a background refresh would otherwise put the
  // older snapshot back (or point at one that has since been cleaned up).
  function keepNewerSnapshots(db, user, incoming) {
    if (!Array.isArray(incoming?.projects)) return;
    const saved = new Map(user.data.projects.map((project) => [project.id, project]));
    for (const project of incoming.projects) {
      const existing = project && saved.get(project.id);
      if (!existing || !isSnapshotProject(existing) || project.imageSource !== "snapshot" || project.url !== existing.url) continue;
      if (!project.image || project.image === existing.image) continue;
      const current = storedImage(db, existing.image);
      if (!current) continue;
      const sent = storedImage(db, project.image);
      const sentIsOlder = IMAGE_PATH_RE.test(project.image) ? !sent || sent.createdAt < current.createdAt : LEGACY_SNAPSHOT_RE.test(project.image);
      if (sentIsOlder) project.image = existing.image;
    }
  }

  async function savePortfolio(req, res, db) {
    const session = requireSession(db, req);
    const body = await readJson(req);
    keepNewerSnapshots(db, session.user, body.data);
    const data = sanitizeData(body.data, ownsImage(db, session.user.id));
    if (slugTaken(db, data.slug, session.user.id)) throw new HttpError(409, "That public URL is already taken.");
    session.user.data = data;
    await pruneImages(db, session.user);
    await store.persist();
    send(res, 200, { data });
  }

  async function takeSnapshot(req, res, db) {
    const { user } = requireSession(db, req);
    snapshotLimiter.check(user.id);
    const body = await readJson(req);
    const target = httpUrl(body.url, "Project URL", { required: true });
    snapshotLimiter.hit(user.id);
    let shot;
    try {
      shot = await captureSnapshot(target);
    } catch (error) {
      if (error instanceof SnapshotError) return send(res, 200, { status: error.status, message: error.message });
      throw error;
    }
    const image = await storeImage(db, user, shot.buffer, shot.type, "snapshot");
    send(res, 200, { status: "ok", image });
  }

  async function uploadImage(req, res, db) {
    const { user } = requireSession(db, req);
    uploadLimiter.check(user.id);
    const buffer = await readBody(req, MAX_IMAGE_BYTES);
    const type = detectImageType(buffer);
    if (!type) throw new HttpError(415, "Upload a PNG, JPEG, WebP, or GIF image.");
    uploadLimiter.hit(user.id);
    const image = await storeImage(db, user, buffer, type, "upload");
    send(res, 201, { image });
  }

  function serveImage(req, res, db, id, type) {
    const image = db.images[id];
    if (!image || image.type !== type) throw new HttpError(404, "Image not found.");
    const stream = createReadStream(store.imagePath(`${id}.${type}`));
    stream.on("open", () => {
      res.writeHead(200, {
        "Content-Type": IMAGE_TYPES[type],
        "Content-Length": image.size,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      });
      if (req.method === "HEAD") {
        stream.destroy();
        res.end();
      } else {
        stream.pipe(res);
      }
    });
    stream.on("error", () => {
      if (!res.headersSent) send(res, 404, { error: "Image not found." });
      else res.destroy();
    });
  }

  return async function handleApi(req, res) {
    try {
      const { pathname } = new URL(req.url, "http://localhost");
      const db = await store.load();
      const method = req.method;

      if (method !== "GET" && method !== "HEAD") assertSameOrigin(req, { allowImages: pathname === "/api/images" });

      if (pathname === "/api/auth/session" && method === "GET") {
        const session = getSession(db, req);
        return send(res, 200, session ? account(session.user) : { user: null });
      }
      if (pathname === "/api/auth/signup" && method === "POST") return await signup(req, res, db);
      if (pathname === "/api/auth/login" && method === "POST") return await login(req, res, db);
      if (pathname === "/api/auth/logout" && method === "POST") return await logout(req, res, db);
      if (pathname === "/api/portfolio" && method === "PUT") return await savePortfolio(req, res, db);
      if (pathname === "/api/snapshots" && method === "POST") return await takeSnapshot(req, res, db);
      if (pathname === "/api/images" && method === "POST") return await uploadImage(req, res, db);

      // The owner's studio asks for fresh snapshots on load, then polls until they're done.
      if (pathname === "/api/portfolio/snapshots" && (method === "POST" || method === "GET")) {
        const { user } = requireSession(db, req);
        if (method === "POST") refreshSnapshots(db, user);
        return send(res, 200, snapshotStatus(user));
      }

      const image = IMAGE_PATH_RE.exec(pathname);
      if (image && (method === "GET" || method === "HEAD")) return serveImage(req, res, db, image[1], image[2]);

      const match = pathname.match(/^\/api\/portfolios\/([a-z0-9-]{1,60})$/);
      if (match && method === "GET") {
        const owner = Object.values(db.users).find((user) => user.data.slug === match[1]);
        if (!owner || !owner.data.published) throw new HttpError(404, "Portfolio not found.");
        refreshSnapshots(db, owner, { visibleOnly: true });
        const portfolio = publicPortfolio(owner.data);
        return send(res, 200, { portfolio, refreshing: snapshotStatus(owner, portfolio.projects).refreshing });
      }

      throw new HttpError(404, "Not found.");
    } catch (error) {
      if (error instanceof HttpError) return send(res, error.status, { error: error.message });
      console.error(error);
      return send(res, 500, { error: "Something went wrong. Please try again." });
    }
  };
}
