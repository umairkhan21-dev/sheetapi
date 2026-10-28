"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogoutButton } from "@/app/dashboard/logout-button";
import { secondaryButtonClass } from "@/app/dashboard/ui";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/apis", label: "My APIs", exact: false },
  { href: "/dashboard/sheets", label: "Google Sheets", exact: true },
  { href: "/dashboard/settings", label: "Settings", exact: true },
] as const;

function isActive(pathname: string, item: (typeof NAV_ITEMS)[number]) {
  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function DashboardNavLinks({
  pathname,
  onNavigate,
  id,
}: {
  pathname: string;
  onNavigate?: () => void;
  id?: string;
}) {
  return (
    <nav id={id} aria-label="Dashboard" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={`rounded-lg px-3 py-2 text-sm ${
              active
                ? "bg-green-50 font-medium text-green-800"
                : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({
  user,
  children,
}: {
  user: { name: string; email: string };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-1 bg-slate-50 text-slate-900">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="px-4 py-5">
          <Link href="/dashboard" className="text-base font-semibold tracking-tight">
            Sheet<span className="text-green-600">API</span>
          </Link>
        </div>
        <div className="px-3">
          <DashboardNavLinks pathname={pathname} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              className={`${secondaryButtonClass} px-3 py-1.5 md:hidden`}
              aria-expanded={menuOpen}
              aria-controls="dashboard-mobile-nav"
              onClick={() => {
                setMenuOpen((open) => !open);
              }}
            >
              {menuOpen ? "Close" : "Menu"}
            </button>
            <Link
              href="/dashboard"
              className="text-sm font-semibold tracking-tight md:hidden"
            >
              Sheet<span className="text-green-600">API</span>
            </Link>
            <div className="ml-auto flex min-w-0 items-center gap-3">
              <div className="min-w-0 text-right leading-tight">
                <p className="truncate text-sm font-medium text-slate-900">
                  {user.name}
                </p>
                <p className="truncate text-xs text-slate-500">{user.email}</p>
              </div>
              <LogoutButton compact />
            </div>
          </div>
          <div
            id="dashboard-mobile-nav"
            className={
              menuOpen
                ? "border-t border-slate-200 px-3 py-3 md:hidden"
                : "hidden"
            }
          >
            <DashboardNavLinks
              pathname={pathname}
              onNavigate={() => {
                setMenuOpen(false);
              }}
            />
          </div>
        </header>

        <main id="dashboard-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
