import { join } from "node:path";
import type { Settings } from "./config.js";
import { modelCacheDir } from "./config.js";
import { EventBus } from "./bus.js";
import { BrowserManager } from "./browser/manager.js";
import { Embedder } from "./rag/embedder.js";
import { MemoryService } from "./rag/memory.js";
import { LanceVectorStore } from "./rag/store.js";

export interface AppContext {
  settings: Settings;
  memory: MemoryService;
  bus: EventBus;
  browser: BrowserManager;
}

/** Created once at startup and shared across all requests (replaces the Python lifespan). */
export async function buildContext(settings: Settings): Promise<AppContext> {
  const bus = new EventBus();
  const embedder = await Embedder.create(settings.embeddingModel, modelCacheDir(settings));
  const store = await LanceVectorStore.create(join(settings.dataDir, "lancedb"), embedder.dim);
  return {
    settings,
    bus,
    memory: new MemoryService(store, embedder, {
      chunkSize: settings.chunkSize,
      chunkOverlap: settings.chunkOverlap,
    }),
    // No I/O here — the Chromium process starts lazily on first browser_* call
    browser: new BrowserManager(
      {
        mode: settings.browserMode,
        cdpUrl: settings.browserCdpUrl,
        headless: settings.browserHeadless,
      },
      bus,
    ),
  };
}