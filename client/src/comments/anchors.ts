import * as Y from "yjs";
import type { Editor } from "@tiptap/core";
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from "@tiptap/y-tiptap";
import { toBase64, fromBase64 } from "../../../shared/protocol";
import type { Anchor } from "./threadStore";
export function captureAnchor(editor: Editor): Anchor {
  const { from, to } = editor.state.selection;
  const sync = ySyncPluginKey.getState(editor.state);
  if (!sync?.binding)
    throw new Error("Wait for the collaborative document to load.");
  const encode = (position: number, assoc: number) => {
    const relative = absolutePositionToRelativePosition(
      position,
      sync.type,
      sync.binding.mapping,
    );
    const absolute = Y.createAbsolutePositionFromRelativePosition(
      relative,
      sync.doc,
    );
    return toBase64(
      Y.encodeRelativePosition(
        absolute
          ? Y.createRelativePositionFromTypeIndex(
              absolute.type,
              absolute.index,
              assoc,
            )
          : relative,
      ),
    );
  };
  return {
    start: encode(from, 0),
    end: encode(to, from === to ? 0 : -1),
    kind: from === to ? "point" : "range",
    quote:
      from === to
        ? "At cursor"
        : editor.state.doc.textBetween(from, to, " ").slice(0, 160) ||
          "Selected block",
  };
}
export function resolveAnchor(
  editor: Editor,
  anchor: Anchor,
): { from: number; to: number } | null {
  const sync = ySyncPluginKey.getState(editor.state);
  if (!sync?.binding) return null;
  try {
    const resolve = (encoded: string) =>
      relativePositionToAbsolutePosition(
        sync.doc,
        sync.type,
        Y.decodeRelativePosition(fromBase64(encoded)),
        sync.binding.mapping,
      );
    const start = resolve(anchor.start),
      end = resolve(anchor.end);
    if (start == null || end == null || start > end) return null;
    const from = Math.min(start, end),
      to = Math.max(start, end);
    if (
      from < 0 ||
      to > editor.state.doc.content.size ||
      (anchor.kind === "range" && from === to)
    )
      return null;
    return { from, to };
  } catch {
    return null;
  }
}
export function jumpToThread(editor: Editor, id: string, anchor: Anchor) {
  const range = resolveAnchor(editor, anchor);
  if (!range) return false;
  editor.commands.focus();
  editor.commands.setTextSelection(range.from);
  const marker = editor.view.dom.querySelector(
    `[data-comment-pin="${CSS.escape(id)}"]`,
  );
  const target = marker || editor.view.domAtPos(range.from).node;
  const el =
    target.nodeType === Node.ELEMENT_NODE
      ? (target as Element)
      : target.parentElement;
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}
