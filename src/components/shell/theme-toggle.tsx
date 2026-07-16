"use client";

import { useState, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cx, iconButtonClass } from "@/components/ui";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  // Hydration gate: false on the server and during hydration, true after mount,
  // so the <html> class is only read once it is safe to diverge from server HTML.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [override, setOverride] = useState<boolean | null>(null);
  const dark =
    override ??
    (mounted ? document.documentElement.classList.contains("dark") : null);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // storage unavailable (private mode) — theme still applies for the session
    }
    setOverride(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={cx(iconButtonClass, "relative overflow-hidden")}
    >
      <Sun
        className={cx(
          "absolute size-4 transition-all duration-300",
          dark === false ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0",
        )}
      />
      <Moon
        className={cx(
          "absolute size-4 transition-all duration-300",
          dark === true ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0",
        )}
      />
    </button>
  );
}
