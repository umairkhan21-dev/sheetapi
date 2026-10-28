"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="bg-white">
      <a
        href="#main"
        className={`sr-only bg-white px-4 py-2 text-sm font-semibold text-slate-900 focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 ${focusClass}`}
      >
        Skip to main content
      </a>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Home" className={`text-xl font-bold ${focusClass}`}>
          Sheet<span className="text-green-600">API</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 lg:flex">
          <HeaderLinks />
        </nav>

        <button
          type="button"
          className={`rounded-full px-3 py-2 text-sm font-semibold text-slate-700 lg:hidden ${focusClass}`}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen((current) => !current)}
        >
          Toggle navigation
        </button>
      </div>

      {open ? (
        <nav
          id="mobile-navigation"
          aria-label="Primary"
          className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pb-6 sm:px-6 lg:hidden"
        >
          <HeaderLinks />
        </nav>
      ) : null}
    </header>
  );
}

function HeaderLinks() {
  return (
    <>
      <Link
        href="/docs"
        className={`text-sm text-slate-600 hover:text-slate-900 ${focusClass}`}
      >
        Docs
      </Link>
      <Link
        href="/login"
        className={`text-sm text-slate-600 hover:text-slate-900 ${focusClass}`}
      >
        Login
      </Link>
      <Link
        href="/register"
        className={`rounded-full bg-gradient-to-r from-green-500 to-green-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_15px_-3px_rgb(22_163_74/0.25),0_4px_6px_-4px_rgb(22_163_74/0.25)] hover:from-green-600 hover:to-green-700 ${focusClass}`}
      >
        Get Started
      </Link>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-100 bg-white px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2">
        <div>
          <p className="font-display text-lg font-medium text-slate-900">
            Sheet<span className="text-green-600">API</span>
          </p>
          <p className="mt-3 text-sm text-slate-500">
            © 2026 SheetAPI. All rights reserved.
          </p>
        </div>
        <nav aria-label="Legal and documentation" className="flex flex-col gap-3 text-sm text-slate-600">
          <Link href="/docs" className={`hover:text-green-700 ${focusClass}`}>
            Documentation
          </Link>
          <Link href="/privacy" className={`hover:text-green-700 ${focusClass}`}>
            Privacy
          </Link>
          <Link href="/terms" className={`hover:text-green-700 ${focusClass}`}>
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function PublicPage({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-20 sm:px-6 sm:py-32">
        <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-base leading-6 text-slate-600">{lede}</p>
        <div className="mt-10 space-y-10 text-base leading-6 text-slate-700">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function PageSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2
        id={id}
        className="font-display text-3xl font-medium tracking-tight text-slate-900"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
