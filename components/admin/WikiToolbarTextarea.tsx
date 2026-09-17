"use client";

import { useRef, useState } from "react";
import { getWikiUploadTarget } from "@/lib/actions/wiki";

type Selection = { start: number; end: number };

function wrapSelection(value: string, sel: Selection, before: string, after: string) {
  const selected = value.slice(sel.start, sel.end);
  const next = value.slice(0, sel.start) + before + selected + after + value.slice(sel.end);
  const cursor = sel.start + before.length + selected.length + after.length;
  return { next, cursor };
}

// Prefixes every line the selection touches — used by list/quote/heading
// buttons, which apply per-line rather than wrapping the whole block.
function prefixLines(value: string, sel: Selection, prefix: string) {
  const lineStart = value.lastIndexOf("\n", sel.start - 1) + 1;
  let lineEnd = value.indexOf("\n", sel.end);
  if (lineEnd === -1) lineEnd = value.length;

  const block = value.slice(lineStart, lineEnd);
  const prefixed = block
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");

  const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  return { next, cursor: lineStart + prefixed.length };
}

export default function WikiToolbarTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function getSelection(): Selection {
    const el = textareaRef.current;
    return { start: el?.selectionStart ?? value.length, end: el?.selectionEnd ?? value.length };
  }

  function apply(next: string, cursor: number) {
    onChange(next);
    // The textarea's value updates via the next render — the selection
    // has to be restored after that, not synchronously here.
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  function wrap(before: string, after: string = before) {
    const { next, cursor } = wrapSelection(value, getSelection(), before, after);
    apply(next, cursor);
  }

  function linePrefix(prefix: string) {
    const { next, cursor } = prefixLines(value, getSelection(), prefix);
    apply(next, cursor);
  }

  function insertLink() {
    const sel = getSelection();
    const label = value.slice(sel.start, sel.end) || "текст";
    const insert = `[${label}](https://)`;
    const next = value.slice(0, sel.start) + insert + value.slice(sel.end);
    // Selects the "https://" placeholder so typing the real URL is one step.
    const urlStart = sel.start + label.length + 3;
    onChange(next);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(urlStart, urlStart + 8);
    });
  }

  function align(direction: "left" | "center" | "right") {
    const sel = getSelection();
    const selected = value.slice(sel.start, sel.end) || "текст";
    // Blank lines around the content, not just newlines, matter here — a
    // CommonMark HTML block (what <div> starts) swallows every line right
    // after it as literal raw text until it hits a blank line. Without
    // one, "### заголовок" right after the opening tag renders as the
    // literal text "### заголовок" instead of a parsed heading.
    const before = `<div style="text-align:${direction}">\n\n`;
    const after = `\n\n</div>`;
    const next = value.slice(0, sel.start) + before + selected + after + value.slice(sel.end);
    apply(next, sel.start + before.length + selected.length + after.length);
  }

  async function handleImageButtonClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const target = await getWikiUploadTarget(file.type);
      if ("error" in target) {
        setUploadError(target.error);
        return;
      }
      const res = await fetch(target.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) {
        setUploadError("Не вдалося завантажити зображення");
        return;
      }
      const sel = getSelection();
      const insert = `![](${target.publicUrl})`;
      const next = value.slice(0, sel.start) + insert + value.slice(sel.end);
      apply(next, sel.start + insert.length);
    } catch (err) {
      console.error("wiki image upload failed", err);
      setUploadError("Не вдалося завантажити зображення");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="wiki-editor-textarea-wrap">
      <div className="wiki-editor-toolbar">
        <button type="button" onClick={() => wrap("**")} title="Жирний"><b>Ж</b></button>
        <button type="button" onClick={() => wrap("*")} title="Курсив"><i>К</i></button>
        <button type="button" onClick={() => linePrefix("## ")} title="Заголовок 2">H2</button>
        <button type="button" onClick={() => linePrefix("### ")} title="Заголовок 3">H3</button>
        <button type="button" onClick={() => linePrefix("- ")} title="Список">
          <i className="fa-solid fa-list-ul"></i>
        </button>
        <button type="button" onClick={() => linePrefix("1. ")} title="Нумерований список">
          <i className="fa-solid fa-list-ol"></i>
        </button>
        <button type="button" onClick={() => linePrefix("> ")} title="Цитата">
          <i className="fa-solid fa-quote-left"></i>
        </button>
        <button type="button" onClick={insertLink} title="Посилання">
          <i className="fa-solid fa-link"></i>
        </button>
        <button type="button" onClick={handleImageButtonClick} disabled={uploading} title="Зображення">
          <i className="fa-solid fa-image"></i>
        </button>
        <span className="wiki-editor-toolbar-divider" />
        <button type="button" onClick={() => align("left")} title="По лівому краю">
          <i className="fa-solid fa-align-left"></i>
        </button>
        <button type="button" onClick={() => align("center")} title="По центру">
          <i className="fa-solid fa-align-center"></i>
        </button>
        <button type="button" onClick={() => align("right")} title="По правому краю">
          <i className="fa-solid fa-align-right"></i>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileSelected}
      />

      {uploadError && <p className="wiki-editor-upload-error">{uploadError}</p>}

      <textarea
        ref={textareaRef}
        className="wiki-editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Текст статті у форматі markdown..."
        rows={20}
      />
    </div>
  );
}
