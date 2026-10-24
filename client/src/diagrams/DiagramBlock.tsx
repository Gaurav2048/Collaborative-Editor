import { uuid } from "../../../shared/protocol";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useEffect, useState } from "react";
import mermaid from "mermaid";
import DOMPurify from "dompurify";
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "neutral",
  flowchart: { htmlLabels: false },
  htmlLabels: false,
});
export const example =
  "flowchart LR\n  Idea[An idea] --> Discuss[Discuss together]\n  Discuss --> Build[Make it happen]";
export async function renderDiagram(code: string) {
  const { svg } = await mermaid.render(
    `diagram_${uuid().replaceAll("-", "")}`,
    code,
  );
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true } });
}
export function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function DiagramView({ node, updateAttributes, selected }: NodeViewProps) {
  const [svg, setSvg] = useState(""),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [code, setCode] = useState(node.attrs.code);
  useEffect(() => {
    let active = true;
    renderDiagram(node.attrs.code)
      .then((s) => {
        if (active) {
          setSvg(s);
          setError("");
        }
      })
      .catch(() => {
        if (active)
          setError("Diagram syntax needs attention. Choose Edit to fix it.");
      });
    return () => {
      active = false;
    };
  }, [node.attrs.code]);
  return (
    <NodeViewWrapper className={`diagram-block ${selected ? "selected" : ""}`}>
      <div className="block-label">
        ◇ MERMAID DIAGRAM{" "}
        <span>
          <button
            onClick={() => {
              setCode(node.attrs.code);
              setEditing(!editing);
            }}
          >
            Edit
          </button>
          <button
            disabled={!svg}
            onClick={() => download("diagram.svg", svg, "image/svg+xml")}
          >
            Export SVG ↗
          </button>
        </span>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
          alt="Mermaid diagram"
        />
      )}
      {editing && (
        <div className="diagram-edit" contentEditable={false}>
          <textarea
            aria-label="Mermaid code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            className="primary"
            onClick={() => {
              updateAttributes({ code });
              setEditing(false);
            }}
          >
            Apply diagram
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}
export const DiagramBlock = Node.create({
  name: "diagram",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { code: { default: example } };
  },
  parseHTML() {
    return [{ tag: "div[data-diagram]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-diagram": "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DiagramView);
  },
});
