/**
 * App shell — sidebar on desktop, top bar on mobile.
 * Four destinations only: Library, Focus, Inbox, Chat. Nothing else to learn.
 */
"use client";

import { Bot, Inbox, LibraryBig, Target, type LucideIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/services";
import { cx, formatToday } from "@/lib/utils";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Library", icon: LibraryBig },
  { href: "/focus", label: "Focus", icon: Target },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/chat", label: "Chat", icon: Bot },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className={cx("grid shrink-0 place-items-center rounded-xl bg-ember text-[#FFF3E9] shadow-sm", compact ? "size-8" : "size-9")}>
        <LibraryBig size={compact ? 15 : 17} />
      </span>
      <span className="flex flex-col">
        <span className={cx("font-display font-semibold leading-none text-ink", compact ? "text-lg" : "text-xl")}>Stacks</span>
        {!compact && (
          <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-soft">Think · Note · Ship</span>
        )}
      </span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const pathname = location.pathname;
  const [ideaCount, setIdeaCount] = useState(0);
  const [today, setToday] = useState("");

  useEffect(() => { setToday(formatToday()); }, []);

  useEffect(() => {
    let alive = true;
    api.ideas.list()
      .then((rows) => { if (alive) setIdeaCount(rows.length); })
      .catch(() => {});
    return () => { alive = false; };
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/projects") : pathname.startsWith(href);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-paper2/50 px-5 py-6 lg:flex">
        <Brand />
        <nav className="mt-9 flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                to={href}
                className={cx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-ink text-paper shadow-sm" : "text-ink-soft hover:bg-ink/5 hover:text-ink",
                )}
              >
                <Icon size={17} />
                {label}
                {label === "Inbox" && ideaCount > 0 && (
                  <span className={cx(
                    "ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold",
                    active ? "bg-paper/20 text-paper" : "bg-ink/10 text-ink-soft",
                  )}>
                    {ideaCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2">
          <p className="text-xs font-medium text-ink-soft">{today}</p>
          <p className="text-[11px] leading-relaxed text-ink-soft/70">A quiet shelf for loud ideas.</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Brand compact />
          <nav className="flex items-center gap-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  to={href}
                  className={cx(
                    "relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                    active ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/5",
                  )}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{label}</span>
                  {label === "Inbox" && ideaCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-ember text-[9px] font-bold text-white">
                      {ideaCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pt-10">
          {children}
        </main>
      </div>
    </div>
  );
}