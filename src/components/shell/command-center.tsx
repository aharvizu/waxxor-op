"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Building2,
  ClipboardCheck,
  ClipboardList,
  FolderKanban,
  Gauge,
  History,
  LayoutGrid,
  LifeBuoy,
  Loader2,
  LogOut,
  Paperclip,
  Repeat,
  Search,
  Settings,
  Sparkles,
  BookOpen,
  HelpCircle,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import { cx } from "@/components/ui";
import type { SearchGroup } from "@/lib/search/engine";
import type { IconKey, SearchCategory, SearchResultItem } from "@/lib/search/types";
import { getRecentItems, getRecentSearches, rememberRecentItem, rememberSearch, type RecentItem } from "./recent-items";

export const OPEN_COMMAND_EVENT = "wx:open-command";

/**
 * The Command Center — a single reusable component for the whole platform
 * (2026-07-24). Replaces the old navigation-only CommandMenu: it now
 * searches, navigates, runs quick actions, and surfaces recents/favorites
 * from one place. All indexing/ranking/grouping lives in the Search Engine
 * (src/lib/search/) — this component only renders whatever it returns and
 * never touches a database itself. See docs note below on AI-readiness.
 */
const ICONS: Record<IconKey, ComponentType<{ className?: string }>> = {
  activity: ClipboardCheck,
  ticket: LifeBuoy,
  project: FolderKanban,
  company: Building2,
  contact: Users,
  recurring: Repeat,
  knowledge: BookOpen,
  help: HelpCircle,
  report: ClipboardList,
  user: User,
  view: LayoutGrid,
  attachment: Paperclip,
  indicator: Gauge,
  action: Zap,
  dashboard: LayoutGrid,
  settings: Settings,
  signout: LogOut,
};

const FILTERS: { key: SearchCategory | "all"; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "activities", label: "Activities" },
  { key: "tickets", label: "Tickets" },
  { key: "projects", label: "Projects" },
  { key: "companies", label: "Companies" },
  { key: "contacts", label: "Contacts" },
  { key: "recurring", label: "Recurring" },
  { key: "knowledge", label: "Knowledge Base" },
  { key: "users", label: "Usuarios" },
  { key: "settings", label: "Configuración" },
  { key: "reports", label: "Reportes" },
  { key: "indicators", label: "Indicadores" },
  { key: "actions", label: "Acciones" },
];

type ApiResponse = { query: string; groups: SearchGroup[]; total: number };

function normalizeForHighlight(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Highlights the first occurrence of `query` inside `text`, accent/case-insensitively. */
function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const normText = normalizeForHighlight(text);
  const normQuery = normalizeForHighlight(query.trim());
  const idx = normText.indexOf(normQuery);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-amber-200/70 text-inherit dark:bg-amber-400/30">{text.slice(idx, idx + normQuery.length)}</mark>
      {text.slice(idx + normQuery.length)}
    </>
  );
}

function ResultRow({
  item,
  query,
  active,
  onHover,
  onSelect,
}: {
  item: SearchResultItem;
  query: string;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const Icon = ICONS[item.iconKey] ?? Search;
  return (
    <button
      type="button"
      data-active={active || undefined}
      onClick={onSelect}
      onMouseMove={onHover}
      className={cx(
        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-75",
        active ? "bg-subtle text-fg" : "text-muted hover:bg-subtle",
      )}
    >
      <Icon className={cx("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-faint")} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-fg">
            <Highlighted text={item.title} query={query} />
          </span>
          {item.status ? <span className="shrink-0 rounded-full bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-muted">{item.status}</span> : null}
        </span>
        {item.description ? <span className="mt-0.5 block truncate text-xs text-muted">{item.description}</span> : null}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-faint">
          {item.owner ? <span>👤 {item.owner}</span> : null}
          {item.company ? <span>🏢 {item.company}</span> : null}
          {item.date ? <span>{new Date(item.date).toLocaleDateString()}</span> : null}
          {item.breadcrumb && item.breadcrumb.length > 1 ? <span className="truncate">{item.breadcrumb.join(" › ")}</span> : null}
        </span>
      </span>
    </button>
  );
}

export function CommandCenter({ signOut }: { signOut: () => Promise<void> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchCategory | "all">("all");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openCenter = useCallback(() => {
    setQuery("");
    setFilter("all");
    setActiveIndex(0);
    setData(null);
    setRecentItems(getRecentItems());
    setRecentSearches(getRecentSearches());
    setOpen(true);
  }, []);

  // Cmd/Ctrl+K toggles; "/" opens only when not typing somewhere else; the
  // header search buttons open via a plain DOM event (see app-shell.tsx).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) openCenter();
          return !o;
        });
        return;
      }
      if (e.key === "/" && !open) {
        const target = e.target as HTMLElement | null;
        const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
        if (!typing) {
          e.preventDefault();
          openCenter();
        }
      }
    }
    function onOpenEvent() {
      openCenter();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_EVENT, onOpenEvent);
    };
  }, [open, openCenter]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced, cancellable fetch to the Search Engine's API route.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = query.trim() ? 250 : 0;
    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (filter !== "all") params.set("category", filter);
      fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
        .then((r) => (r.ok ? (r.json() as Promise<ApiResponse>) : null))
        .then((json) => {
          if (json) {
            setData(json);
            setActiveIndex(0);
          }
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          console.error(err);
        })
        .finally(() => setLoading(false));
    }, delay);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, filter, open]);

  // Remember the search after the user pauses on a query that returned something.
  useEffect(() => {
    if (!query.trim() || !data || data.total === 0) return;
    const t = setTimeout(() => rememberSearch(query.trim()), 700);
    return () => clearTimeout(t);
  }, [query, data]);

  const isEmptyQuery = query.trim().length === 0;
  const recentAsResults: SearchResultItem[] = useMemo(
    () =>
      recentItems.map((r) => ({
        id: `recent:${r.id}`,
        category: r.category as SearchCategory,
        iconKey: r.iconKey as IconKey,
        title: r.title,
        description: r.description,
        route: r.route,
        rank: 1,
      })),
    [recentItems],
  );

  const displayGroups: { label: string; iconKey: IconKey; items: SearchResultItem[] }[] = useMemo(() => {
    if (isEmptyQuery) {
      const groups: { label: string; iconKey: IconKey; items: SearchResultItem[] }[] = [];
      if (recentAsResults.length > 0) groups.push({ label: "Recientes", iconKey: "action", items: recentAsResults });
      for (const g of data?.groups ?? []) groups.push({ label: g.label, iconKey: g.iconKey, items: g.items });
      return groups;
    }
    return (data?.groups ?? []).map((g) => ({ label: g.label, iconKey: g.iconKey, items: g.items }));
  }, [isEmptyQuery, recentAsResults, data]);

  const flatItems = useMemo(() => displayGroups.flatMap((g) => g.items), [displayGroups]);

  function openItem(item: SearchResultItem) {
    setOpen(false);
    if (item.route === "__signout__") {
      void signOut();
      return;
    }
    rememberRecentItem({ id: item.id, category: item.category, iconKey: item.iconKey, title: item.title, description: item.description, route: item.route });
    router.push(item.route);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flatItems.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) openItem(item);
    } else if (e.key === "Tab") {
      // Cycle filter tabs instead of tabbing out — keeps the whole
      // interaction on the keyboard without leaving the dialog.
      e.preventDefault();
      const idx = FILTERS.findIndex((f) => f.key === filter);
      const nextIdx = e.shiftKey ? (idx - 1 + FILTERS.length) % FILTERS.length : (idx + 1) % FILTERS.length;
      setFilter(FILTERS[nextIdx].key);
    }
  }

  let runningIndex = -1;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        {/* Overlay alone is fixed inset-0 (the whole viewport) so a click
            anywhere outside the panel below is a genuine "outside click"
            for Radix to dismiss on — Content used to also be inset-0,
            which made every click read as "inside" and outside-click-to-
            close silently did nothing. */}
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/40 backdrop-blur-sm" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="fixed top-[10vh] left-1/2 z-[60] flex max-h-[76vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-edge bg-surface shadow-overlay outline-none"
        >
          <Dialog.Title className="sr-only">Command Center</Dialog.Title>
          <Dialog.Description className="sr-only">Busca en toda la plataforma, navega o ejecuta acciones rápidas.</Dialog.Description>
          <div className="flex items-center gap-3 border-b border-edge px-4">
              <Search className="size-4 shrink-0 text-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Buscar en Watson… (Activities, Tickets, Projects, empresas, personas, acciones)"
                aria-label="Command Center search"
                className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-faint"
              />
              {loading ? <Loader2 className="size-4 shrink-0 animate-spin text-faint" /> : null}
              <kbd className="hidden shrink-0 rounded-md border border-edge bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-faint sm:block">esc</kbd>
              <Dialog.Close className="shrink-0 rounded-md p-1 text-faint hover:bg-subtle hover:text-fg sm:hidden">
                <X className="size-4" />
              </Dialog.Close>
            </div>

            <div className="flex flex-wrap gap-1 border-b border-edge px-3 py-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cx(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    filter === f.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {isEmptyQuery && recentSearches.length > 0 ? (
                <div className="mb-1 px-2 pt-1">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">
                    <History className="size-3" /> Búsquedas recientes
                  </div>
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {recentSearches.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setQuery(s)}
                        className="rounded-full border border-edge px-2.5 py-1 text-xs text-muted hover:bg-subtle hover:text-fg"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {!loading && flatItems.length === 0 ? (
                <p className="px-3 py-10 text-center text-sm text-muted">
                  {isEmptyQuery ? "Escribe para buscar en toda la plataforma." : `Sin resultados para “${query}”.`}
                </p>
              ) : (
                displayGroups.map((group) => (
                  <div key={group.label} className="mb-1">
                    <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-faint uppercase">{group.label}</div>
                    {group.items.map((item) => {
                      runningIndex++;
                      const index = runningIndex;
                      return (
                        <ResultRow
                          key={item.id}
                          item={item}
                          query={query}
                          active={index === activeIndex}
                          onHover={() => setActiveIndex(index)}
                          onSelect={() => openItem(item)}
                        />
                      );
                    })}
                  </div>
                ))
              )}

              {/* AI-readiness slot: the Search Engine already returns
                  category/rank/context per result, so future AI actions
                  (resumir, buscar similares, generar, lenguaje natural)
                  plug in here as another result group or a contextual
                  action on ResultRow — no redesign needed. Not implemented
                  this sprint, per scope. */}
              {isEmptyQuery ? (
                <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-faint">
                  <Sparkles className="size-3" /> Próximamente: acciones con IA desde aquí mismo.
                </div>
              ) : null}
            </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
