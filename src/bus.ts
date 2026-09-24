import { EventEmitter } from "node:events";

export interface BusEvent {
  type: string;
  ts: string;
  [key: string]: unknown;
}

/** In-process pub/sub. WS clients mirror everything published here. */
export class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  publish(type: string, data: Record<string, unknown> = {}): void {
    this.emitter.emit("event", { type, ts: new Date().toISOString(), ...data } satisfies BusEvent);
  }

  subscribe(listener: (e: BusEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}