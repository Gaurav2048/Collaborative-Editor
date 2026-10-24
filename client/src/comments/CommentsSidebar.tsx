import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { User } from "../../../shared/protocol";
import { ThreadStore, type Anchor } from "./threadStore";
import { jumpToThread, resolveAnchor } from "./anchors";
export function Avatar({ user }: { user: User }) {
  return user.avatar ? (
    <img className="avatar" src={user.avatar} alt={user.name} />
  ) : (
    <span
      className="avatar"
      style={{ background: user.color }}
      title={user.name}
    >
      {user.name
        .split(" ")
        .map((s) => s[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
export function CommentsSidebar({
  store,
  editor,
  user,
  anchor,
  onCancel,
  active,
  onActive,
}: {
  store: ThreadStore;
  editor: Editor | null;
  user: User;
  anchor: Anchor | null;
  onCancel: () => void;
  active: string;
  onActive: (id: string) => void;
}) {
  const [, tick] = useState(0),
    [body, setBody] = useState(""),
    [filter, setFilter] = useState(false),
    [replies, setReplies] = useState<Record<string, string>>({});
  useEffect(() => store.subscribe(() => tick((n) => n + 1)), [store]);
  useEffect(() => {
    if (!editor) return;
    const f = () => tick((n) => n + 1);
    editor.on("update", f);
    return () => {
      editor.off("update", f);
    };
  }, [editor]);
  const threads = store.list().filter((t) => t.resolved === filter);
  return (
    <aside className="comments">
      <div className="section-title">
        <h3>Conversation</h3>
        <span className="count">
          {store.list().filter((t) => !t.resolved).length}
        </span>
      </div>
      <p className="muted small">Good ideas get better together.</p>
      <div className="tabs">
        <button
          className={!filter ? "active" : ""}
          onClick={() => setFilter(false)}
        >
          Open
        </button>
        <button
          className={filter ? "active" : ""}
          onClick={() => setFilter(true)}
        >
          Resolved
        </button>
      </div>
      {anchor && (
        <form
          className="comment-card composer"
          onSubmit={(e) => {
            e.preventDefault();
            const id = store.create(anchor, body, user);
            setBody("");
            onCancel();
            onActive(id);
            setFilter(false);
          }}
        >
          <blockquote>{anchor.quote}</blockquote>
          <textarea
            autoFocus
            aria-label="New comment"
            placeholder="Share a thought…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
          <div className="row">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button className="primary" disabled={!body.trim()}>
              Post comment
            </button>
          </div>
        </form>
      )}
      {!threads.length && !anchor && (
        <div className="empty-comments">
          <span>☷</span>
          <h4>Start a conversation</h4>
          <p>
            Select text or place your cursor,
            <br />
            then choose “Comment”.
          </p>
          <kbd>Ctrl / ⌘ + Alt + M</kbd>
        </div>
      )}
      {threads.map((t) => (
        <article
          id={`thread-${t.id}`}
          key={t.id}
          className={`comment-card ${active === t.id ? "active" : ""}`}
        >
          <button
            className="quote"
            onClick={() => {
              onActive(t.id);
              if (editor) jumpToThread(editor, t.id, t.anchor);
            }}
          >
            {t.anchor.quote}
            {editor && !resolveAnchor(editor, t.anchor) && (
              <small>Original content was removed</small>
            )}
          </button>
          {t.messages.map((m) => (
            <div className="message" key={m.id}>
              <Avatar user={m.author} />
              <div>
                <strong>{m.author.name}</strong>
                <time>
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                <p>{m.body}</p>
              </div>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              store.reply(t.id, replies[t.id] || "", user);
              setReplies({ ...replies, [t.id]: "" });
            }}
          >
            <input
              aria-label="Reply to comment"
              placeholder="Write a reply…"
              value={replies[t.id] || ""}
              onChange={(e) =>
                setReplies({ ...replies, [t.id]: e.target.value })
              }
            />
            <div className="row">
              <button
                type="button"
                onClick={() => store.resolve(t.id, !t.resolved)}
              >
                {t.resolved ? "↶ Reopen" : "✓ Resolve"}
              </button>
              <button disabled={!replies[t.id]?.trim()}>Reply ↗</button>
            </div>
          </form>
        </article>
      ))}
    </aside>
  );
}
