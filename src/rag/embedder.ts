import { env, pipeline } from "@huggingface/transformers";

/** Local ONNX embeddings, CPU-friendly, no API keys. bge-small-en-v1.5 → 384 dims. */
export class Embedder {
  dim: number;
  private constructor(private extractor: Awaited<ReturnType<typeof pipeline<"feature-extraction">>>) {
    this.dim = 0;
  }

  static async create(model: string, cacheDir: string): Promise<Embedder> {
    env.cacheDir = cacheDir; // first run downloads ~30 MB here
    const extractor = await pipeline("feature-extraction", model);
    const e = new Embedder(extractor);
    const [probe] = await e.embed(["dim probe"]);
    e.dim = probe.length;
    return e;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out = await this.extractor(texts, { pooling: "mean", normalize: true });
    return out.tolist() as number[][];
  }
}