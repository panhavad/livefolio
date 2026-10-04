import React, { useEffect, useMemo, useState } from "react";
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

const themes = {
  citrus: {
    name: "Citrus",
    accent: "#ff5a2a",
    soft: "#ffe0d5",
    ink: "#1e1d1a",
  },
  electric: {
    name: "Electric",
    accent: "#635bff",
    soft: "#e3e1ff",
    ink: "#171627",
  },
  meadow: {
    name: "Meadow",
    accent: "#178a60",
    soft: "#d8f3e8",
    ink: "#13221b",
  },
  ocean: {
    name: "Ocean",
    accent: "#1677d2",
    soft: "#dceefe",
    ink: "#13212e",
  },
};

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
  if (path.startsWith("/studio") && localStorage.getItem("livefolio-auth") === "true") {
    return "dashboard";
  }
  return "landing";
};

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

const defaultData = {
  name: "Maya Chen",
  role: "Independent designer & developer",
  intro:
    "I create thoughtful digital products that feel simple, useful, and a little bit unexpected.",
  location: "Based in Copenhagen",
  email: "hello@mayachen.design",
  slug: "maya-chen",
  theme: "citrus",
  published: true,
  studioDark: false,
  projects: demoProjects,
};

function usePersistentState() {
  const [data, setData] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("livefolio-data"));
      return saved
        ? { ...defaultData, ...saved, projects: saved.projects || defaultData.projects }
        : defaultData;
    } catch {
      return defaultData;
    }
  });

  useEffect(() => {
    localStorage.setItem("livefolio-data", JSON.stringify(data));
  }, [data]);

  return [data, setData];
}

function App() {
  const [data, setData] = usePersistentState();
  const [screen, setScreen] = useState(getScreenFromPath);
  const [authenticated, setAuthenticated] = useState(
    () => localStorage.getItem("livefolio-auth") === "true",
  );
  const [authMode, setAuthMode] = useState("signup");
  const [authOpen, setAuthOpen] = useState(false);

  const openAuth = (mode) => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  const completeAuth = (form) => {
    if (authMode === "signup") {
      const name = form.name.trim();
      setData((current) => ({
        ...current,
        name,
        email: form.email.trim(),
        slug: slugify(name) || current.slug,
      }));
    }
    localStorage.setItem("livefolio-auth", "true");
    setAuthenticated(true);
    setAuthOpen(false);
    window.history.pushState({}, "", "/studio");
    setScreen("dashboard");
  };

  const navigate = (next) => {
    setScreen(next);
    if (next === "portfolio") {
      window.history.pushState({}, "", `/p/${data.slug}`);
    } else if (next === "dashboard") {
      window.history.pushState({}, "", "/studio");
    } else {
      window.history.pushState({}, "", "/");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const onPopState = () => setScreen(getScreenFromPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (screen === "portfolio") {
    return <Portfolio data={data} onBack={() => navigate(authenticated ? "dashboard" : "landing")} />;
  }

  if (screen === "dashboard") {
    return (
      <Dashboard
        data={data}
        setData={setData}
        onPreview={() => navigate("portfolio")}
        onLogout={() => {
          localStorage.removeItem("livefolio-auth");
          setAuthenticated(false);
          navigate("landing");
        }}
      />
    );
  }

  return (
    <>
      <Landing
        onAuth={openAuth}
        onExplore={() => navigate("portfolio")}
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
          <article><span className="step">03</span><div className="feature-icon violet"><Palette /></div><h3>Make it feel like you</h3><p>Pick a palette, write your intro, and shape a space that’s unmistakably yours.</p></article>
        </div>
      </section>

      <section className="closing-cta">
        <div>
          <span>YOUR WORK DESERVES A HOME</span>
          <h2>Make something<br /><em>worth sharing.</em></h2>
        </div>
        <button className="accent-button" onClick={() => authenticated ? onDashboard() : onAuth("signup")}>Build your Livefolio <ArrowUpRight size={20} /></button>
      </section>
    </main>
  );
}

function AuthModal({ mode, setMode, onClose, onComplete }) {
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const submit = (event) => {
    event.preventDefault();
    onComplete(form);
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
            <label>Your name<input required placeholder="Maya Chen" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          )}
          <label>Email address<input required type="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Password<div className="password-field"><input required minLength={6} type={showPassword ? "text" : "password"} placeholder="At least 6 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
          <button className="accent-button full" type="submit">{mode === "signup" ? "Create my Livefolio" : "Log in"} <ArrowRight size={18} /></button>
        </form>
        <p className="auth-switch">{mode === "signup" ? "Already have a folio?" : "New around here?"} <button onClick={() => setMode(mode === "signup" ? "login" : "signup")}>{mode === "signup" ? "Log in" : "Create an account"}</button></p>
      </div>
    </div>
  );
}

function Dashboard({ data, setData, onPreview, onLogout }) {
  const [tab, setTab] = useState("projects");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [copied, setCopied] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const activeCount = data.projects.filter((project) => project.status === "active").length;

  const openEditor = (project = null) => {
    setEditingProject(project);
    setEditorOpen(true);
  };

  const saveProject = (project) => {
    if (editingProject) {
      setData({ ...data, projects: data.projects.map((item) => item.id === project.id ? project : item) });
    } else {
      setData({ ...data, projects: [project, ...data.projects] });
    }
    setEditorOpen(false);
  };

  const copyLink = () => {
    const link = `${window.location.origin}/p/${data.slug}`;
    navigator.clipboard?.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main className={`dashboard ${data.studioDark ? "studio-dark" : ""}`} style={{ "--accent": themes[data.theme].accent, "--soft": themes[data.theme].soft }}>
      <aside className={mobileNav ? "sidebar open" : "sidebar"}>
        <div className="sidebar-top"><Logo /><button className="mobile-close" onClick={() => setMobileNav(false)}><X /></button></div>
        <nav>
          <button className={tab === "projects" ? "active" : ""} onClick={() => { setTab("projects"); setMobileNav(false); }}><LayoutGrid /> Projects</button>
          <button className={tab === "profile" ? "active" : ""} onClick={() => { setTab("profile"); setMobileNav(false); }}><UserRound /> Profile</button>
          <button className={tab === "appearance" ? "active" : ""} onClick={() => { setTab("appearance"); setMobileNav(false); }}><Palette /> Appearance</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => { setTab("settings"); setMobileNav(false); }}><Settings /> Settings</button>
        </nav>
        <div className="sidebar-footer">
          <button onClick={onPreview}><Globe2 /> View live folio <ArrowUpRight size={16} /></button>
          <div className="user-chip">
            <span>{getInitials(data.name)}</span>
            <div><b>{data.name}</b><small>Free plan</small></div>
            <button className="user-logout" onClick={onLogout} aria-label="Log out" title="Log out"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <section className="dashboard-main">
        <header>
          <button className="menu-button" onClick={() => setMobileNav(true)}><Menu /></button>
          <div className="share-link"><Globe2 size={16} /><span>livefol.io/p/{data.slug}</span><span className={`status ${data.published ? "active" : "inactive"}`}>{data.published ? "Published" : "Draft"}</span><button onClick={copyLink}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</button></div>
          <button className="preview-button" onClick={onPreview}><Eye size={17} /> Preview</button>
        </header>

        <div className="dashboard-content">
          {tab === "projects" && (
            <>
              <div className="dashboard-title">
                <div><span>YOUR WORK</span><h1>Projects <em>{data.projects.length}</em></h1><p>{activeCount} live projects on your public folio.</p></div>
                <button className="accent-button" onClick={() => openEditor()}><Plus size={19} /> Add project</button>
              </div>
              <div className="project-list">
                {data.projects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    onEdit={() => openEditor(project)}
                    onDelete={() => setData({ ...data, projects: data.projects.filter((item) => item.id !== project.id) })}
                  />
                ))}
              </div>
            </>
          )}
          {tab === "profile" && <ProfileEditor data={data} setData={setData} />}
          {tab === "appearance" && <AppearanceEditor data={data} setData={setData} onPreview={onPreview} />}
          {tab === "settings" && <SettingsPanel data={data} setData={setData} />}
        </div>
      </section>
      {editorOpen && <ProjectEditor project={editingProject} onClose={() => setEditorOpen(false)} onSave={saveProject} />}
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
        <button onClick={onEdit}><Pencil size={16} /> Edit</button>
        <div className="more-wrap">
          <button className="icon-button" onClick={() => setMenu(!menu)}><MoreHorizontal /></button>
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
    <div className="modal-backdrop editor-backdrop">
      <div className="project-editor">
        <div className="editor-header"><div><span>{project ? "EDIT PROJECT" : "NEW PROJECT"}</span><h2>{project ? "Fine-tune your work." : "Add something great."}</h2></div><button className="close-button" onClick={onClose}><X /></button></div>
        <form onSubmit={submit}>
          <label>Project URL<div className="url-input"><Globe2 size={18} /><input required maxLength={2048} pattern="https?://.*|[^\s]+\.[^\s]+.*" title="Enter a valid web address, such as example.com" placeholder="yourproject.com" value={form.url} onChange={(e) => setUrl(e.target.value)} /></div><small>We’ll automatically create a fresh snapshot from this link.</small></label>
          {isHttpUrl(form.image) && <div className="capture-preview"><img src={form.image} alt="Website snapshot preview" onError={(e) => { e.currentTarget.style.display = "none"; }} /><span><Check size={14} /> Snapshot ready</span></div>}
          <div className="field-row">
            <label>Project name<input required maxLength={80} placeholder="A wonderful thing" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="deprecated">Deprecated</option></select></label>
          </div>
          <label>Short description<textarea required maxLength={180} placeholder="What did you make, and why does it matter?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><small>{form.description.length}/180</small></label>
          <label>Custom thumbnail URL <span className="optional">(optional)</span><input maxLength={2048} pattern="https?://.*" title="Enter a complete image URL beginning with http:// or https://" placeholder="https://..." value={manualImage ? form.image : ""} onChange={(e) => { setManualImage(Boolean(e.target.value)); setForm({ ...form, image: e.target.value }); }} /></label>
          <div className="editor-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button type="submit" className="accent-button">{project ? "Save changes" : "Add to my folio"} <ArrowRight size={18} /></button></div>
        </form>
      </div>
    </div>
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
  const submit = (event) => {
    event.preventDefault();
    setData({ ...data, ...form });
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

function AppearanceEditor({ data, setData, onPreview }) {
  return (
    <div className="panel-page">
      <div className="dashboard-title"><div><span>YOUR LOOK & FEEL</span><h1>Appearance</h1><p>Choose an accent that makes your portfolio feel like you.</p></div><button className="preview-button" onClick={onPreview}><Eye size={17} /> Preview</button></div>
      <div className="theme-grid">
        {Object.entries(themes).map(([id, theme]) => (
          <button key={id} className={`theme-card ${data.theme === id ? "selected" : ""}`} onClick={() => setData({ ...data, theme: id })}>
            <div className="theme-preview" style={{ background: theme.soft }}>
              <span style={{ background: theme.ink }} />
              <i style={{ background: theme.accent }} />
              <b style={{ background: theme.ink }} />
            </div>
            <div><span className="theme-dot" style={{ background: theme.accent }} /><strong>{theme.name}</strong>{data.theme === id && <Check size={17} />}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel({ data, setData }) {
  const [slug, setSlug] = useState(data.slug);
  const [saved, setSaved] = useState(false);
  const submit = (event) => {
    event.preventDefault();
    setData({ ...data, slug });
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

function Portfolio({ data, onBack }) {
  const theme = themes[data.theme] || themes.citrus;
  const visibleProjects = data.projects.filter((project) => project.status !== "inactive");
  const portfolioTitle = `${data.name.split(" ")[0]}'s projects`;

  if (!data.published) {
    return (
      <main className="portfolio unpublished-portfolio" style={{ "--accent": theme.accent }}>
        <button className="simple-back" onClick={onBack}><ArrowLeft size={15} /> Back to studio</button>
        <div><span>Draft portfolio</span><h1>This page isn’t published yet.</h1><p>Publish it from Settings when it’s ready to share.</p></div>
      </main>
    );
  }

  return (
    <main className="portfolio" style={{ "--accent": theme.accent }}>
      <header className="simple-portfolio-header">
        <button className="simple-back" onClick={onBack}><ArrowLeft size={15} /> Livefolio</button>
        <a href={`mailto:${data.email}`}>Contact <ArrowUpRight size={15} /></a>
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
