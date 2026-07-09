"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cx, iconButtonClass } from "@/components/ui";

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // storage unavailable (private mode) — theme still applies for the session
    }
    setDark(next);
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
