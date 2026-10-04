import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
  LayoutGrid,
  LogOut,
  Menu,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Settings,
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

async function api(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
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

  // Resolves to an error message, or "" once the server has saved the change.
  const setData = (next) => {
    setAccount((current) => ({ ...current, data: next }));
    setSaveError("");
    const request = queue.current.then(() => api("/api/portfolio", { method: "PUT", body: { data: next } }));
    queue.current = request.catch(() => {});
    return request.then(
      ({ data }) => {
        confirmed.current = data;
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

  return { ...account, setData, saveError, clearSaveError: () => setSaveError(""), signIn, signOut };
}

function App() {
  const account = useAccount();
  const { status, data } = account;
  const authenticated = status === "in";
  const [screen, setScreen] = useState(getScreenFromPath);
  const [slug, setSlug] = useState(getSlugFromPath);
  const [authMode, setAuthMode] = useState("signup");
  const [authOpen, setAuthOpen] = useState(false);

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

function Dashboard({ data, setData, saveError, onDismissError, onPreview, onLogout }) {
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
          <button className={tab === "settings" ? "active" : ""} onClick={() => { setTab("settings"); setMobileNav(false); }}><Settings /> Settings</button>
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
              <PageThemePicker value={data.portfolioTheme} onChange={(portfolioTheme) => setData({ ...data, portfolioTheme })} onPreview={onPreview} />
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
                    onEdit={() => setEditingId(project.id)}
                    onDelete={() => setData({ ...data, projects: data.projects.filter((item) => item.id !== project.id) })}
                  />
                ))}
              </div>
            </>
          )}
          {tab === "profile" && <ProfileEditor data={data} setData={setData} />}
          {tab === "settings" && <SettingsPanel data={data} setData={setData} />}
        </div>
      </section>
    </main>
  );
}

function ProjectRow({ project, onEdit, onDelete }) {
  const [menu, setMenu] = useState(false);
  return (
    <article className="project-row">
      <div className="project-thumb"><img src={project.image} alt="" /></div>
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

function ProjectEditor({ project, onClose, onSave }) {
  const [form, setForm] = useState(project || {
    id: Date.now(),
    title: "",
    url: "",
    description: "",
    status: "active",
    year: new Date().getFullYear().toString(),
    tags: ["Design", "Development"],
    image: "",
  });
  const [manualImage, setManualImage] = useState(Boolean(project?.image));
  const editorRef = useRef(null);

  useEffect(() => {
    const editor = editorRef.current;
    editor?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    editor?.querySelector("input")?.focus({ preventScroll: true });
  }, []);

  const setUrl = (url) => {
    const normalized = normalizeUrl(url);
    setForm({
      ...form,
      url,
      image: manualImage
        ? form.image
        : isHttpUrl(normalized)
          ? `https://image.thum.io/get/width/1200/crop/700/noanimate/${normalized}`
          : "",
    });
  };

  const submit = (event) => {
    event.preventDefault();
    const normalizedUrl = normalizeUrl(form.url);
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
          <div className="capture-preview">
            {isHttpUrl(form.image) ? (
              <>
                <img src={form.image} alt="Website snapshot preview" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                <span><Check size={12} /> Snapshot ready</span>
              </>
            ) : (
              <small>Add a URL and we’ll capture a snapshot automatically.</small>
            )}
          </div>
          <div className="editor-fields">
            <label className="span-2">Project URL<div className="url-input"><Globe2 size={15} /><input required maxLength={2048} pattern="https?://.*|[^\s]+\.[^\s]+.*" title="Enter a valid web address, such as example.com" placeholder="yourproject.com" value={form.url} onChange={(e) => setUrl(e.target.value)} /></div></label>
            <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="deprecated">Deprecated</option></select></label>
            <label>Project name<input required maxLength={80} placeholder="A wonderful thing" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="span-2">Custom thumbnail URL <span className="optional">(optional)</span><input maxLength={2048} pattern="https?://.*" title="Enter a complete image URL beginning with http:// or https://" placeholder="https://..." value={manualImage ? form.image : ""} onChange={(e) => { setManualImage(Boolean(e.target.value)); setForm({ ...form, image: e.target.value }); }} /></label>
            <label className="span-3">Short description <span className="optional">{form.description.length}/180</span><textarea required maxLength={180} placeholder="What did you make, and why does it matter?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          </div>
        </div>
        <div className="editor-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button type="submit" className="accent-button">{project ? "Save changes" : "Add project"} <ArrowRight size={15} /></button></div>
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

function SettingsPanel({ data, setData }) {
  const [slug, setSlug] = useState(data.slug);
  const [saved, setSaved] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (await setData({ ...data, slug })) return;
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="panel-page">
      <div className="dashboard-title"><div><span>THE DETAILS</span><h1>Settings</h1><p>Manage your Livefolio address and preferences.</p></div></div>
      <form className="form-card" onSubmit={submit}>
        <label>Your public URL<div className="slug-field"><span>livefol.io/p/</span><input required minLength={3} maxLength={60} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Use at least 3 letters, numbers, or single hyphens" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} /></div></label>
        <div className="setting-row"><div><Sun /><span><b>Dark studio</b><small>Use a darker workspace while editing.</small></span></div><button type="button" aria-label="Toggle dark studio" className={`toggle ${data.studioDark ? "on" : ""}`} onClick={() => setData({ ...data, studioDark: !data.studioDark })}><span /></button></div>
        <div className="setting-row"><div><Globe2 /><span><b>Public portfolio</b><small>{data.published ? "Your page is visible to anyone with the link." : "Only you can preview this page."}</small></span></div><button type="button" aria-label="Toggle public portfolio" className={`toggle ${data.published ? "on" : ""}`} onClick={() => setData({ ...data, published: !data.published })}><span /></button></div>
        <div className="settings-actions"><span className={`status ${data.published ? "active" : "inactive"}`}>{data.published ? "Published" : "Draft"}</span><button className="accent-button" type="submit">{saved ? <Check size={18} /> : null}{saved ? "Saved" : "Save settings"}</button></div>
      </form>
    </div>
  );
}

function PageThemePicker({ value, onChange, onPreview }) {
  const selected = pageThemes[value] ? value : "midnight";
  return (
    <section className="form-card page-theme-card">
      <div className="page-theme-head">
        <div><Palette size={18} /><span><b>Public page theme</b><small>Choose the colors visitors see on your published portfolio.</small></span></div>
        <button type="button" className="text-button" onClick={onPreview}><Eye size={15} /> Preview</button>
      </div>
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
    </section>
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
    setRemote({ slug, state: "loading", data: null });
    api(`/api/portfolios/${encodeURIComponent(slug)}`)
      .then(({ portfolio }) => !cancelled && setRemote({ slug, state: "ready", data: portfolio }))
      .catch((error) => !cancelled && setRemote({ slug, state: error.status === 404 ? "missing" : "error", data: null }));
    return () => {
      cancelled = true;
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
  const portfolioTitle = `${data.name.split(" ")[0]}'s projects`;
  const themeStyle = pageThemeStyle(getPageTheme(data.portfolioTheme));

  if (!data.published) {
    return (
      <main className="portfolio unpublished-portfolio" style={themeStyle}>
        <button className="simple-back" onClick={onBack}><ArrowLeft size={15} /> Back to studio</button>
        <div><span>Draft portfolio</span><h1>This page isn’t published yet.</h1><p>Publish it from Settings when it’s ready to share.</p></div>
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
        <h1>{portfolioTitle}</h1>
        <div className="title-rule" />
        <p>{data.role} <span>•</span> {visibleProjects.length} live projects <span>•</span> {data.location}</p>
      </section>

      <section className="work-section">
        <div className="portfolio-grid">
          {visibleProjects.map((project) => (
            <a className="portfolio-card" href={project.url} target="_blank" rel="noreferrer" key={project.id}>
              <div className="portfolio-image">
                <img src={project.image} alt={`${project.title} website preview`} />
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
