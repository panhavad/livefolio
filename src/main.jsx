import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
  ImagePlus,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import "./styles.css";

const normalizeUrl = (value) => {
  const trimmed = value.trim();
  return trimmed && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;
};

const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
};

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getInitials = (name) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const getScreenFromPath = () => {
  const path = window.location.pathname;
  if (path.startsWith("/p/")) return "portfolio";
  if (path.startsWith("/studio")) return "dashboard";
  return "landing";
};

const getSlugFromPath = () => {
  try {
    return decodeURIComponent(window.location.pathname.slice(3)).replace(/\/+$/, "").toLowerCase();
  } catch {
    return "";
  }
};

// Sends JSON by default; a Blob body (an image upload) is sent as-is with its own type.
async function api(path, { method = "GET", body } = {}) {
  const isBlob = body instanceof Blob;
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": isBlob ? body.type : "application/json" },
      body: body === undefined ? undefined : isBlob ? body : JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error("Can’t reach Livefolio. Check your connection and try again."), { status: 0 });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(payload.error || "Something went wrong. Please try again."), { status: response.status });
  }
  return payload;
}

const hostnameOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const defaultPageTitle = (data) => `${data.name.split(" ")[0]}'s projects`;

const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_UPLOAD_MB = 5;

// Shrinks large photos and re-encodes them, which also strips location metadata.
async function prepareUpload(file) {
  if (file.type === "image/gif") return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const encode = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, 0.86));
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;
  return (await encode("image/jpeg")) || file;
}

const demoProjects = [
  {
    id: 1,
    title: "Atmos — Weather, reimagined",
    url: "https://weather.com",
    description:
      "A calm, location-first weather experience with beautifully simple forecasts.",
    status: "active",
    year: "2025",
    tags: ["Product design", "Development"],
    image:
      "https://images.unsplash.com/photo-1592210454359-9043f067919b?auto=format&fit=crop&w=1400&q=85",
  },
  {
    id: 2,
    title: "Sona — Find your focus",
    url: "https://www.spotify.com",
    description:
      "An ambient sound mixer made to help creative people settle into deep work.",
    status: "active",
    year: "2025",
    tags: ["Creative direction", "Web app"],
    image:
      "https://images.unsplash.com/photo-1614149162883-504ce4d13909?auto=format&fit=crop&w=1400&q=85",
  },
  {
    id: 3,
    title: "Field Notes",
    url: "https://www.notion.so",
    description:
      "A digital garden for collecting observations, ideas, and small discoveries.",
    status: "inactive",
    year: "2024",
    tags: ["Design system", "Frontend"],
    image:
      "https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=1400&q=85",
  },
  {
    id: 4,
    title: "Kinfolk Archive",
    url: "https://www.kinfolk.com",
    description:
      "A considered digital archive celebrating culture, home, work, and community.",
    status: "deprecated",
    year: "2023",
    tags: ["Art direction", "Editorial"],
    image:
      "https://images.unsplash.com/photo-1497215842964-222b430dc094?auto=format&fit=crop&w=1400&q=85",
  },
];

const pageThemes = {
  midnight: { name: "Midnight", hint: "Black", bg: "#050505", text: "#ffffff", muted: "#8a8a8a", line: "#242424", card: "#ffffff", cardText: "#050505", cardBorder: "#282828", accent: "#ff5a2a", shadow: "#000000" },
  paper: { name: "Paper", hint: "White", bg: "#ffffff", text: "#111111", muted: "#6f6f6f", line: "#e6e6e6", card: "#ffffff", cardText: "#111111", cardBorder: "#dcdcdc", accent: "#ff5a2a", shadow: "#0000001f" },
  ocean: { name: "Ocean", hint: "Deep blue", bg: "#0a1d47", text: "#ffffff", muted: "#9db0d6", line: "#213a72", card: "#ffffff", cardText: "#0a1d47", cardBorder: "#1c3266", accent: "#4cc2ff", shadow: "#020a1f" },
  sky: { name: "Sky", hint: "Light blue", bg: "#eaf2ff", text: "#0c2a5b", muted: "#5b6f93", line: "#c8d9f4", card: "#ffffff", cardText: "#0c2a5b", cardBorder: "#c8d9f4", accent: "#2563eb", shadow: "#0c2a5b26" },
  forest: { name: "Forest", hint: "Deep green", bg: "#0e2a1f", text: "#eef6ee", muted: "#93ad9d", line: "#1f4434", card: "#f6faf4", cardText: "#0e2a1f", cardBorder: "#1f4434", accent: "#8fdc6e", shadow: "#04120c" },
  sand: { name: "Sand", hint: "Warm cream", bg: "#f3ecdf", text: "#2b2118", muted: "#85735f", line: "#ddd0bb", card: "#fffaf2", cardText: "#2b2118", cardBorder: "#ddd0bb", accent: "#c2410c", shadow: "#2b211826" },
  plum: { name: "Plum", hint: "Dark purple", bg: "#24102f", text: "#fbf0ff", muted: "#b49cc2", line: "#3d2150", card: "#ffffff", cardText: "#24102f", cardBorder: "#3d2150", accent: "#e879f9", shadow: "#0d0412" },
  rose: { name: "Rose", hint: "Soft pink", bg: "#fff0f2", text: "#4a0f22", muted: "#96606f", line: "#f4ccd5", card: "#ffffff", cardText: "#4a0f22", cardBorder: "#f4ccd5", accent: "#e11d48", shadow: "#4a0f2226" },
};

const getPageTheme = (key) => pageThemes[key] || pageThemes.midnight;

const pageThemeStyle = (theme) => ({
  "--accent": theme.accent,
  "--pf-bg": theme.bg,
  "--pf-text": theme.text,
  "--pf-muted": theme.muted,
  "--pf-line": theme.line,
  "--pf-card": theme.card,
  "--pf-card-text": theme.cardText,
  "--pf-card-border": theme.cardBorder,
  "--pf-shadow": theme.shadow,
});

// The built-in demo portfolio shown at /p/maya-chen ("Explore a portfolio").
const demoPortfolio = {
  name: "Maya Chen",
  role: "Independent designer & developer",
  intro:
    "I create thoughtful digital products that feel simple, useful, and a little bit unexpected.",
  location: "Based in Copenhagen",
  email: "hello@mayachen.design",
  slug: "maya-chen",
  published: true,
  studioDark: false,
  portfolioTheme: "midnight",
  projects: demoProjects,
};

const signedOut = { status: "out", user: null, data: null };

// Session and portfolio data live on the server; edits are saved through the API.
function useAccount() {
  const [account, setAccount] = useState({ status: "loading", user: null, data: null });
  const [saveError, setSaveError] = useState("");
  const confirmed = useRef(null);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    // Remove the flag left by the old browser-only prototype login.
    localStorage.removeItem("livefolio-auth");
    api("/api/auth/session")
      .then(({ user, data }) => {
        confirmed.current = data ?? null;
        setAccount(user ? { status: "in", user, data } : signedOut);
      })
      .catch(() => setAccount(signedOut));
  }, []);

  const signIn = ({ user, data }) => {
    confirmed.current = data;
    setSaveError("");
    setAccount({ status: "in", user, data });
  };

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
    confirmed.current = null;
    setSaveError("");
    setAccount(signedOut);
  };

  // Swaps in refreshed snapshot images from the server without saving anything.
  const mergeImages = (images) => {
    if (!images) return;
    const apply = (data) => {
      if (!data) return data;
      let changed = false;
      const projects = data.projects.map((project) => {
        const next = images[project.id];
        if (next === undefined || next === project.image || (project.imageSource || "snapshot") !== "snapshot") return project;
        changed = true;
        return { ...project, image: next };
      });
      return changed ? { ...data, projects } : data;
    };
    confirmed.current = apply(confirmed.current);
    setAccount((current) => (current.status === "in" ? { ...current, data: apply(current.data) } : current));
  };

  // Resolves to an error message, or "" once the server has saved the change.
  const setData = (next) => {
    setAccount((current) => ({ ...current, data: next }));
    setSaveError("");
    const request = queue.current.then(() => api("/api/portfolio", { method: "PUT", body: { data: next } }));
    queue.current = request.catch(() => {});
    return request.then(
      ({ data }) => {
        confirmed.current = data;
        // The server keeps a newer background snapshot if this save carried an older one.
        mergeImages(Object.fromEntries(data.projects.map((project) => [project.id, project.image])));
        return "";
      },
      (error) => {
        if (error.status === 401) {
          confirmed.current = null;
          setAccount(signedOut);
        } else {
          setAccount((current) => (current.status === "in" ? { ...current, data: confirmed.current } : current));
        }
        setSaveError(error.message);
        return error.message;
      },
    );
  };

  return { ...account, setData, mergeImages, saveError, clearSaveError: () => setSaveError(""), signIn, signOut };
}

// Asks the server to refresh website snapshots whenever the owner opens the studio or
// their page (or comes back to the tab), then polls until the new images are ready.
// The server limits how often each project is actually re-captured.
function useSnapshotRefresh(authenticated, screen, mergeImages) {
  const [refreshing, setRefreshing] = useState([]);

  useEffect(() => {
    if (!authenticated) {
      setRefreshing([]);
      return undefined;
    }
    let cancelled = false;
    let timer;
    const poll = async (method, startedAt) => {
      try {
        const status = await api("/api/portfolio/snapshots", method === "POST" ? { method, body: {} } : {});
        if (cancelled) return;
        mergeImages(status.images);
        setRefreshing(status.refreshing);
        if (status.refreshing.length && Date.now() - startedAt < 5 * 60 * 1000) {
          timer = window.setTimeout(() => poll("GET", startedAt), 3000);
        }
      } catch {
        if (!cancelled) setRefreshing([]);
      }
    };
    const start = () => {
      window.clearTimeout(timer);
      poll("POST", Date.now());
    };
    const onVisible = () => document.visibilityState === "visible" && start();
    start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authenticated, screen]);

  return refreshing;
}

function App() {
  const account = useAccount();
  const { status, data } = account;
  const authenticated = status === "in";
  const [screen, setScreen] = useState(getScreenFromPath);
  const [slug, setSlug] = useState(getSlugFromPath);
  const [authMode, setAuthMode] = useState("signup");
  const [authOpen, setAuthOpen] = useState(false);
  const refreshingSnapshots = useSnapshotRefresh(authenticated, screen, account.mergeImages);

  const openAuth = (mode) => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  const completeAuth = async (mode, form) => {
    const result = mode === "signup"
      ? await api("/api/auth/signup", { method: "POST", body: { name: form.name, email: form.email, password: form.password } })
      : await api("/api/auth/login", { method: "POST", body: { email: form.email, password: form.password } });
    account.signIn(result);
    setAuthOpen(false);
    window.history.pushState({}, "", "/studio");
    setScreen("dashboard");
  };

  const navigate = (next, portfolioSlug = data?.slug) => {
    setScreen(next);
    if (next === "portfolio") {
      setSlug(portfolioSlug);
      window.history.pushState({}, "", `/p/${portfolioSlug}`);
    } else if (next === "dashboard") {
      window.history.pushState({}, "", "/studio");
    } else {
      window.history.pushState({}, "", "/");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const onPopState = () => {
      setScreen(getScreenFromPath());
      setSlug(getSlugFromPath());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // The studio requires a session; send signed-out visitors to the login form.
  useEffect(() => {
    if (status === "out" && screen === "dashboard") {
      window.history.replaceState({}, "", "/");
      setScreen("landing");
      openAuth("login");
    }
  }, [status, screen]);

  if (screen === "portfolio") {
    return (
      <PortfolioPage
        slug={slug}
        ownData={authenticated ? data : null}
        onBack={() => navigate(authenticated ? "dashboard" : "landing")}
      />
    );
  }

  if (screen === "dashboard") {
    if (!authenticated) return <main className="app-loading" aria-busy="true">Loading your studio…</main>;
    return (
      <Dashboard
        data={data}
        setData={account.setData}
        saveError={account.saveError}
        refreshingSnapshots={refreshingSnapshots}
        onDismissError={account.clearSaveError}
        onPreview={() => navigate("portfolio")}
        onLogout={async () => {
          await account.signOut();
          navigate("landing");
        }}
      />
    );
  }

  return (
    <>
      <Landing
        onAuth={openAuth}
        onExplore={() => navigate("portfolio", demoPortfolio.slug)}
        authenticated={authenticated}
        onDashboard={() => navigate("dashboard")}
      />
      {authOpen && (
        <AuthModal
          mode={authMode}
          setMode={setAuthMode}
          onClose={() => setAuthOpen(false)}
          onComplete={completeAuth}
        />
      )}
    </>
  );
}

function Logo({ light = false }) {
  return (
    <div className={`logo ${light ? "logo-light" : ""}`}>
      <span className="logo-mark"><span /></span>
      livefolio
    </div>
  );
}

const APP_VERSION = __APP_VERSION__;
const APP_BUILD_TIME = __APP_BUILD_TIME__;

function AppVersion({ className = "" }) {
  return (
    <span className={`app-version ${className}`} title={`Built ${new Date(APP_BUILD_TIME).toLocaleString()}`}>
      v{APP_VERSION}
    </span>
  );
}

function Landing({ onAuth, onExplore, authenticated, onDashboard }) {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <Logo />
        <div className="nav-actions">
          <button className="text-button" onClick={onExplore}>Explore a portfolio</button>
          {authenticated ? (
            <button className="dark-button small" onClick={onDashboard}>Open studio <ArrowRight size={16} /></button>
          ) : (
            <>
              <button className="text-button" onClick={() => onAuth("login")}>Log in</button>
              <button className="dark-button small" onClick={() => onAuth("signup")}>Build your folio <ArrowRight size={16} /></button>
            </>
          )}
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={14} /> The portfolio that stays alive</div>
          <h1>Your work is alive.<br /><em>Your portfolio</em><br />should be too.</h1>
          <p>Build a living home for your projects. Add a link, and Livefolio turns it into a beautiful, always-current showcase.</p>
          <div className="hero-buttons">
            <button className="accent-button" onClick={() => authenticated ? onDashboard() : onAuth("signup")}>
              Start building — it’s free <ArrowUpRight size={19} />
            </button>
            <span>No templates. No code. Just you.</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="floating-pill pill-one">3 projects live <span /></div>
          <div className="floating-pill pill-two"><Palette size={15} /> Make it yours</div>
          <div className="browser-card">
            <div className="browser-bar">
              <div><i /><i /><i /></div>
              <span>livefol.io/maya-chen</span>
            </div>
            <div className="browser-content">
              <div className="mini-system-head">
                <strong>Maya’s projects</strong>
                <i />
                <span>Independent designer <b>•</b> 3 live projects</span>
              </div>
              <div className="mini-system-grid">
                {demoProjects.filter((project) => project.status !== "inactive").map((project) => (
                  <div className="mini-system-card" key={project.id}>
                    <div>
                      <img src={project.image} alt="" />
                      <Globe2 size={11} />
                      {project.status === "deprecated" && <span>Deprecated</span>}
                    </div>
                    <b>{project.title}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="marquee">
        <div>
          <span>ADD A LINK</span><b>✦</b><span>WE CAPTURE IT</span><b>✦</b>
          <span>YOU MAKE IT YOURS</span><b>✦</b><span>SHARE IT EVERYWHERE</span><b>✦</b>
          <span>ADD A LINK</span><b>✦</b><span>WE CAPTURE IT</span><b>✦</b>
        </div>
      </section>

      <section className="features">
        <div className="section-heading">
          <span>01 / HOW IT WORKS</span>
          <h2>Less building.<br />More <em>showing off.</em></h2>
        </div>
        <div className="feature-grid">
          <article><span className="step">01</span><div className="feature-icon"><ExternalLink /></div><h3>Drop in your link</h3><p>Paste any live project URL. That’s genuinely all we need.</p></article>
          <article><span className="step">02</span><div className="feature-icon coral"><LayoutGrid /></div><h3>We make it shine</h3><p>A fresh snapshot becomes a polished project card automatically.</p></article>
          <article><span className="step">03</span><div className="feature-icon violet"><Palette /></div><h3>Make it feel like you</h3><p>Write your intro, choose what to show, and shape a space that’s unmistakably yours.</p></article>
        </div>
      </section>

      <section className="closing-cta">
        <div>
          <span>YOUR WORK DESERVES A HOME</span>
          <h2>Make something<br /><em>worth sharing.</em></h2>
        </div>
        <button className="accent-button" onClick={() => authenticated ? onDashboard() : onAuth("signup")}>Build your Livefolio <ArrowUpRight size={20} /></button>
      </section>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} Livefolio</span>
        <AppVersion />
      </footer>
    </main>
  );
}

function AuthModal({ mode, setMode, onClose, onComplete }) {
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await onComplete(mode, form);
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  };
  const switchMode = () => {
    setError("");
    setMode(mode === "signup" ? "login" : "signup");
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="auth-modal">
        <button className="close-button" onClick={onClose}><X /></button>
        <Logo />
        <div className="auth-heading">
          <span>{mode === "signup" ? "WELCOME, CREATIVE HUMAN" : "GOOD TO SEE YOU AGAIN"}</span>
          <h2>{mode === "signup" ? <>Let’s build your<br /><em>living portfolio.</em></> : <>Back to your<br /><em>best work.</em></>}</h2>
        </div>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <label>Your name<input required maxLength={80} autoComplete="name" placeholder="Maya Chen" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          )}
          <label>Email address<input required type="email" maxLength={254} autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Password<div className="password-field"><input required minLength={mode === "signup" ? 8 : undefined} maxLength={200} autoComplete={mode === "signup" ? "new-password" : "current-password"} type={showPassword ? "text" : "password"} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="accent-button full" type="submit" disabled={pending}>{pending ? (mode === "signup" ? "Creating your account…" : "Logging in…") : mode === "signup" ? "Create my Livefolio" : "Log in"} {!pending && <ArrowRight size={18} />}</button>
        </form>
        <p className="auth-switch">{mode === "signup" ? "Already have a folio?" : "New around here?"} <button type="button" onClick={switchMode}>{mode === "signup" ? "Log in" : "Create an account"}</button></p>
      </div>
    </div>
  );
}

function Dashboard({ data, setData, saveError, refreshingSnapshots = [], onDismissError, onPreview, onLogout }) {
  const [tab, setTab] = useState("projects");
  const [editingId, setEditingId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const activeCount = data.projects.filter((project) => project.status === "active").length;

  const saveProject = (project) => {
    if (editingId === "new") {
      setData({ ...data, projects: [project, ...data.projects] });
    } else {
      setData({ ...data, projects: data.projects.map((item) => item.id === project.id ? project : item) });
    }
    setEditingId(null);
  };

  const copyLink = () => {
    const link = `${window.location.origin}/p/${data.slug}`;
    navigator.clipboard?.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main className={`dashboard ${data.studioDark ? "studio-dark" : ""}`}>
      <aside className={mobileNav ? "sidebar open" : "sidebar"}>
        <div className="sidebar-top"><Logo /><button className="mobile-close" onClick={() => setMobileNav(false)}><X /></button></div>
        <nav>
          <button className={tab === "projects" ? "active" : ""} onClick={() => { setTab("projects"); setMobileNav(false); }}><LayoutGrid /> Projects</button>
          <button className={tab === "profile" ? "active" : ""} onClick={() => { setTab("profile"); setMobileNav(false); }}><UserRound /> Profile</button>
        </nav>
        <div className="sidebar-footer">
          <button onClick={onPreview}><Globe2 /> View live folio <ArrowUpRight size={16} /></button>
          <div className="user-chip">
            <span>{getInitials(data.name)}</span>
            <div><b>{data.name}</b><small>Free plan</small></div>
            <button className="user-logout" onClick={onLogout} aria-label="Log out" title="Log out"><LogOut size={17} /></button>
          </div>
          <AppVersion className="sidebar-version" />
        </div>
      </aside>

      <section className="dashboard-main">
        <header>
          <button className="menu-button" onClick={() => setMobileNav(true)}><Menu /></button>
          <div className="share-link"><Globe2 size={16} /><span>livefol.io/p/{data.slug}</span><span className={`status ${data.published ? "active" : "inactive"}`}>{data.published ? "Published" : "Draft"}</span><button onClick={copyLink}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</button></div>
          <button className="preview-button icon-only" onClick={() => setData({ ...data, studioDark: !data.studioDark })} aria-label={data.studioDark ? "Switch to light studio" : "Switch to dark studio"} title={data.studioDark ? "Light studio" : "Dark studio"}>{data.studioDark ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button className="preview-button" onClick={onPreview}><Eye size={17} /> Preview</button>
        </header>

        <div className="dashboard-content">
          {saveError && (
            <div className="save-error" role="alert">
              <span>Couldn’t save your change: {saveError}</span>
              <button type="button" aria-label="Dismiss" onClick={onDismissError}><X size={16} /></button>
            </div>
          )}
          {tab === "projects" && (
            <>
              <div className="dashboard-title">
                <div><span>YOUR WORK</span><h1>Projects <em>{data.projects.length}</em></h1><p>{activeCount} live projects on your public folio.</p></div>
                <button className="accent-button" onClick={() => setEditingId("new")} disabled={editingId === "new"}><Plus size={17} /> Add project</button>
              </div>
              <PublicPageCard data={data} setData={setData} onPreview={onPreview} />
              <div className="project-list">
                {editingId === "new" && (
                  <ProjectEditor key="new-project" project={null} onClose={() => setEditingId(null)} onSave={saveProject} />
                )}
                {data.projects.map((project) => editingId === project.id ? (
                  <ProjectEditor key={project.id} project={project} onClose={() => setEditingId(null)} onSave={saveProject} />
                ) : (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    refreshing={refreshingSnapshots.includes(project.id)}
                    onEdit={() => setEditingId(project.id)}
                    onDelete={() => setData({ ...data, projects: data.projects.filter((item) => item.id !== project.id) })}
                  />
                ))}
              </div>
            </>
          )}
          {tab === "profile" && <ProfileEditor data={data} setData={setData} />}
        </div>
      </section>
    </main>
  );
}

// Snapshots from the old third-party service were never checked and can show a bot-check
// page, so they're never displayed; the server re-captures them in the background.
const isLegacySnapshot = (image) => /^https:\/\/image\.thum\.io\//.test(image || "");

function ProjectImage({ project, alt = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [project.image]);
  if (!project.image || failed || isLegacySnapshot(project.image)) {
    return <span className="project-placeholder"><Globe2 size={18} /><b>{hostnameOf(project.url)}</b></span>;
  }
  return <img src={project.image} alt={alt} onError={() => setFailed(true)} />;
}

function ProjectRow({ project, refreshing, onEdit, onDelete }) {
  const [menu, setMenu] = useState(false);
  return (
    <article className="project-row">
      <div className="project-thumb">
        <ProjectImage project={project} />
        {refreshing && <span className="thumb-refreshing" title="Refreshing snapshot"><LoaderCircle size={11} className="spin" /> Updating</span>}
      </div>
      <div className="project-details">
        <div className="project-line"><h3>{project.title}</h3><span className={`status ${project.status}`}>{project.status}</span></div>
        <a href={project.url} target="_blank" rel="noreferrer">{project.url.replace(/^https?:\/\//, "")} <ArrowUpRight size={13} /></a>
        <p>{project.description}</p>
      </div>
      <div className="row-actions">
        <button onClick={onEdit}><Pencil size={14} /> Edit</button>
        <div className="more-wrap">
          <button className="icon-button" onClick={() => setMenu(!menu)} aria-label="More actions"><MoreHorizontal size={16} /></button>
          {menu && <div className="more-menu"><button onClick={onDelete}><Trash2 size={15} /> Delete project</button></div>}
        </div>
      </div>
    </article>
  );
}

const inferImageSource = (project) =>
  project.imageSource || (!project.image || project.image.startsWith("https://image.thum.io/") ? "snapshot" : "url");

const SNAPSHOT_PROBLEMS = {
  blocked: { icon: ShieldAlert, label: "Bot check detected" },
  blank: { icon: ShieldAlert, label: "Snapshot was blank" },
  error: { icon: CircleAlert, label: "Site unavailable" },
  invalid: { icon: CircleAlert, label: "Can’t capture this address" },
  failed: { icon: CircleAlert, label: "Snapshot failed" },
};

function ProjectEditor({ project, onClose, onSave }) {
  const [form, setForm] = useState(() => project ? {
    ...project,
    // Drop an unchecked legacy snapshot so a fresh, checked one is captured right away.
    image: isLegacySnapshot(project.image) ? "" : project.image,
    imageSource: inferImageSource(project),
  } : {
    id: Date.now(),
    title: "",
    url: "",
    description: "",
    status: "active",
    year: new Date().getFullYear().toString(),
    tags: ["Design", "Development"],
    image: "",
    imageSource: "snapshot",
  });
  // `url` is the address the current snapshot (or snapshot attempt) belongs to.
  const [shot, setShot] = useState(() => ({
    state: "idle",
    message: "",
    url: project?.image && !isLegacySnapshot(project.image) && inferImageSource(project) === "snapshot" ? normalizeUrl(project.url) : "",
  }));
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const editorRef = useRef(null);
  const fileRef = useRef(null);
  const latestShot = useRef(0);
  const normalizedUrl = normalizeUrl(form.url);
  const canCapture = isHttpUrl(normalizedUrl);

  useEffect(() => {
    const editor = editorRef.current;
    editor?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    editor?.querySelector("input")?.focus({ preventScroll: true });
  }, []);

  const capture = async (target) => {
    const request = ++latestShot.current;
    setShot({ state: "loading", message: "", url: target });
    setImageError("");
    try {
      const result = await api("/api/snapshots", { method: "POST", body: { url: target } });
      if (request !== latestShot.current) return;
      const ok = result.status === "ok";
      setForm((current) => current.imageSource === "snapshot" ? { ...current, image: ok ? result.image : "" } : current);
      setShot({ state: ok ? "ok" : result.status, message: result.message || "", url: target });
    } catch (error) {
      if (request !== latestShot.current) return;
      setShot({ state: "failed", message: error.message, url: target });
    }
  };

  // Capture a fresh snapshot shortly after the URL stops changing.
  useEffect(() => {
    if (form.imageSource !== "snapshot" || !canCapture || normalizedUrl === shot.url) return undefined;
    const timer = window.setTimeout(() => capture(normalizedUrl), 900);
    return () => window.clearTimeout(timer);
  }, [normalizedUrl, form.imageSource]);

  const switchToSnapshot = () => {
    setForm((current) => ({ ...current, image: "", imageSource: "snapshot" }));
    if (canCapture) capture(normalizedUrl);
    else setShot({ state: "idle", message: "", url: "" });
  };

  const upload = async (file) => {
    if (!file) return;
    setImageError("");
    if (!UPLOAD_TYPES.includes(file.type)) {
      setImageError("Choose a PNG, JPEG, WebP, or GIF image.");
      return;
    }
    setUploading(true);
    try {
      const body = await prepareUpload(file);
      if (body.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`Images must be under ${MAX_UPLOAD_MB} MB.`);
      const { image } = await api("/api/images", { method: "POST", body });
      latestShot.current += 1;
      setShot((current) => ({ ...current, state: "idle", message: "" }));
      setForm((current) => ({ ...current, image, imageSource: "upload" }));
    } catch (error) {
      setImageError(error.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const setImageUrl = (value) => {
    if (!value) return switchToSnapshot();
    latestShot.current += 1;
    setShot((current) => ({ ...current, state: "idle", message: "" }));
    setForm({ ...form, image: value, imageSource: "url" });
  };

  const busy = uploading || shot.state === "loading";
  const problem = form.imageSource === "snapshot" && !form.image ? SNAPSHOT_PROBLEMS[shot.state] : null;
  const ProblemIcon = problem?.icon;
  const badge = { upload: "Your image", url: "Image URL", snapshot: "Snapshot ready" }[form.imageSource];

  const submit = (event) => {
    event.preventDefault();
    if (busy) return;
    onSave({ ...form, url: normalizedUrl });
  };

  return (
    <article className="project-editor" ref={editorRef} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <form onSubmit={submit}>
        <div className="editor-header">
          <span>{project ? "Edit project" : "New project"}</span>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cancel editing" title="Cancel"><X size={15} /></button>
        </div>
        <div className="editor-body">
          <div className="image-column">
            <div className={`capture-preview ${problem ? "has-problem" : ""}`} aria-live="polite">
              {form.image && <img key={form.image} src={form.image} alt="Project image preview" className={busy ? "dimmed" : ""} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
              {busy ? (
                <span className="capture-status"><LoaderCircle size={14} className="spin" /> {uploading ? "Uploading…" : "Capturing snapshot…"}</span>
              ) : form.image ? (
                <span className="capture-badge"><Check size={12} /> {badge}</span>
              ) : problem ? (
                <small className="capture-problem"><ProblemIcon size={18} />{problem.label}</small>
              ) : (
                <small>Add a URL and we’ll capture a snapshot automatically.</small>
              )}
            </div>
            <div className="image-actions">
              <button type="button" className="icon-button" onClick={() => fileRef.current?.click()} disabled={uploading}><ImagePlus size={14} /> {form.imageSource === "upload" ? "Replace image" : "Upload image"}</button>
              {form.imageSource === "snapshot" ? (
                <button type="button" className="icon-button" onClick={() => capture(normalizedUrl)} disabled={!canCapture || busy} title="Capture a fresh snapshot"><RefreshCw size={14} /> Retake</button>
              ) : (
                <button type="button" className="icon-button" onClick={switchToSnapshot} disabled={busy}><RefreshCw size={14} /> Use snapshot</button>
              )}
              <input ref={fileRef} type="file" accept={UPLOAD_TYPES.join(",")} hidden onChange={(e) => upload(e.target.files?.[0])} />
            </div>
            {(problem || imageError) && <p className="image-note" role="alert">{imageError || shot.message}</p>}
          </div>
          <div className="editor-fields">
            <label className="span-2">Project URL<div className="url-input"><Globe2 size={15} /><input required maxLength={2048} pattern="https?://.*|[^\s]+\.[^\s]+.*" title="Enter a valid web address, such as example.com" placeholder="yourproject.com" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div></label>
            <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="deprecated">Deprecated</option></select></label>
            <label>Project name<input required maxLength={80} placeholder="A wonderful thing" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="span-2">Or use an image URL <span className="optional">(optional)</span><input maxLength={2048} pattern="https?://.*" title="Enter a complete image URL beginning with http:// or https://" placeholder="https://..." value={form.imageSource === "url" ? form.image : ""} onChange={(e) => setImageUrl(e.target.value)} /></label>
            <label className="span-3">Short description <span className="optional">(optional) {form.description.length}/180</span><textarea maxLength={180} placeholder="What did you make, and why does it matter?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          </div>
        </div>
        <div className="editor-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button type="submit" className="accent-button" disabled={busy}>{busy ? (uploading ? "Uploading…" : "Capturing…") : project ? "Save changes" : "Add project"} {!busy && <ArrowRight size={15} />}</button></div>
      </form>
    </article>
  );
}

function ProfileEditor({ data, setData }) {
  const [form, setForm] = useState({
    name: data.name,
    role: data.role,
    intro: data.intro,
    location: data.location,
    email: data.email,
  });
  const [saved, setSaved] = useState(false);
  const update = (field, value) => setForm({ ...form, [field]: value });
  const submit = async (event) => {
    event.preventDefault();
    if (await setData({ ...data, ...form })) return;
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="panel-page">
      <div className="dashboard-title"><div><span>MAKE IT PERSONAL</span><h1>Your profile</h1><p>The introduction people see before they explore your work.</p></div></div>
      <form className="form-card" onSubmit={submit}>
        <div className="avatar-large">{getInitials(form.name) || "?"}</div>
        <div className="field-row"><label>Your name<input required maxLength={80} value={form.name} onChange={(e) => update("name", e.target.value)} /></label><label>What you do<input required maxLength={100} value={form.role} onChange={(e) => update("role", e.target.value)} /></label></div>
        <label>Introduction<textarea required maxLength={280} value={form.intro} onChange={(e) => update("intro", e.target.value)} /></label>
        <div className="field-row"><label>Location<input required maxLength={100} value={form.location} onChange={(e) => update("location", e.target.value)} /></label><label>Contact email<input required type="email" maxLength={254} value={form.email} onChange={(e) => update("email", e.target.value)} /></label></div>
        <button className="accent-button" type="submit">{saved ? <Check size={18} /> : null}{saved ? "Saved" : "Save profile"}</button>
      </form>
    </div>
  );
}

// Everything about the published page lives on the main studio screen so it's hard to miss.
function PublicPageCard({ data, setData, onPreview }) {
  const [form, setForm] = useState({ pageTitle: data.pageTitle || "", slug: data.slug });
  const [status, setStatus] = useState("idle");
  const dirty = form.pageTitle.trim() !== (data.pageTitle || "") || form.slug !== data.slug;

  const submit = async (event) => {
    event.preventDefault();
    setStatus("saving");
    const pageTitle = form.pageTitle.trim();
    const error = await setData({ ...data, pageTitle, slug: form.slug });
    if (error) return setStatus("idle");
    setForm({ pageTitle, slug: form.slug });
    setStatus("saved");
    window.setTimeout(() => setStatus((current) => (current === "saved" ? "idle" : current)), 1600);
  };

  return (
    <section className="form-card public-page-card">
      <div className="page-theme-head">
        <div><Globe2 size={18} /><span><b>Your public page</b><small>{data.published ? "Published — anyone with the link can see it." : "Draft — only you can preview it."}</small></span></div>
        <div className="public-page-actions">
          <span className={`status ${data.published ? "active" : "inactive"}`}>{data.published ? "Published" : "Draft"}</span>
          <button type="button" role="switch" aria-checked={data.published} aria-label="Publish portfolio" title={data.published ? "Unpublish" : "Publish"} className={`toggle ${data.published ? "on" : ""}`} onClick={() => setData({ ...data, published: !data.published })}><span /></button>
          <button type="button" className="text-button" onClick={onPreview}><Eye size={15} /> Preview</button>
        </div>
      </div>
      <form className="public-page-form" onSubmit={submit}>
        <label>Page title<input maxLength={80} placeholder={defaultPageTitle(data)} value={form.pageTitle} onChange={(e) => setForm({ ...form, pageTitle: e.target.value })} /></label>
        <label>Public URL<div className="slug-field"><span>livefol.io/p/</span><input required minLength={3} maxLength={60} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Use at least 3 letters, numbers, or single hyphens" value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} /></div></label>
        <button className="accent-button" type="submit" disabled={!dirty || status === "saving"}>{status === "saved" ? <><Check size={16} /> Saved</> : status === "saving" ? "Saving…" : "Save"}</button>
      </form>
      <div className="page-theme-subhead"><Palette size={14} /> Theme</div>
      <PageThemePicker value={data.portfolioTheme} onChange={(portfolioTheme) => setData({ ...data, portfolioTheme })} />
    </section>
  );
}

function PageThemePicker({ value, onChange }) {
  const selected = pageThemes[value] ? value : "midnight";
  return (
    <div className="page-theme-grid" role="radiogroup" aria-label="Public page theme">
      {Object.entries(pageThemes).map(([key, theme]) => (
        <button
          type="button"
          key={key}
          role="radio"
          aria-checked={selected === key}
          className={`page-theme-option ${selected === key ? "selected" : ""}`}
          onClick={() => onChange(key)}
        >
          <span className="page-theme-preview" style={pageThemeStyle(theme)}>
            <i className="ptp-title" />
            <i className="ptp-rule" />
            <span className="ptp-cards"><i /><i /><i /></span>
          </span>
          <span className="page-theme-label">
            <span><b>{theme.name}</b><small>{theme.hint}</small></span>
            {selected === key && <Check size={14} />}
          </span>
        </button>
      ))}
    </div>
  );
}
// Owners see their own (possibly unpublished) page; everyone else gets the published copy.
function PortfolioPage({ slug, ownData, onBack }) {
  const own = ownData && ownData.slug === slug ? ownData : null;
  const builtIn = !own && slug === demoPortfolio.slug ? demoPortfolio : null;
  const [remote, setRemote] = useState({ slug: null, state: "loading", data: null });

  useEffect(() => {
    if (own || builtIn) return undefined;
    let cancelled = false;
    let timer;
    const startedAt = Date.now();
    setRemote({ slug, state: "loading", data: null });
    // Fresh snapshots may be on their way; re-fetch until they land (for a couple of minutes at most).
    const load = (initial) => api(`/api/portfolios/${encodeURIComponent(slug)}`)
      .then(({ portfolio, refreshing = [] }) => {
        if (cancelled) return;
        setRemote({ slug, state: "ready", data: portfolio });
        if (refreshing.length && Date.now() - startedAt < 2 * 60 * 1000) timer = window.setTimeout(() => load(false), 4000);
      })
      .catch((error) => {
        if (!cancelled && initial) setRemote({ slug, state: error.status === 404 ? "missing" : "error", data: null });
      });
    load(true);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug, Boolean(own || builtIn)]);

  if (own || builtIn) return <Portfolio data={own || builtIn} onBack={onBack} />;

  const themeStyle = pageThemeStyle(getPageTheme());
  if (remote.slug !== slug || remote.state === "loading") {
    return <main className="portfolio unpublished-portfolio" style={themeStyle} aria-busy="true" />;
  }
  if (remote.state !== "ready") {
    return (
      <main className="portfolio unpublished-portfolio" style={themeStyle}>
        <button className="simple-back" onClick={onBack}><ArrowLeft size={15} /> Livefolio</button>
        <div>
          <span>{remote.state === "missing" ? "Not found" : "Something went wrong"}</span>
          <h1>{remote.state === "missing" ? "This portfolio doesn’t exist." : "We couldn’t load this page."}</h1>
          <p>{remote.state === "missing" ? "Check the link, or the owner may not have published it yet." : "Please refresh to try again."}</p>
        </div>
      </main>
    );
  }
  return <Portfolio data={remote.data} onBack={onBack} />;
}

function Portfolio({ data, onBack }) {
  const visibleProjects = data.projects.filter((project) => project.status !== "inactive");
  const portfolioTitle = data.pageTitle?.trim() || defaultPageTitle(data);
  const themeStyle = pageThemeStyle(getPageTheme(data.portfolioTheme));

  useEffect(() => {
    if (!data.published) return undefined;
    const previous = document.title;
    document.title = `${portfolioTitle} · Livefolio`;
    return () => {
      document.title = previous;
    };
  }, [portfolioTitle, data.published]);

  if (!data.published) {
    return (
      <main className="portfolio unpublished-portfolio" style={themeStyle}>
        <button className="simple-back" onClick={onBack}><ArrowLeft size={15} /> Back to studio</button>
        <div><span>Draft portfolio</span><h1>This page isn’t published yet.</h1><p>Turn on Publish in “Your public page” on the studio’s Projects screen when it’s ready to share.</p></div>
      </main>
    );
  }

  return (
    <main className="portfolio" style={themeStyle}>
      <header className="simple-portfolio-header">
        <button className="simple-back" onClick={onBack}><ArrowLeft size={15} /> Livefolio</button>
        {data.email && <a href={`mailto:${data.email}`}>Contact <ArrowUpRight size={15} /></a>}
      </header>

      <section className="simple-portfolio-intro">
        <h1 className={portfolioTitle.length > 26 ? "long-title" : ""}>{portfolioTitle}</h1>
        <div className="title-rule" />
        <p>{[data.role, `${visibleProjects.length} live projects`, data.location].filter(Boolean).map((part, index) => (
          <React.Fragment key={part}>{index > 0 && <> <span>•</span> </>}{part}</React.Fragment>
        ))}</p>
      </section>

      <section className="work-section">
        <div className="portfolio-grid">
          {visibleProjects.map((project) => (
            <a className="portfolio-card" href={project.url} target="_blank" rel="noreferrer" key={project.id}>
              <div className="portfolio-image">
                <ProjectImage project={project} alt={`${project.title} website preview`} />
                <span className="project-icon"><Globe2 size={17} /></span>
                {project.status === "deprecated" && <span className="deprecated-badge">Deprecated</span>}
              </div>
              <div className="portfolio-card-info">
                <h2>{project.title}</h2>
                <ArrowUpRight size={17} />
              </div>
            </a>
          ))}
        </div>
      </section>

      <footer className="simple-portfolio-footer">
        <span>© {new Date().getFullYear()} {data.name}</span>
        <button onClick={onBack}>Made with Livefolio</button>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
