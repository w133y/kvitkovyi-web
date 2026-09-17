// Shared markdown renderer for the wiki — used by both the public article
// page (Server Component) and the admin editor's live preview (Client
// Component), so "what you see in the editor" is exactly what gets
// rendered. No browser-only APIs here, so it works in either context.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";
import type { Element, Root } from "hast";

// The toolbar's alignment buttons wrap selected text in
// <div style="text-align:center">...</div> — markdown itself has no
// alignment concept. This is the only raw HTML allowed through at all.
const ALIGN_STYLE = /^text-align:\s*(left|center|right);?$/;

const schema: Schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "div", "span"],
  attributes: {
    ...defaultSchema.attributes,
    div: [...(defaultSchema.attributes?.div ?? []), "style"],
    span: [...(defaultSchema.attributes?.span ?? []), "style"],
  },
};

// rehype-sanitize's schema only allowlists which attributes exist, not
// what a style value actually contains — this clamps it to exactly the
// one thing the toolbar ever produces, regardless of what else might
// arrive in a style attribute (e.g. HTML pasted directly into the editor).
function clampAlignStyle() {
  return (tree: Root) => {
    function visit(node: Root | Element) {
      if (node.type === "element" && (node.tagName === "div" || node.tagName === "span")) {
        const style = node.properties?.style;
        if (typeof style === "string" && !ALIGN_STYLE.test(style.trim())) {
          delete node.properties.style;
        }
      }
      for (const child of node.children ?? []) {
        if (child.type === "element") visit(child);
      }
    }
    visit(tree);
  };
}

export default function WikiMarkdown({ content }: { content: string }) {
  return (
    <div className="wiki-article-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], clampAlignStyle]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
