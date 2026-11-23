"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ACK_MAX_LENGTH, ACK_PLACEHOLDERS, DEFAULT_ACK_BODY, previewAckEmail, type AckBrand } from "@/lib/ack-template";
import { saveAcknowledgement, type SettingsResult } from "./settings-actions";
import SettingSwitch from "./SettingSwitch";

type Mode = "visual" | "html";

const TOOLS: { cmd: string; label: string; title: string; className?: string }[] = [
  { cmd: "bold", label: "B", title: "Bold", className: "font-bold" },
  { cmd: "italic", label: "I", title: "Italic", className: "italic" },
  { cmd: "underline", label: "U", title: "Underline", className: "underline" },
  { cmd: "insertUnorderedList", label: "• List", title: "Bulleted list" },
  { cmd: "insertOrderedList", label: "1. List", title: "Numbered list" },
  { cmd: "createLink", label: "Link", title: "Add link" },
  { cmd: "removeFormat", label: "Clear", title: "Clear formatting" },
];

// Body of the acknowledgement the requester gets for a new ticket. The layout
// (header, reference number, footer) is fixed; the subject stays "Re: <their
// subject>" because Outlook threading depends on it.
export default function AckSettingsCard({
  initialEnabled,
  initialHtml,
  team,
  brand,
}: {
  initialEnabled: boolean;
  initialHtml: string;
  team: string;
  brand: AckBrand;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [html, setHtml] = useState(initialHtml || DEFAULT_ACK_BODY);
  const [mode, setMode] = useState<Mode>("visual");
  const [result, setResult] = useState<SettingsResult | null>(null);
  const [pending, start] = useTransition();
  const editorRef = useRef<HTMLDivElement>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);

  // The visual editor is uncontrolled: load the HTML into it when it is shown.
  useEffect(() => {
    if (mode === "visual" && editorRef.current && editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const preview = useMemo(() => previewAckEmail(html, team, brand), [html, team, brand]);

  const exec = (cmd: string) => {
    editorRef.current?.focus();
    if (cmd === "createLink") {
      const url = window.prompt("Link address (https://…)", "https://");
      if (!url || !/^(https?:|mailto:)/i.test(url.trim())) return;
      document.execCommand(cmd, false, url.trim());
    } else {
      document.execCommand(cmd, false);
    }
    setHtml(editorRef.current?.innerHTML ?? "");
  };

  const insertPlaceholder = (key: string) => {
    const token = `{${key}}`;
    if (mode === "visual") {
      editorRef.current?.focus();
      document.execCommand("insertText", false, token);
      setHtml(editorRef.current?.innerHTML ?? "");
    } else {
      const ta = htmlRef.current;
      if (!ta) return;
      const { selectionStart: s, selectionEnd: e } = ta;
      const next = html.slice(0, s) + token + html.slice(e);
      setHtml(next);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(s + token.length, s + token.length);
      });
    }
  };

  const reset = () => {
    if (!window.confirm("Replace the current message with the default text? Your edits are not saved until you press Save.")) return;
    setHtml(DEFAULT_ACK_BODY);
    if (editorRef.current) editorRef.current.innerHTML = DEFAULT_ACK_BODY;
  };

  const save = () => {
    setResult(null);
    start(async () => setResult(await saveAcknowledgement(enabled, html)));
  };

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-fg">Acknowledgement email</h3>
          <p className="mt-1 text-xs text-subtle">
            Sent to the requester when their email opens a new ticket. The subject stays &ldquo;Re: their
            subject&rdquo; so replies stay on the same thread. When off, no acknowledgement is sent.
          </p>
        </div>
        <SettingSwitch checked={enabled} onChange={setEnabled} label="Send acknowledgement email" />
      </div>

      <div className={`grid grid-cols-1 gap-0 xl:grid-cols-2 ${enabled ? "" : "opacity-60"}`}>
        <div className="border-b border-border p-5 xl:border-b-0 xl:border-r">
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <div className="mr-2 inline-flex rounded-lg bg-surface-2 p-0.5 text-xs" role="tablist" aria-label="Editor mode">
              {(["visual", "html"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`cursor-pointer rounded-md px-2.5 py-1 font-medium ${
                    mode === m ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
                  }`}
                >
                  {m === "visual" ? "Visual" : "HTML"}
                </button>
              ))}
            </div>
            {mode === "visual" &&
              TOOLS.map((t) => (
                <button
                  key={t.cmd}
                  type="button"
                  title={t.title}
                  aria-label={t.title}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => exec(t.cmd)}
                  className={`btn-subtle px-2 py-1 text-xs ${t.className ?? ""}`}
                >
                  {t.label}
                </button>
              ))}
          </div>

          {mode === "visual" ? (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="Acknowledgement message"
              onInput={(e) => setHtml((e.target as HTMLDivElement).innerHTML)}
              className="ack-editor min-h-[260px] rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-6 text-fg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          ) : (
            <textarea
              ref={htmlRef}
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              spellCheck={false}
              aria-label="Acknowledgement message HTML"
              className="min-h-[260px] w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs leading-5 text-fg focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          )}

          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-subtle">Insert placeholder</p>
            <div className="flex flex-wrap gap-1.5">
              {ACK_PLACEHOLDERS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertPlaceholder(p.key)}
                  className="btn-ghost px-2 py-0.5 text-xs"
                  title={`Inserts {${p.key}}, e.g. "${p.sample}"`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-subtle">
              If the requester&rsquo;s name is unknown, {"{first_name}"} and {"{full_name}"} become &ldquo;Friend&rdquo;.
              Scripts, forms and non-https images are removed when you save.
            </p>
          </div>
        </div>

        <div className="p-5">
          <p className="mb-2 text-xs font-medium text-subtle">Preview (sample requester)</p>
          <iframe
            title="Acknowledgement email preview"
            sandbox=""
            srcDoc={preview}
            className="h-[460px] w-full rounded-lg border border-border bg-white"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3">
        <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={reset} disabled={pending}>
          Reset to default text
        </button>
        <span className={`text-xs ${html.length > ACK_MAX_LENGTH ? "text-red-600 dark:text-red-400" : "text-subtle"}`}>
          {html.length.toLocaleString()} / {ACK_MAX_LENGTH.toLocaleString()} characters
        </span>
        {result?.error && <p className="w-full text-xs text-red-600 dark:text-red-400" role="alert">{result.error}</p>}
        {result?.ok && result.message && (
          <p className="w-full text-xs text-emerald-600 dark:text-emerald-400" role="status">{result.message}</p>
        )}
      </div>
    </div>
  );
}
