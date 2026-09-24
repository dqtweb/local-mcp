import * as lancedb from "@lancedb/lancedb";
import { FixedSizeList, Float32, Field, Schema, Utf8 } from "apache-arrow";

export interface MemoryRecord {
  id: string;
  text: string;
  tags: string[];
  source: string;
  createdAt: string;
  score?: number;
}

/** Swap-in point: implement for Qdrant / pgvector / sqlite-vec / in-memory. */
export interface VectorStore {
  upsert(records: MemoryRecord[], embeddings: number[][]): Promise<void>;
  query(embedding: number[], topK: number): Promise<MemoryRecord[]>;
  get(id: string): Promise<MemoryRecord | null>;
  delete(id: string): Promise<boolean>;
  list(limit: number, offset?: number): Promise<MemoryRecord[]>;
  count(): Promise<number>;
  close(): Promise<void>;
}

interface Row {
  id: string;
  text: string;
  tags: string; // CSV — keeps metadata scalar, same trick as Chroma version
  source: string;
  created_at: string;
  vector: number[];
  _distance?: number;
}

const sqlEscape = (s: string) => s.replace(/'/g, "''");

export class LanceVectorStore implements VectorStore {
  private constructor(private db: lancedb.Connection, private table: lancedb.Table) {}

  static async create(path: string, vectorDim: number): Promise<LanceVectorStore> {
    const db = await lancedb.connect(path);
    let table: lancedb.Table;
    if ((await db.tableNames()).includes("memories")) {
      table = await db.openTable("memories");
    } else {
      // Empty table needs an explicit Arrow schema (vector column is fixed-size)
      const schema: Schema = new Schema([
        new Field("id", new Utf8(), false),
        new Field("text", new Utf8(), false),
        new Field("tags", new Utf8(), false),
        new Field("source", new Utf8(), false),
        new Field("created_at", new Utf8(), false),
        new Field("vector", new FixedSizeList(vectorDim, new Field("item", new Float32(), true)), false),
      ]);
      table = await db.createEmptyTable("memories", schema);
    }
    return new LanceVectorStore(db, table);
  }

  async upsert(records: MemoryRecord[], embeddings: number[][]): Promise<void> {
    const rows: Row[] = records.map((r, i) => ({
      id: r.id,
      text: r.text,
      tags: r.tags.join(","),
      source: r.source,
      created_at: r.createdAt,
      vector: embeddings[i],
    }));
    await this.table
      .mergeInsert("id")
      .whenMatchedUpdateAll()
      .whenNotMatchedInsertAll()
      .execute(rows as unknown as Record<string, unknown>[]);
  }

  async query(embedding: number[], topK: number): Promise<MemoryRecord[]> {
    const rows = (await this.table
      .vectorSearch(embedding)
      .distanceType("cosine")
      .limit(topK)
      .toArray()) as Row[];
    return rows.map((r) => this.toRecord(r, r._distance != null ? 1 - r._distance : undefined));
  }

  async get(id: string): Promise<MemoryRecord | null> {
    const rows = (await this.table
      .query()
      .where(`id = '${sqlEscape(id)}'`)
      .limit(1)
      .toArray()) as Row[];
    return rows.length ? this.toRecord(rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!(await this.get(id))) return false;
    await this.table.delete(`id = '${sqlEscape(id)}'`);
    return true;
  }

  async list(limit: number, offset = 0): Promise<MemoryRecord[]> {
    // Read a bit extra and slice — avoids relying on an offset API
    const rows = (await this.table.query().limit(limit + offset).toArray()) as Row[];
    return rows.slice(offset).map((r) => this.toRecord(r));
  }

  async count(): Promise<number> {
    return this.table.countRows();
  }

  async close(): Promise<void> {} // LanceDB persists synchronously

  private toRecord(r: Row, score?: number): MemoryRecord {
    return {
      id: r.id,
      text: r.text,
      tags: r.tags ? r.tags.split(",").filter(Boolean) : [],
      source: r.source ?? "manual",
      createdAt: r.created_at ?? "",
      score,
    };
  }
}
