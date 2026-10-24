import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
function View({ node, updateAttributes, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper className={`media-block ${selected ? "selected" : ""}`}>
      <img src={node.attrs.src} alt={node.attrs.alt || "Uploaded image"} />
      <div contentEditable={false}>
        <input
          aria-label="Image caption"
          placeholder="Add a caption…"
          value={node.attrs.caption}
          onChange={(e) => updateAttributes({ caption: e.target.value })}
        />
        {node.attrs.provider && <small>{node.attrs.provider} diagram</small>}
        {node.attrs.sourceUrl && (
          <a href={node.attrs.sourceUrl} download>
            Download editable source ↗
          </a>
        )}
      </div>
    </NodeViewWrapper>
  );
}
export const MediaBlock = Node.create({
  name: "media",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return Object.fromEntries(
      ["src", "alt", "caption", "provider", "sourceUrl"].map((k) => [
        k,
        { default: "" },
      ]),
    );
  },
  parseHTML() {
    return [{ tag: "figure[data-media]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes(HTMLAttributes, { "data-media": "" }),
      ["img", { src: HTMLAttributes.src, alt: HTMLAttributes.alt }],
      ["figcaption", {}, HTMLAttributes.caption],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(View);
  },
});
