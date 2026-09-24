import type { Browser, BrowserContext, Page } from "playwright";
import type { EventBus } from "../bus.js";

export interface BrowserOptions {
  mode: "launch" | "connect";
  cdpUrl: string;
  headless: boolean;
}

const INSTALL_HINT =
  "Playwright browser not available. Run: npm i playwright && npx playwright install chromium";

export class BrowserManager {
  private browser?: Browser;
  private context?: BrowserContext;
  private currentPage?: Page;
  private starting?: Promise<void>;

  constructor(
    private opts: BrowserOptions,
    private bus: EventBus,
  ) {}

  /** Acquire the active page; (re)starts the companion if needed. */
  async page(): Promise<Page> {
    await this.ensureStarted();
    if (!this.currentPage || this.currentPage.isClosed()) {
      this.currentPage = await this.context!.newPage();
      this.wire(this.currentPage);
    }
    return this.currentPage;
  }

  private ensureStarted(): Promise<void> {
    if (this.browser?.isConnected() && this.context) return Promise.resolve();
    this.starting ??= this.start().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  private async start(): Promise<void> {
    let chromium: typeof import("playwright")["chromium"];
    try {
      ({ chromium } = await import("playwright"));
    } catch {
      throw new Error(INSTALL_HINT);
    }

    this.browser =
      this.opts.mode === "connect"
        ? await chromium.connectOverCDP(this.opts.cdpUrl)
        : await chromium.launch({
            headless: this.opts.headless,
            args: ["--disable-blink-features=AutomationControlled"],
            // Docker/CI: add "--no-sandbox" here
          });

    // connect mode: reuse the running Chrome's default context (your cookies).
    // launch mode: fresh isolated context.
    this.context =
      this.browser.contexts()[0] ??
      (await this.browser.newContext({ viewport: { width: 1280, height: 800 } }));

    this.bus.publish("browser_started", { mode: this.opts.mode });

    this.browser.on("disconnected", () => {
      this.browser = undefined;
      this.context = undefined;
      this.currentPage = undefined;
      this.bus.publish("browser_stopped", {});
    });
  }

  /** Mirror page activity onto the event bus → WS clients. */
  private wire(page: Page): void {
    page.on("console", (m) => this.bus.publish("page_console", { level: m.type(), text: m.text() }));
    page.on("pageerror", (e) => this.bus.publish("page_error", { message: String(e) }));
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) this.bus.publish("page_navigated", { url: f.url() });
    });
    page.on("requestfailed", (r) =>
      this.bus.publish("request_failed", { url: r.url(), error: r.failure()?.errorText }),
    );
  }

  /** launch mode: kills our Chromium. connect mode: close() only disconnects
      the CDP session — your Chrome keeps running. Both are what you want. */
  async shutdown(): Promise<void> {
    const browser = this.browser;
    this.browser = undefined;
    this.context = undefined;
    this.currentPage = undefined;
    await browser?.close().catch(() => {});
  }
}
