import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { IndexeddbPersistence } from "y-indexeddb";
import {
  fromBase64,
  toBase64,
  type DeltaEvent,
  type User,
} from "../../../shared/protocol";
export type ConnectionStatus = "connecting" | "online" | "offline";
export class DocumentSession {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);
  readonly persistence: IndexeddbPersistence;
  readonly listeners = new Set<() => void>();
  readonly deltaListeners = new Set<(event: DeltaEvent) => void>();
  status: ConnectionStatus = "connecting";
  synced = false;
  pending = 0;
  lastSaved = 0;
  private socket: WebSocket | null = null;
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  private sequence = 0;
  private waiting = new Set<number>();
  private syncRequest = 0;
  constructor(
    readonly id: string,
    readonly wsBase: string,
    readonly cacheKey = "folio-v1",
  ) {
    this.persistence = new IndexeddbPersistence(`${cacheKey}:${id}`, this.doc);
    this.doc.on("update", this.onUpdate);
    this.awareness.on("update", this.onAwareness);
    this.persistence.whenSynced.then(() => {
      if (!this.stopped) this.connect();
    });
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  notify = () => this.listeners.forEach((fn) => fn());
  setUser(user: User) {
    this.awareness.setLocalStateField("user", user);
  }
  private onUpdate = (update: Uint8Array, origin: unknown) => {
    const source =
      origin === this
        ? "remote"
        : origin === this.persistence
          ? "cache"
          : "local";
    this.deltaListeners.forEach((fn) =>
      fn({ update, origin: source, at: Date.now() }),
    );
    if (source === "local") {
      this.pending++;
      const seq = ++this.sequence;
      if (this.send({ type: "update", data: toBase64(update), seq })) {
        this.waiting.add(seq);
      }
      this.notify();
    }
  };
  private onAwareness = (
    {
      added,
      updated,
      removed,
    }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin !== this)
      this.send({
        type: "awareness",
        data: toBase64(
          encodeAwarenessUpdate(this.awareness, [
            ...added,
            ...updated,
            ...removed,
          ]),
        ),
      });
    this.notify();
  };
  private send(data: object) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(data));
    return true;
  }
  private connect() {
    if (this.stopped) return;
    this.status = "connecting";
    this.notify();
    const socket = new WebSocket(
      `${this.wsBase}/collaboration/${encodeURIComponent(this.id)}`,
    );
    this.socket = socket;
    socket.onopen = () => {
      this.attempt = 0;
      this.send({
        type: "sync",
        vector: toBase64(Y.encodeStateVector(this.doc)),
      });
    };
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "sync") {
          Y.applyUpdate(this.doc, fromBase64(msg.data), this);
          this.waiting.clear();
          this.syncRequest = ++this.sequence;
          this.send({
            type: "update",
            data: toBase64(
              Y.encodeStateAsUpdate(this.doc, fromBase64(msg.vector)),
            ),
            seq: this.syncRequest,
          });
          this.send({
            type: "awareness",
            data: toBase64(
              encodeAwarenessUpdate(this.awareness, [this.doc.clientID]),
            ),
          });
        } else if (msg.type === "update")
          Y.applyUpdate(this.doc, fromBase64(msg.data), this);
        else if (msg.type === "awareness")
          applyAwarenessUpdate(this.awareness, fromBase64(msg.data), this);
        else if (msg.type === "ack") {
          if (msg.seq === this.syncRequest) {
            this.synced = true;
            this.status = "online";
            this.pending = this.waiting.size;
          } else if (this.waiting.delete(msg.seq))
            this.pending = Math.max(0, this.pending - 1);
          this.lastSaved = Date.now();
          this.notify();
        } else if (msg.type === "error") {
          console.error("Collaboration server:", msg.message);
          socket.close();
        }
      } catch (error) {
        console.error("Invalid collaboration message", error);
        socket.close();
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (this.stopped) return;
      this.status = "offline";
      removeAwarenessStates(
        this.awareness,
        [...this.awareness.getStates().keys()].filter(
          (id) => id !== this.doc.clientID,
        ),
        this,
      );
      this.notify();
      this.reconnectTimer = setTimeout(
        () => this.connect(),
        Math.min(15000, 500 * 2 ** this.attempt++),
      );
    };
  }
  /** Use this when replacing WebSocket transport with Ably, Socket.io, etc. */
  applyRemoteUpdate(update: Uint8Array) {
    Y.applyUpdate(this.doc, update, this);
  }
  getStateVector() {
    return Y.encodeStateVector(this.doc);
  }
  getDeltaSince(vector?: Uint8Array) {
    return Y.encodeStateAsUpdate(this.doc, vector);
  }
  destroy() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.awareness.setLocalState(null);
    this.socket?.close();
    this.doc.off("update", this.onUpdate);
    this.awareness.off("update", this.onAwareness);
    this.awareness.destroy();
    this.persistence.destroy();
    this.doc.destroy();
  }
}
