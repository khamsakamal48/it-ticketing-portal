"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Ticket,
  Settings,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, desc: "Overview" },
  { href: "/tickets", label: "Tickets", icon: Ticket, desc: "Queue" },
  { href: "/admin", label: "Admin", icon: Settings, desc: "Config" },
];

const TITLE: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/tickets": "Tickets",
  "/admin": "Admin",
};

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="bg-grad-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-[0_2px_8px_-2px_rgb(var(--brand)/0.6)]">
        IT
      </div>
      {!collapsed && (
        <div className="text-sm font-semibold leading-tight text-fg">
          Ticketing
          <span className="block text-[11px] font-normal text-subtle">IITB ACR</span>
        </div>
      )}
    </div>
  );
}

function NavLinks({
  active,
  collapsed = false,
  onNavigate,
}: {
  active: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1 px-3 py-3">
      {!collapsed && (
        <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">
          Workspace
        </p>
      )}
      {NAV.map(({ href, label, icon: Icon, desc }) => {
        const isActive = active === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            title={collapsed ? label : undefined}
            className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              collapsed ? "justify-center" : ""
            } ${
              isActive
                ? "bg-brand/10 text-brand"
                : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand" />
            )}
            <Icon
              size={18}
              className={`shrink-0 ${isActive ? "text-brand" : "text-subtle group-hover:text-fg"}`}
            />
            {!collapsed && <span className="flex-1">{label}</span>}
            {!collapsed && (
              <span className="text-[10px] font-normal text-subtle opacity-0 transition-opacity group-hover:opacity-100">
                {desc}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

// Responsive app chrome: persistent sidebar on desktop (collapsible to an
// icon rail, persisted in localStorage), slide-in drawer on mobile. A sticky
// top bar carries the section title (desktop) / hamburger (mobile). `footer`
// carries the (server-rendered) user block + sign-out form.
export function NavShell({
  active,
  footer,
  footerCollapsed,
  children,
}: {
  active: string;
  footer: React.ReactNode;
  footerCollapsed?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const title = TITLE[active] ?? "Portal";

  // Restore persisted collapse state (desktop only).
  useEffect(() => {
    setCollapsed(localStorage.getItem("nav:collapsed") === "1");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("nav:collapsed", next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        className={`hidden flex-col border-r border-border bg-surface/60 backdrop-blur-xl transition-[width] duration-200 md:flex ${
          collapsed ? "w-[72px]" : "w-60"
        }`}
      >
        <div className={`flex items-center py-5 ${collapsed ? "justify-center px-3" : "justify-between px-5"}`}>
          <Brand collapsed={collapsed} />
        </div>
        <NavLinks active={active} collapsed={collapsed} />
        <div className="px-3 pb-2">
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
            className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg ${
              collapsed ? "w-full justify-center" : "w-full justify-start"
            } cursor-pointer`}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
        <div className={`overflow-hidden whitespace-nowrap border-t border-border p-4 ${collapsed ? "flex justify-center" : ""}`}>
          {collapsed ? footerCollapsed ?? footer : footer}
        </div>
      </aside>

      {/* Mobile drawer + scrim */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 animate-fade-in"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-surface animate-slide-in">
            <div className="flex items-center justify-between px-5 py-5">
              <Brand />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <NavLinks active={active} onNavigate={() => setOpen(false)} />
            <div className="border-t border-border p-4">{footer}</div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        {/* Sticky top bar (both breakpoints) */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-bg/70 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg cursor-pointer md:hidden"
            >
              <Menu size={20} />
            </button>
            <span className="md:hidden">
              <Brand />
            </span>
            <h1 className="hidden text-sm font-semibold text-fg md:block">{title}</h1>
          </div>
          <ThemeToggle />
        </header>

        <main className="w-full flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
