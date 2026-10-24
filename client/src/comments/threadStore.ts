import { uuid } from "../../../shared/protocol";
import * as Y from "yjs";
import type { User } from "../../../shared/protocol";
export type Anchor = {
  start: string;
  end: string;
  kind: "range" | "point";
  quote: string;
};
export type CommentMessage = {
  id: string;
  body: string;
  author: User;
  createdAt: number;
};
export type Thread = {
  id: string;
  anchor: Anchor;
  resolved: boolean;
  createdAt: number;
  messages: CommentMessage[];
};
export class ThreadStore {
  readonly threads: Y.Map<Y.Map<unknown>>;
  constructor(readonly doc: Y.Doc) {
    this.threads = doc.getMap("threads");
  }
  list(): Thread[] {
    return [...this.threads.entries()]
      .map(([id, t]) => ({
        id,
        anchor: t.get("anchor") as Anchor,
        resolved: !!t.get("resolved"),
        createdAt: Number(t.get("createdAt")),
        messages:
          (t.get("messages") as Y.Array<CommentMessage>)?.toArray() || [],
      }))
      .filter((t) => t.anchor)
      .sort((a, b) => a.createdAt - b.createdAt);
  }
  subscribe = (fn: () => void) => {
    this.threads.observeDeep(fn);
    return () => this.threads.unobserveDeep(fn);
  };
  create(anchor: Anchor, body: string, author: User) {
    if (!body.trim()) throw new Error("Write a comment first.");
    const id = uuid();
    this.doc.transact(() => {
      const t = new Y.Map<unknown>();
      const messages = new Y.Array<CommentMessage>();
      t.set("anchor", anchor);
      t.set("createdAt", Date.now());
      t.set("resolved", false);
      t.set("messages", messages);
      this.threads.set(id, t);
      messages.push([
        { id: uuid(), body: body.trim(), author, createdAt: Date.now() },
      ]);
    }, "comment:create");
    return id;
  }
  reply(id: string, body: string, author: User) {
    if (!body.trim()) return;
    const t = this.threads.get(id);
    if (!t) throw new Error("Thread no longer exists.");
    (t.get("messages") as Y.Array<CommentMessage>).push([
      { id: uuid(), body: body.trim(), author, createdAt: Date.now() },
    ]);
  }
  resolve(id: string, resolved: boolean) {
    this.threads.get(id)?.set("resolved", resolved);
  }
}
