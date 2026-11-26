/**
 * Tiny markdown for notes — zero dependencies, zero dangerouslySetInnerHTML.
 * MarkdownParser turns text into typed blocks; <Markdown/> renders them
 * as React elements (safe by construction).
 *
 * Supported: # headings, **bold**, *italic*, `code`, ``` fenced code,
 * - lists, - [ ] checklists, 1. ordered lists, > quotes, [links](https://…), ---
 */
"use client";

import { Check } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { cx } from "@/lib/utils";

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "code"; lang: string; text: string }
  | { kind: "list"; ordered: boolean; items: { text: string; checked: boolean | null }[] }
  | { kind: "quote"; text: string }
  | { kind: "hr" };

export class MarkdownParser {
  constructor(private readonly source: string) {}

  parse(): Block[] {
    const blocks: Block[] = [];
    const lines = this.source.replace(/\r\n/g, "\n").split("\n");
    let para: string[] = [];
    let code: { lang: string; lines: string[] } | null = null;
    let list: Extract<Block, { kind: "list" }> | null = null;
    let quote: string[] = [];

    const flushPara = () => {
      if (para.length) { blocks.push({ kind: "paragraph", text: para.join(" ") }); para = []; }
    };
    const flushList = () => { if (list) { blocks.push(list); list = null; } };
    const flushQuote = () => {
      if (quote.length) { blocks.push({ kind: "quote", text: quote.join(" ") }); quote = []; }
    };
    const flushAll = () => { flushPara(); flushList(); flushQuote(); };

    for (const line of lines) {
      const fence = line.match(/^```(\w*)/);
      if (fence) {
        if (code) { blocks.push({ kind: "code", lang: code.lang, text: code.lines.join("\n") }); code = null; }
        else { flushAll(); code = { lang: fence[1] ?? "", lines: [] }; }
        continue;
      }
      if (code) { code.lines.push(line); continue; }

      if (!line.trim()) { flushAll(); continue; }

      const heading = line.match(/^(#{1,4})\s+(.*)$/);
      if (heading) { flushAll(); blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] }); continue; }

      if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { flushAll(); blocks.push({ kind: "hr" }); continue; }

      const quoted = line.match(/^>\s?(.*)$/);
      if (quoted) { flushPara(); flushList(); quote.push(quoted[1]); continue; }

      const ul = line.match(/^\s*[-*]\s+(.*)$/);
      const ol = line.match(/^\s*\d+\.\s+(.*)$/);
      if (ul || ol) {
        flushPara(); flushQuote();
        const ordered = Boolean(ol);
        const raw = (ul ?? ol)![1];
        if (!list || list.ordered !== ordered) { flushList(); list = { kind: "list", ordered, items: [] }; }
        const check = raw.match(/^\[([ xX])\]\s+(.*)$/);
        list.items.push(check ? { text: check[2], checked: check[1].toLowerCase() === "x" } : { text: raw, checked: null });
        continue;
      }

      flushList(); flushQuote();
      para.push(line.trim());
    }
    if (code) blocks.push({ kind: "code", lang: code.lang, text: code.lines.join("\n") });
    flushAll();
    return blocks;
  }
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((token, i) => {
    if (token.startsWith("**") && token.endsWith("**"))
      return <strong key={i} className="font-semibold text-ink">{token.slice(2, -2)}</strong>;
    if (token.startsWith("`") && token.endsWith("`"))
      return <code key={i} className="rounded border border-ink/10 bg-ink/[0.06] px-1 py-px font-mono text-[0.85em]">{token.slice(1, -1)}</code>;
    if (token.startsWith("[")) {
      const m = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (m) return <a key={i} href={m[2]} target="_blank" rel="noreferrer noopener" className="text-ember-deep underline underline-offset-2 hover:text-ember">{m[1]}</a>;
    }
    if (token.startsWith("*") && token.endsWith("*") && token.length > 2)
      return <em key={i}>{token.slice(1, -1)}</em>;
    return <span key={i}>{token}</span>;
  });
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => new MarkdownParser(text).parse(), [text]);
  if (blocks.length === 0) return null;

  return (
    <div className={cx("space-y-2.5", className)}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "heading": {
            const cls =
              b.level === 1 ? "font-display text-lg font-semibold text-ink" :
              b.level === 2 ? "font-display text-base font-semibold text-ink" :
              "text-sm font-semibold text-ink";
            return <p key={i} className={cx(cls, "pt-1 first:pt-0")}>{renderInline(b.text)}</p>;
          }
          case "paragraph":
            return <p key={i} className="text-sm leading-relaxed text-ink/85">{renderInline(b.text)}</p>;
          case "code":
            return (
              <div key={i} className="overflow-hidden rounded-lg bg-ink">
                {b.lang && <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">{b.lang}</div>}
                <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-[#F3EDE2]">{b.text}</pre>
              </div>
            );
          case "list":
            return (
              <ul key={i} className="space-y-1.5">
                {b.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm leading-relaxed text-ink/85">
                    {item.checked === null ? (
                      b.ordered
                        ? <span className="mt-px w-4 shrink-0 text-right font-mono text-xs text-ink-soft">{j + 1}.</span>
                        : <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ember/70" />
                    ) : (
                      <span className={cx(
                        "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                        item.checked ? "border-moss bg-moss text-white" : "border-ink/25 bg-white/60",
                      )}>
                        {item.checked && <Check size={11} strokeWidth={3} />}
                      </span>
                    )}
                    <span className={cx(item.checked === true && "text-ink-soft line-through")}>{renderInline(item.text)}</span>
                  </li>
                ))}
              </ul>
            );
          case "quote":
            return <blockquote key={i} className="border-l-2 border-ember/60 pl-3 text-sm italic leading-relaxed text-ink-soft">{renderInline(b.text)}</blockquote>;
          case "hr":
            return <hr key={i} className="border-line" />;
        }
      })}
    </div>
  );
}