import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { resolveAnchor } from "./anchors";
import type { ThreadStore } from "./threadStore";
export const CommentAnchors = Extension.create<{
  store: ThreadStore;
  onSelect: (id: string) => void;
}>({
  name: "commentAnchors",
  addProseMirrorPlugins() {
    const editor = this.editor,
      { store, onSelect } = this.options;
    return [
      new Plugin({
        key: new PluginKey("commentAnchors"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            for (const thread of store.list()) {
              if (thread.resolved) continue;
              const range = resolveAnchor(editor, thread.anchor);
              if (!range) continue;
              if (range.from < range.to)
                decorations.push(
                  Decoration.inline(range.from, range.to, {
                    class: "comment-highlight",
                    "data-thread-id": thread.id,
                  }),
                );
              decorations.push(
                Decoration.widget(
                  range.from,
                  () => {
                    const pin = document.createElement("button");
                    pin.type = "button";
                    pin.className = "comment-pin";
                    pin.dataset.commentPin = thread.id;
                    pin.dataset.threadId = thread.id;
                    pin.setAttribute(
                      "aria-label",
                      `Open comment: ${thread.anchor.quote}`,
                    );
                    pin.textContent = "●";
                    pin.onmousedown = (e) => e.preventDefault();
                    pin.onclick = (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelect(thread.id);
                    };
                    return pin;
                  },
                  { side: 1, key: thread.id },
                ),
              );
            }
            return DecorationSet.create(state.doc, decorations);
          },
          handleClick(_view, _pos, event) {
            const target = (event.target as HTMLElement).closest(
              "[data-thread-id]",
            ) as HTMLElement | null;
            if (target?.dataset.threadId) {
              onSelect(target.dataset.threadId);
              return true;
            }
            return false;
          },
        },
        view(view) {
          let pending = false;
          const refresh = () => {
            if (pending) return;
            pending = true;
            queueMicrotask(() => {
              pending = false;
              if (!view.isDestroyed)
                view.dispatch(view.state.tr.setMeta("commentsChanged", true));
            });
          };
          const unsubscribe = store.subscribe(refresh);
          return { destroy: unsubscribe };
        },
      }),
    ];
  },
});
