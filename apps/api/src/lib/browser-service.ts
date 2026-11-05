import { existsSync } from "node:fs";
import PQueue from "p-queue";
import { type Browser, chromium, type Page } from "playwright";
import { logger } from "./logger.js";
import { MAX_URL_FETCH_SIZE, safeFetch } from "./ssrf.js";

const MAX_PAGES = Math.max(1, parseInt(process.env.BROWSER_MAX_PAGES || "3", 10));
const CRASH_WINDOW_MS = 60_000;
const MAX_CONSECUTIVE_CRASHES = 5;
const BASE_BACKOFF_MS = 1_000;
const PAGE_LOAD_TIMEOUT = 30_000;
const NETWORK_IDLE_GRACE = 5_000;
const MAX_FULL_PAGE_HEIGHT = 16384;

let browser: Browser | null = null;
let browserFailed = false;
let consecutiveCrashes = 0;
let lastCrashTime = 0;
let backoffUntil = 0;

const queue = new PQueue({ concurrency: MAX_PAGES });

export interface CaptureOptions {
  format: "jpg" | "png" | "webp";
  quality: number;
  fullPage: boolean;
  viewportWidth: number;
  viewportHeight: number;
  isMobile?: boolean;
}

export function isBrowserAvailable(): boolean {
  if (browserFailed) return false;
  try {
    const execPath = chromium.executablePath();
    return existsSync(execPath);
  } catch {
    return false;
  }
}

function recordCrash(): void {
  const now = Date.now();
  if (now - lastCrashTime > CRASH_WINDOW_MS) {
    consecutiveCrashes = 1;
  } else {
    consecutiveCrashes++;
  }
  lastCrashTime = now;
  if (consecutiveCrashes >= MAX_CONSECUTIVE_CRASHES) {
    browserFailed = true;
    logger.error(
      `Browser service permanently disabled after ${MAX_CONSECUTIVE_CRASHES} crashes in ${CRASH_WINDOW_MS / 1000}s`,
    );
    return;
  }
  const delay = BASE_BACKOFF_MS * 2 ** (consecutiveCrashes - 1);
  backoffUntil = now + delay;
}

function isBrowserLocalUrl(url: string): boolean {
  const parsed = new URL(url);
  return parsed.protocol === "data:" || parsed.protocol === "blob:" || parsed.protocol === "about:";
}

function responseHeadersForBrowser(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (
      key === "connection" ||
      key === "content-encoding" ||
      key === "content-length" ||
      key === "transfer-encoding"
    ) {
      return;
    }
    headers[key] = value;
  });
  return headers;
}

async function installNetworkGuard(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      await route.abort("blockedbyclient").catch(() => {});
      return;
    }

    if (isBrowserLocalUrl(url)) {
      await route.continue().catch(() => {});
      return;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      await route.abort("blockedbyclient").catch(() => {});
      return;
    }

    const method = route.request().method();
    if (method !== "GET" && method !== "HEAD") {
      await route.abort("blockedbyclient").catch(() => {});
      return;
    }

    try {
      const response = await safeFetch(url, {
        method,
        maxBytes: MAX_URL_FETCH_SIZE,
        headers: {
          Accept: route.request().headers().accept ?? "*/*",
        },
      });
      const body = method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer());
      await route.fulfill({
        status: response.status,
        headers: responseHeadersForBrowser(response),
        body,
      });
    } catch {
      await route.abort("failed").catch(() => {});
    }
  });
  await page.routeWebSocket("**/*", (ws) => {
    ws.close();
  });
}

async function getBrowser(): Promise<Browser> {
  if (browserFailed) {
    throw new Error("Browser service permanently disabled after repeated crashes");
  }
  if (Date.now() < backoffUntil) {
    throw new Error("Browser service temporarily unavailable (backoff)");
  }
  if (browser?.isConnected()) {
    return browser;
  }
  browser = await chromium.launch({
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
    ],
  });
  browser.on("disconnected", () => {
    browser = null;
  });
  return browser;
}

export async function capturePage(url: string, options: CaptureOptions): Promise<Buffer> {
  return queue.add(async () => {
    let b: Browser;
    try {
      b = await getBrowser();
    } catch (err) {
      recordCrash();
      throw err;
    }

    const page = await b.newPage({
      viewport: { width: options.viewportWidth, height: options.viewportHeight },
      isMobile: options.isMobile,
      serviceWorkers: "block",
    });
    await installNetworkGuard(page);

    try {
      await page.goto(url, { waitUntil: "load", timeout: PAGE_LOAD_TIMEOUT });
      await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_GRACE }).catch(() => {});

      if (options.fullPage) {
        const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
        const targetHeight = Math.min(scrollHeight, MAX_FULL_PAGE_HEIGHT);
        await page.setViewportSize({
          width: options.viewportWidth,
          height: targetHeight,
        });
      }

      const type = options.format === "jpg" ? "jpeg" : options.format;
      const screenshotOpts: Parameters<typeof page.screenshot>[0] = {
        type: type as "jpeg" | "png",
        fullPage: false,
      };
      if (options.format !== "png") {
        screenshotOpts.quality = options.quality;
      }

      return (await page.screenshot(screenshotOpts)) as Buffer;
    } catch (err) {
      if (!b.isConnected()) {
        recordCrash();
        browser = null;
      }
      throw err;
    } finally {
      await page.close().catch(() => {});
    }
  }) as Promise<Buffer>;
}

export async function captureHtml(html: string, options: CaptureOptions): Promise<Buffer> {
  return queue.add(async () => {
    let b: Browser;
    try {
      b = await getBrowser();
    } catch (err) {
      recordCrash();
      throw err;
    }

    const page = await b.newPage({
      viewport: { width: options.viewportWidth, height: options.viewportHeight },
      isMobile: options.isMobile,
      serviceWorkers: "block",
    });
    await installNetworkGuard(page);

    try {
      await page.setContent(html, { waitUntil: "load", timeout: PAGE_LOAD_TIMEOUT });
      await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_GRACE }).catch(() => {});

      if (options.fullPage) {
        const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
        const targetHeight = Math.min(scrollHeight, MAX_FULL_PAGE_HEIGHT);
        await page.setViewportSize({
          width: options.viewportWidth,
          height: targetHeight,
        });
      }

      const type = options.format === "jpg" ? "jpeg" : options.format;
      const screenshotOpts: Parameters<typeof page.screenshot>[0] = {
        type: type as "jpeg" | "png",
        fullPage: false,
      };
      if (options.format !== "png") {
        screenshotOpts.quality = options.quality;
      }

      return (await page.screenshot(screenshotOpts)) as Buffer;
    } catch (err) {
      if (!b.isConnected()) {
        recordCrash();
        browser = null;
      }
      throw err;
    } finally {
      await page.close().catch(() => {});
    }
  }) as Promise<Buffer>;
}

export async function shutdownBrowser(): Promise<void> {
  if (browser?.isConnected()) {
    await browser.close().catch(() => {});
    browser = null;
  }
}
