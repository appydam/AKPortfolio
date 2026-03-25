"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileText, Brain, Activity, PieChart, Clock, Wallet, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import { AlertsBell } from "./dashboard/alerts-panel";

const links = [
  { href: "/", label: "Insights", icon: Brain },
  { href: "/holdings", label: "Holdings", icon: BarChart3 },
  { href: "/deals", label: "Deals", icon: FileText },
  { href: "/analytics", label: "Analytics", icon: PieChart },
  { href: "/timeline", label: "Timeline", icon: Clock },
  { href: "/health", label: "Health", icon: Activity },
  { href: "/sources", label: "Sources", icon: Radar },
  { href: "/my-portfolio", label: "My Portfolio", icon: Wallet },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <BarChart3 className="h-5 w-5 text-primary" />
            AK Portfolio Tracker
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <AlertsBell />
      </div>
    </header>
  );
}
