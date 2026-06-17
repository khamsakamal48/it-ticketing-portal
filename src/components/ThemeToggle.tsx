"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// Toggles the .dark class on <html> and persists the choice. The initial
// theme is set pre-paint by an inline script in layout.tsx (defaults to dark).
export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-fg cursor-pointer"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
