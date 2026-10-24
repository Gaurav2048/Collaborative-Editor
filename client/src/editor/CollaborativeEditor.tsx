import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import { useEffect, useState } from "react";
import type { User } from "../../../shared/protocol";
import { DocumentSession } from "../collaboration/DocumentSession";
import { ThreadStore } from "../comments/threadStore";
import { CommentAnchors } from "../comments/CommentAnchors";
import { MediaBlock } from "./MediaBlock";
import { DiagramBlock } from "../diagrams/DiagramBlock";
export function CollaborativeEditor({
  session,
  user,
  store,
  onReady,
  onComment,
  onSelect,
  onImage,
  onDiagram,
}: {
  session: DocumentSession;
  user: User;
  store: ThreadStore;
  onReady: (e: Editor) => void;
  onComment: () => void;
  onSelect: (id: string) => void;
  onImage: () => void;
  onDiagram: () => void;
}) {
  const [, refresh] = useState(0);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({
        fragment: session.doc.getXmlFragment("content"),
      }),
      CollaborationCaret.configure({ provider: session, user }),
      Placeholder.configure({ placeholder: "Write something worth sharing…" }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit,
      MediaBlock,
      DiagramBlock,
      CommentAnchors.configure({ store, onSelect }),
    ],
    editorProps: {
      attributes: {
        class: "document-content",
        "aria-label": "Document editor",
      },
      handleKeyDown: (_, e) => {
        if (
          (e.metaKey || e.ctrlKey) &&
          e.altKey &&
          e.key.toLowerCase() === "m"
        ) {
          e.preventDefault();
          onComment();
          return true;
        }
        return false;
      },
    },
    onTransaction: () => refresh((n) => n + 1),
  });
  useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);
  useEffect(() => {
    editor?.commands.updateUser(user);
    session.setUser(user);
  }, [editor, user, session]);
  if (!editor) return null;
  const button = (label: string, action: () => void, active = false) => (
    <button
      type="button"
      className={active ? "is-active" : ""}
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={action}
    >
      {label}
    </button>
  );
  return (
    <>
      <div className="toolbar">
        <select
          aria-label="Text style"
          value={
            editor.isActive("heading", { level: 1 })
              ? "1"
              : editor.isActive("heading", { level: 2 })
                ? "2"
                : "0"
          }
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n)
              editor
                .chain()
                .focus()
                .setHeading({ level: n as 1 | 2 })
                .run();
            else editor.chain().focus().setParagraph().run();
          }}
        >
          <option value="0">Normal text</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
        </select>
        <i />
        {button(
          "B",
          () => editor.chain().focus().toggleBold().run(),
          editor.isActive("bold"),
        )}
        {button(
          "I",
          () => editor.chain().focus().toggleItalic().run(),
          editor.isActive("italic"),
        )}
        {button(
          "S",
          () => editor.chain().focus().toggleStrike().run(),
          editor.isActive("strike"),
        )}
        {button(
          "</>",
          () => editor.chain().focus().toggleCode().run(),
          editor.isActive("code"),
        )}
        <i />
        {button("• List", () =>
          editor.chain().focus().toggleBulletList().run(),
        )}
        {button("☑", () => editor.chain().focus().toggleTaskList().run())}
        {button("❝", () => editor.chain().focus().toggleBlockquote().run())}
        {button("▦", () =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run(),
        )}
        <i />
        {button("Image", onImage)}
        {button("◇ Diagram", onDiagram)}
        {button("＋ Comment", onComment)}
        <span className="grow" />
        {button("↶", () => editor.chain().focus().undo().run())}
        {button("↷", () => editor.chain().focus().redo().run())}
      </div>
      <EditorContent editor={editor} />
      <div className="document-end">
        ✦ <span>A little room for your next big idea.</span>
      </div>
    </>
  );
}
