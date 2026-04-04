"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("ambitt-theme");
    if (saved === "light") {
      document.documentElement.classList.remove("dark");
      setDark(false);
    }
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("ambitt-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("ambitt-theme", "light");
    }
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs"
      aria-label="Toggle theme"
    >
      {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
      <span className="group-data-[collapsible=icon]:hidden">
        {dark ? "Light mode" : "Dark mode"}
      </span>
    </button>
  );
}
