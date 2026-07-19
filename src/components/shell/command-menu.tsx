"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Home,
  Timer,
  BookOpen,
  ClipboardCheck,
  Building2,
  ClipboardList,
  FileText,
  FolderKanban,
  Gauge,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { cx } from "@/components/ui";

export const OPEN_COMMAND_EVENT = "wx:open-command";

type Item = {
  label: string;
  href: string;
  group: "Navigate" | "Create" | "Knowledge Base" | "Help Center";
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
};

const items: Item[] = [
  { label: "Dashboard", href: "/dashboard", group: "Navigate", icon: LayoutDashboard, keywords: "home overview" },
  { label: "Hoy", href: "/today", group: "Navigate", icon: Home, keywords: "today home hoy pendientes" },
  { label: "Activities", href: "/activities", group: "Navigate", icon: ClipboardCheck, keywords: "tasks follow-up work" },
  { label: "SLA", href: "/settings/sla", group: "Navigate", icon: Timer, keywords: "sla service level targets calendar settings" },
  { label: "Helpdesk", href: "/helpdesk", group: "Navigate", icon: LifeBuoy, keywords: "tickets support" },
  { label: "Projects", href: "/projects", group: "Navigate", icon: FolderKanban, keywords: "engagements tasks" },
  { label: "Quotes", href: "/quotes", group: "Navigate", icon: FileText, keywords: "proposals pricing" },
  { label: "Reports", href: "/reports", group: "Navigate", icon: ClipboardList, keywords: "documents" },
  { label: "Report templates", href: "/reports/templates", group: "Navigate", icon: ClipboardList, keywords: "templates" },
  { label: "KPIs", href: "/kpis", group: "Navigate", icon: Gauge, keywords: "metrics numbers" },
  { label: "Empresas", href: "/companies", group: "Navigate", icon: Building2, keywords: "clients customers accounts companies" },
  { label: "Contactos", href: "/contacts", group: "Navigate", icon: Users, keywords: "contacts people" },
  { label: "Inbox", href: "/inbox", group: "Navigate", icon: Inbox, keywords: "conversations messages" },
  { label: "Base de conocimiento", href: "/knowledge", group: "Navigate", icon: BookOpen, keywords: "knowledge articles kb" },
  { label: "Centro de Ayuda", href: "/help", group: "Navigate", icon: HelpCircle, keywords: "help tutorials ayuda" },
  { label: "Settings", href: "/settings", group: "Navigate", icon: Settings, keywords: "configuracion" },
  { label: "Users", href: "/settings/users", group: "Navigate", icon: Users, keywords: "team members settings" },
  { label: "New activity", href: "/activities/new", group: "Create", icon: Plus, keywords: "create activity task" },
  { label: "New ticket", href: "/helpdesk/new", group: "Create", icon: Plus, keywords: "create ticket support" },
  { label: "New project", href: "/projects/new", group: "Create", icon: Plus, keywords: "create project" },
  { label: "New quote", href: "/quotes/new", group: "Create", icon: Plus, keywords: "create quote proposal" },
  { label: "New report", href: "/reports/new", group: "Create", icon: Plus, keywords: "create report" },
  { label: "New KB article", href: "/knowledge/new", group: "Create", icon: Plus, keywords: "create knowledge article" },
];

type RemoteResults = {
  articles: { id: number; title: string; slug: string }[];
  tutorials: { slug: string; title: string; module: string }[];
};

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [remote, setRemote] = useState<RemoteResults>({ articles: [], tutorials: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [query]);

  const remoteItems = useMemo<Item[]>(() => {
    if (query.trim().length < 2) return [];
    return [
      ...remote.articles.map((a) => ({
        label: a.title,
        href: `/knowledge/${a.id}`,
        group: "Knowledge Base" as const,
        icon: BookOpen,
      })),
      ...remote.tutorials.map((t) => ({
        label: t.title,
        href: `/help/${t.slug}`,
        group: "Help Center" as const,
        icon: HelpCircle,
      })),
    ];
  }, [remote, query]);

  const allFiltered = useMemo(() => [...filtered, ...remoteItems], [filtered, remoteItems]);

  const groups = useMemo(() => {
    const order: Item["group"][] = ["Navigate", "Create", "Knowledge Base", "Help Center"];
    return order
      .map((g) => ({ name: g, items: allFiltered.filter((i) => i.group === g) }))
      .filter((g) => g.items.length > 0);
  }, [allFiltered]);

  // Live search of published KB articles + active tutorials while typing.
  // remoteItems already ignores `remote` for short queries, so there is
  // nothing to clear synchronously here — just skip fetching.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search/knowledge?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { articles: [], tutorials: [] }))
        .then((data: RemoteResults) => setRemote(data))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const openMenu = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) {
            setQuery("");
            setActiveIndex(0);
          }
          return !o;
        });
      }
    }
    function onOpenEvent() {
      openMenu();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_EVENT, onOpenEvent);
    };
  }, [openMenu]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function select(item: Item) {
    setOpen(false);
    router.push(item.href);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, allFiltered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = allFiltered[activeIndex];
      if (item) select(item);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/40 p-4 pt-[14vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Quick search"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-xl border border-edge bg-surface shadow-overlay"
          >
            <div className="flex items-center gap-3 border-b border-edge px-4">
              <Search className="size-4 shrink-0 text-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Search pages and actions…"
                aria-label="Search pages and actions"
                className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-faint"
              />
              <kbd className="rounded-md border border-edge bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-faint">
                esc
              </kbd>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {allFiltered.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted">
                  No results for “{query}”.
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.name} className="mb-1">
                    <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-faint uppercase">
                      {group.name}
                    </div>
                    {group.items.map((item) => {
                      const index = allFiltered.indexOf(item);
                      const active = index === activeIndex;
                      return (
                        <button
                          key={item.href + item.label}
                          type="button"
                          onClick={() => select(item)}
                          onMouseMove={() => setActiveIndex(index)}
                          className={cx(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors duration-75",
                            active ? "bg-subtle text-fg" : "text-muted",
                          )}
                        >
                          <item.icon
                            className={cx(
                              "size-4 shrink-0",
                              active ? "text-primary" : "text-faint",
                            )}
                          />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
