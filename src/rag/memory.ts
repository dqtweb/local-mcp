import { randomUUID } from "node:crypto";
import type { Embedder } from "./embedder.js";
import type { MemoryRecord, VectorStore } from "./store.js";
import { chunkText } from "./chunker.js";

export class MemoryService {
  constructor(
    private store: VectorStore,
    private embedder: Embedder,
    private opts: { chunkSize: number; chunkOverlap: number },
  ) {}

  async remember(text: string, tags: string[] = [], source = "manual"): Promise<string> {
    const rec: MemoryRecord = {
      id: randomUUID(),
      text: text.trim(),
      tags,
      source,
      createdAt: new Date().toISOString(),
    };
    const [embedding] = await this.embedder.embed([rec.text]);
    await this.store.upsert([rec], [embedding]);
    return rec.id;
  }

  async ingest(text: string, source = "document", tags: string[] = []): Promise<number> {
    const parts = chunkText(text, this.opts.chunkSize, this.opts.chunkOverlap);
    const records: MemoryRecord[] = parts.map((p) => ({
      id: randomUUID(),
      text: p,
      tags,
      source,
      createdAt: new Date().toISOString(),
    }));
    if (records.length) {
      const embeddings = await this.embedder.embed(records.map((r) => r.text));
      await this.store.upsert(records, embeddings);
    }
    return records.length;
  }

  async recall(query: string, topK = 5, tags?: string[]): Promise<MemoryRecord[]> {
    const [embedding] = await this.embedder.embed([query]);
    const fetchK = tags?.length ? topK * 4 : topK; // over-fetch so tag post-filter keeps results
    let hits = await this.store.query(embedding, fetchK);
    if (tags?.length) {
      const wanted = new Set(tags);
      hits = hits.filter((h) => h.tags.some((t) => wanted.has(t)));
    }
    return hits.slice(0, topK);
  }

  get(id: string): Promise<MemoryRecord | null> { return this.store.get(id); }
  delete(id: string): Promise<boolean> { return this.store.delete(id); }
  list(limit = 50): Promise<MemoryRecord[]> { return this.store.list(limit); }
  count(): Promise<number> { return this.store.count(); }
}