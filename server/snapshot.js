import { existsSync } from "node:fs";
import { isIP } from "node:net";
import path from "node:path";
import zlib from "node:zlib";
import { startEgressProxy } from "./egress-proxy.js";
import { isPrivateAddress, resolvesPublicly } from "./network.js";

const VIEWPORT = { width: 1200, height: 700 };
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);
const NAVIGATION_TIMEOUT_MS = 20000;
// How long to give a "Just a moment…" style check to clear by itself.
const CHALLENGE_WAIT_MS = 12000;
const MAX_CONCURRENT_CAPTURES = 2;
const BROWSER_IDLE_MS = 2 * 60 * 1000;

export class SnapshotError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function assertPublicUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new SnapshotError("invalid", "That doesn’t look like a valid web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SnapshotError("invalid", "Only http:// and https:// addresses can be captured.");
  }
  if (url.username || url.password) throw new SnapshotError("invalid", "Addresses with a username or password can’t be captured.");
  if (!ALLOWED_PORTS.has(url.port)) throw new SnapshotError("invalid", "Only standard web ports can be captured.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if ((isIP(host) && isPrivateAddress(host)) || /(^|\.)(localhost|local|internal)$/i.test(host)) {
    throw new SnapshotError("invalid", "Only public websites can be captured.");
  }
  if (!isIP(host) && !(await resolvesPublicly(host))) {
    throw new SnapshotError("error", "We couldn’t find that website. Check the address.");
  }
  return url;
}

const CHALLENGE_TITLES = [
  [/just a moment/i, "Cloudflare"],
  [/attention required.*cloudflare/i, "Cloudflare"],
  [/one more step/i, "Cloudflare"],
  [/please wait.*cloudflare/i, "Cloudflare"],
  [/ddos-guard/i, "DDoS-Guard"],
  [/it needs a human touch/i, "PerimeterX"],
  [/pardon our interruption/i, "Imperva"],
  [/request unsuccessful/i, "Imperva"],
  [/vercel security checkpoint/i, "Vercel"],
  [/checking (your|if the site connection) (browser|is secure)/i, null],
  [/verify(ing)? (that )?you are (a )?human/i, null],
  [/are you a (human|robot)/i, null],
  [/(human|bot|robot) (verification|check)/i, null],
  [/security (check|checkpoint|verification)/i, null],
  [/captcha/i, null],
  [/access (to this page has been )?denied/i, null],
];

const CHALLENGE_MARKERS = [
  [/window\._cf_chl_opt|cf-chl-widget|cf_chl_rc_|cdn-cgi\/challenge-platform\/h\/[bg]\/orchestrate/i, "Cloudflare"],
  [/captcha-delivery\.com|geo\.captcha-delivery/i, "DataDome"],
  [/id=["']px-captcha|_pxCaptcha|pxCaptchaSrc/i, "PerimeterX"],
  [/_Incapsula_Resource|Incapsula incident ID/i, "Imperva"],
  [/sgcaptcha/i, "SiteGround"],
  [/awsWafCookieDomainList|AwsWafIntegration\.checkForceRefresh|gokuProps/i, "AWS WAF"],
  [/ddos-guard\.net\/(js|check)/i, "DDoS-Guard"],
];

// Visible text that only makes sense on an interstitial; checked only on short pages
// so articles that merely mention these phrases aren't flagged.
const CHALLENGE_TEXT = /verify (that )?you are (a )?human|confirm you are (a )?human|press (&|and) hold|i'?m not a robot|are you a robot|checking (your browser|if the site connection is secure)|enable javascript and cookies to continue|complete the security check|unusual (traffic|activity) from your (computer|network)|performing security verification/i;

const pageTitle = (html) => {
  const match = /<title[^>]*>([^<]{0,200})/i.exec(html);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
};

// Returns the bot-protection vendor (or "bot check") when the page is a challenge.
export function detectBotCheck({ status = 200, headers = {}, html = "", title, text = "" }) {
  const header = (name) => String(headers[name] ?? "");
  if (/challenge|captcha/i.test(header("cf-mitigated"))) return "Cloudflare";
  if (header("x-px-blocked")) return "PerimeterX";
  if (header("x-datadome") && status >= 400) return "DataDome";
  if (/captcha|challenge/i.test(header("x-amzn-waf-action"))) return "AWS WAF";
  if (/^sg-captcha/i.test(header("sg-captcha"))) return "SiteGround";

  const source = html.slice(0, 400_000);
  title ??= pageTitle(source);
  for (const [pattern, vendor] of CHALLENGE_MARKERS) if (pattern.test(source)) return vendor;
  const shortPage = text.trim().length < 1500;
  // Short challenge titles also match ordinary pages ("Captcha library docs"), so require
  // an error status or a page with very little content before trusting them.
  if (status >= 400 || shortPage) {
    for (const [pattern, vendor] of CHALLENGE_TITLES) if (pattern.test(title)) return vendor || "bot check";
  }
  if (shortPage && CHALLENGE_TEXT.test(text)) return "bot check";
  return null;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Decodes a non-interlaced 8-bit PNG into grayscale; returns null for formats it skips.
function decodePngLuma(buffer) {
  if (buffer.length < 33 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette = null;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") palette = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (bitDepth !== 8 || interlace !== 0 || !channels || !width || !height || width * height > 20_000_000) return null;
  if (colorType === 3 && !palette) return null;

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return null;
  const luma = new Uint8Array(width * height);
  let prev = new Uint8Array(stride);
  let row = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const base = y * (stride + 1);
    const filter = raw[base];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[base + 1 + x];
      const left = x >= channels ? row[x - channels] : 0;
      const up = prev[x];
      const upLeft = x >= channels ? prev[x - channels] : 0;
      row[x] = (filter === 0 ? value
        : filter === 1 ? value + left
          : filter === 2 ? value + up
            : filter === 3 ? value + ((left + up) >> 1)
              : value + paethPredictor(left, up, upLeft)) & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const i = x * channels;
      let r, g, b;
      if (colorType === 3) [r, g, b] = [palette[row[i] * 3], palette[row[i] * 3 + 1], palette[row[i] * 3 + 2]];
      else if (channels <= 2) r = g = b = row[i];
      else [r, g, b] = [row[i], row[i + 1], row[i + 2]];
      luma[y * width + x] = (r * 299 + g * 587 + b * 114) / 1000;
    }
    [prev, row] = [row, prev];
  }
  return { width, height, luma };
}

// Share of pixels that sit on a visible edge. Real pages have text and imagery;
// interstitials that render nothing for automated browsers are almost empty.
export function imageDetail(buffer) {
  const image = decodePngLuma(buffer);
  if (!image) return null;
  const { width, height, luma } = image;
  let edges = 0;
  let samples = 0;
  for (let y = 0; y < height - 1; y += 2) {
    for (let x = 0; x < width - 1; x += 2) {
      const i = y * width + x;
      samples += 1;
      if (Math.abs(luma[i] - luma[i + 1]) > 24 || Math.abs(luma[i] - luma[i + width]) > 24) edges += 1;
    }
  }
  return samples ? edges / samples : null;
}

export const BLANK_DETAIL_THRESHOLD = 0.002;

export function detectImageType(buffer) {
  if (buffer.length > 8 && buffer.readUInt32BE(0) === 0x89504e47) return "png";
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.length > 12 && buffer.toString("latin1", 0, 4) === "RIFF" && buffer.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (buffer.length > 6 && /^GIF8[79]a$/.test(buffer.toString("latin1", 0, 6))) return "gif";
  return null;
}

function findBrowser() {
  const fromEnv = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null;
  const programFiles = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
  const candidates = process.platform === "win32"
    ? programFiles.flatMap((dir) => [
      path.join(dir, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(dir, "Chromium", "Application", "chrome.exe"),
      path.join(dir, "Microsoft", "Edge", "Application", "msedge.exe"),
    ])
    : process.platform === "darwin"
      ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      ]
      : ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/microsoft-edge"];
  return candidates.find((file) => existsSync(file)) || null;
}

let browserPromise = null;
let proxyPromise = null;
let idleTimer = null;
let activeCaptures = 0;
const waiting = [];

async function launchBrowser() {
  const executablePath = findBrowser();
  if (!executablePath) {
    throw new SnapshotError("failed", "Snapshots aren’t available on this server because Chrome or Chromium isn’t installed. Upload your own image instead.");
  }
  proxyPromise ??= startEgressProxy();
  const { port } = await proxyPromise;
  const { default: puppeteer } = await import("puppeteer-core");
  const args = [
    `--proxy-server=http://127.0.0.1:${port}`,
    // Send loopback traffic through the proxy too, where it gets refused.
    "--proxy-bypass-list=<-loopback>",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    "--disable-blink-features=AutomationControlled",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--mute-audio",
    "--lang=en-US",
  ];
  // Containers usually can't create the namespaces Chromium's sandbox needs.
  if (process.env.LIVEFOLIO_CHROME_NO_SANDBOX === "1") args.push("--no-sandbox");
  const browser = await puppeteer.launch({ executablePath, headless: true, args, defaultViewport: VIEWPORT });
  browser.on("disconnected", () => {
    browserPromise = null;
  });
  return browser;
}

async function getBrowser() {
  browserPromise ??= launchBrowser().catch((error) => {
    browserPromise = null;
    throw error;
  });
  const browser = await browserPromise;
  if (browser.connected) return browser;
  browserPromise = null;
  return getBrowser();
}

async function withCaptureSlot(task) {
  clearTimeout(idleTimer);
  while (activeCaptures >= MAX_CONCURRENT_CAPTURES) await new Promise((resolve) => waiting.push(resolve));
  activeCaptures += 1;
  try {
    return await task();
  } finally {
    activeCaptures -= 1;
    waiting.shift()?.();
    if (!activeCaptures) {
      // Free the browser's memory when nobody is capturing.
      idleTimer = setTimeout(async () => {
        const pending = browserPromise;
        browserPromise = null;
        (await pending?.catch(() => null))?.close().catch(() => {});
      }, BROWSER_IDLE_MS);
      idleTimer.unref?.();
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function closeSnapshotBrowser() {
  clearTimeout(idleTimer);
  const pending = browserPromise;
  browserPromise = null;
  await (await pending?.catch(() => null))?.close().catch(() => {});
  const proxy = await proxyPromise?.catch(() => null);
  proxyPromise = null;
  proxy?.server.close();
}

async function readPage(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.evaluate(() => {
        // Challenge widgets that are actually showing (an interstitial or a modal over the
        // real page). Small ones like the reCAPTCHA badge or an inline form widget don't count.
        const signature = /captcha|turnstile|datadome|ddos-guard|bot-?check|human-?verif|cf-chl|cf-challenge|challenge-(form|platform|running|stage|body|wrapper|container)|challenges\.cloudflare/i;
        let overlay = null;
        for (const el of document.querySelectorAll("iframe, div, section, dialog, aside, form")) {
          const sig = `${el.id} ${typeof el.className === "string" ? el.className : ""} ${el.getAttribute("src") || ""} ${el.getAttribute("title") || ""} ${el.getAttribute("name") || ""}`;
          if (!signature.test(sig) && !(el.tagName === "IFRAME" && /challenge/i.test(el.getAttribute("src") || ""))) continue;
          const rect = el.getBoundingClientRect();
          const width = Math.min(rect.right, innerWidth) - Math.max(rect.left, 0);
          const height = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
          if (width < 150 || height < 100 || width * height < 40000) continue;
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.1) continue;
          overlay = sig.trim().slice(0, 200);
          break;
        }
        return {
          title: document.title || "",
          html: (document.documentElement?.outerHTML || "").slice(0, 400000),
          text: (document.body?.innerText || "").slice(0, 20000),
          overlay,
        };
      });
    } catch {
      // The page navigated mid-read (common while a challenge redirects); try again.
      await sleep(500);
    }
  }
  return { title: "", html: "", text: "", overlay: null };
}

const OVERLAY_VENDORS = [
  [/px-captcha|perimeterx|px-cloud/i, "PerimeterX"],
  [/turnstile|challenges\.cloudflare|cf-chl/i, "Cloudflare"],
  [/datadome|captcha-delivery/i, "DataDome"],
  [/hcaptcha/i, "hCaptcha"],
  [/recaptcha/i, "reCAPTCHA"],
];

function detectPage(content, documentResponse) {
  if (content.overlay) {
    return OVERLAY_VENDORS.find(([pattern]) => pattern.test(content.overlay))?.[1] || "bot check";
  }
  return detectBotCheck({
    status: documentResponse?.status() ?? 200,
    headers: documentResponse?.headers() ?? {},
    ...content,
  });
}

const blockedMessage = (vendor) =>
  `This site shows ${vendor === "bot check" ? "a bot check" : `a ${vendor} bot check`} to automated visitors, so we skipped the snapshot to avoid capturing it. Upload your own image instead.`;

async function openContext() {
  for (let attempt = 0; ; attempt += 1) {
    const browser = await getBrowser();
    try {
      return await browser.createBrowserContext({ downloadBehavior: { policy: "deny" } });
    } catch (error) {
      // The browser crashed or was closed between captures; start a fresh one once.
      if (attempt > 0 || browser.connected) throw error;
      browserPromise = null;
    }
  }
}

const networkMessage = (error) => {
  const message = String(error?.message || "");
  return /ERR_NAME_NOT_RESOLVED/.test(message) ? "We couldn’t find that website. Check the address."
    : /ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET/.test(message) ? "We couldn’t connect to that website."
      : /timeout/i.test(message) ? "The website took too long to load."
        : "We couldn’t load that website.";
};

// Loads the page in a real browser, makes sure it isn't a bot check, and only then
// takes the screenshot. The check and the screenshot come from the same render.
export async function captureSnapshot(target) {
  const url = await assertPublicUrl(target);
  return withCaptureSlot(async () => {
    let context;
    try {
      context = await openContext();
      const browser = context.browser();
      const page = await context.newPage();
      page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));
      page.on("popup", (popup) => popup?.close().catch(() => {}));
      const userAgent = (await browser.userAgent()).replace(/HeadlessChrome/g, "Chrome");
      await page.setUserAgent({ userAgent });
      await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

      let documentResponse = null;
      page.on("response", (response) => {
        const request = response.request();
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentResponse = response;
      });

      try {
        await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
      } catch (error) {
        if (!documentResponse) throw new SnapshotError("error", networkMessage(error));
      }
      await page.waitForNetworkIdle({ idleTime: 700, timeout: 8000 }).catch(() => {});

      // Some checks clear on their own after a few seconds; give them a chance.
      const deadline = Date.now() + CHALLENGE_WAIT_MS;
      let vendor;
      for (;;) {
        vendor = detectPage(await readPage(page), documentResponse);
        if (!vendor || Date.now() > deadline) break;
        await sleep(1500);
        await page.waitForNetworkIdle({ idleTime: 500, timeout: 4000 }).catch(() => {});
      }
      if (vendor) throw new SnapshotError("blocked", blockedMessage(vendor));

      if (documentResponse?.headers()["x-livefolio-refused"]) {
        throw new SnapshotError("invalid", "This address leads to a private or internal network, which can’t be captured.");
      }

      const status = documentResponse?.status() ?? 0;
      if (status === 401 || status === 403 || status === 429) {
        throw new SnapshotError("blocked", `This site blocks automated visitors (HTTP ${status}), so we skipped the snapshot. Upload your own image instead.`);
      }
      if (status >= 400) {
        throw new SnapshotError("error", `The website returned an error (HTTP ${status}), so there’s nothing worth capturing yet.`);
      }

      await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
      await sleep(400);
      const buffer = Buffer.from(await page.screenshot({ type: "png" }));
      // A challenge can pop up while the screenshot is taken; if one is showing now, discard it.
      const after = detectPage(await readPage(page), documentResponse);
      if (after) throw new SnapshotError("blocked", blockedMessage(after));
      const detail = imageDetail(buffer);
      if (detail !== null && detail < BLANK_DETAIL_THRESHOLD) {
        throw new SnapshotError("blank", "The snapshot came back blank, which usually means the site hid its content from automated visitors. Upload your own image instead.");
      }
      return { buffer, type: "png", finalUrl: page.url() };
    } catch (error) {
      if (error instanceof SnapshotError) throw error;
      throw new SnapshotError("failed", networkMessage(error));
    } finally {
      await context?.close().catch(() => {});
    }
  });
}
