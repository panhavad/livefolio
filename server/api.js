import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createStore } from "./store.js";

const scryptAsync = promisify(scrypt);

const SESSION_COOKIE = "livefolio_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 1_000_000;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const LOGIN_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };
const SIGNUP_LIMIT = { max: 20, windowMs: 60 * 60 * 1000 };

// "maya-chen" is the built-in demo portfolio linked from the landing page.
const RESERVED_SLUGS = new Set(["maya-chen", "api", "admin", "studio", "assets", "health"]);
const THEMES = new Set(["midnight", "paper", "ocean", "sky", "forest", "sand", "plum", "rose"]);
const STATUSES = new Set(["active", "inactive", "deprecated"]);
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

function sanitizeProject(project, index) {
  if (!project || typeof project !== "object") throw new HttpError(400, "Invalid project.");
  const label = `Project ${index + 1}`;
  const id = (typeof project.id === "number" && Number.isFinite(project.id)) ||
    (typeof project.id === "string" && project.id.length <= 64)
    ? project.id
    : randomUUID();
  const tags = Array.isArray(project.tags)
    ? project.tags.slice(0, 10).map((tag) => text(tag, 40, `${label} tag`)).filter(Boolean)
    : [];
  return {
    id,
    title: text(project.title, 80, `${label} name`, { required: true }),
    url: httpUrl(project.url, `${label} URL`, { required: true }),
    description: text(project.description, 180, `${label} description`),
    status: STATUSES.has(project.status) ? project.status : "active",
    year: text(project.year, 10, `${label} year`),
    tags,
    image: httpUrl(project.image, `${label} thumbnail`),
  };
}

function sanitizeData(input) {
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
    published: Boolean(input.published),
    studioDark: Boolean(input.studioDark),
    portfolioTheme: THEMES.has(input.portfolioTheme) ? input.portfolioTheme : "midnight",
    projects: input.projects.map(sanitizeProject),
  };
}

const publicPortfolio = (data) => ({
  name: data.name,
  role: data.role,
  intro: data.intro,
  location: data.location,
  email: data.email,
  slug: data.slug,
  published: true,
  portfolioTheme: data.portfolioTheme,
  projects: data.projects.filter((project) => project.status !== "inactive"),
});

function parseCookies(header = "") {
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Request is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new HttpError(400, "Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
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

// Blocks cross-site form posts: mutations must be JSON and, when the browser
// reports an Origin, it must match the host being called.
function assertSameOrigin(req) {
  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.startsWith("application/json")) throw new HttpError(415, "Expected a JSON request.");
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

  async function savePortfolio(req, res, db) {
    const session = getSession(db, req);
    if (!session) throw new HttpError(401, "Your session has expired. Please log in again.");
    const body = await readJson(req);
    const data = sanitizeData(body.data);
    if (slugTaken(db, data.slug, session.user.id)) throw new HttpError(409, "That public URL is already taken.");
    session.user.data = data;
    await store.persist();
    send(res, 200, { data });
  }

  return async function handleApi(req, res) {
    try {
      const { pathname } = new URL(req.url, "http://localhost");
      const db = await store.load();
      const method = req.method;

      if (method !== "GET" && method !== "HEAD") assertSameOrigin(req);

      if (pathname === "/api/auth/session" && method === "GET") {
        const session = getSession(db, req);
        return send(res, 200, session ? account(session.user) : { user: null });
      }
      if (pathname === "/api/auth/signup" && method === "POST") return await signup(req, res, db);
      if (pathname === "/api/auth/login" && method === "POST") return await login(req, res, db);
      if (pathname === "/api/auth/logout" && method === "POST") return await logout(req, res, db);
      if (pathname === "/api/portfolio" && method === "PUT") return await savePortfolio(req, res, db);

      const match = pathname.match(/^\/api\/portfolios\/([a-z0-9-]{1,60})$/);
      if (match && method === "GET") {
        const owner = Object.values(db.users).find((user) => user.data.slug === match[1]);
        if (!owner || !owner.data.published) throw new HttpError(404, "Portfolio not found.");
        return send(res, 200, { portfolio: publicPortfolio(owner.data) });
      }

      throw new HttpError(404, "Not found.");
    } catch (error) {
      if (error instanceof HttpError) return send(res, error.status, { error: error.message });
      console.error(error);
      return send(res, 500, { error: "Something went wrong. Please try again." });
    }
  };
}
