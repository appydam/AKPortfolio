"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, Wallet, Radar, Moon, Sun, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { AlertsBell } from "./dashboard/alerts-panel";

const links = [
  { href: "/", label: "Insights", icon: Brain },
  { href: "/sources", label: "Sources", icon: Radar },
  { href: "/my-portfolio", label: "My Portfolio", icon: Wallet },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      aria-label="Toggle theme"
    >
      <Sun className="h-4 w-4 hidden dark:block" />
      <Moon className="h-4 w-4 block dark:hidden" />
    </button>
  );
}

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex h-12 max-w-[1400px] items-center justify-between px-4">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2 font-bold text-base group">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/20 group-hover:bg-primary/20 transition-colors">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <span className="tracking-tight">AK Tracker</span>
          </Link>
          <nav className="hidden items-center gap-0.5 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                  pathname === link.href
                    ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <link.icon className="h-3.5 w-3.5" />
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <AlertsBell />
        </div>
      </div>
    </header>
  );
}
