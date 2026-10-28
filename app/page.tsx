import type { Metadata } from "next";
import Link from "next/link";
import { FeatureBand, StepFaq } from "@/app/home-sections";
import { SiteFooter, SiteHeader } from "@/app/site-chrome";

export const metadata: Metadata = {
  title: { absolute: "SheetAPI" },
  description:
    "Connect a Google Sheet and read or update its rows through a JSON API.",
};

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600";

const primaryClass = `rounded-full bg-gradient-to-r from-green-500 to-green-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_15px_-3px_rgb(22_163_74/0.25),0_4px_6px_-4px_rgb(22_163_74/0.25)] hover:from-green-600 hover:to-green-700 ${focusClass}`;

const sheetRows = [
  ["1", "Nike Shoes", "2999"],
  ["2", "Adidas Shirt", "1999"],
];

const steps = [
  {
    number: "01",
    title: "Connect your sheet",
    body: "Connect your Google Sheet securely with your Google account.",
  },
  {
    number: "02",
    title: "Create your API",
    body: "Select your spreadsheet and create an API endpoint.",
  },
  {
    number: "03",
    title: "Start building",
    body: "Use your API in websites, apps, scripts, and other projects.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <SiteHeader />
      <main id="main" className="flex-1">
        <section className="relative isolate overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden w-1/2 bg-gradient-to-l from-green-50 to-transparent lg:block" />
          <div className="mx-auto grid max-w-7xl items-center gap-16 px-4 pt-24 pb-20 sm:px-6 md:pt-40 lg:grid-cols-2 lg:gap-x-16 lg:px-8 lg:pb-32">
            <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:max-w-xl lg:text-left">
              <p className="text-sm font-semibold text-green-600">
                Turn spreadsheets into REST APIs
              </p>
              <h1 className="mt-6 font-display text-5xl font-medium tracking-tight text-slate-900 sm:text-7xl sm:leading-[1.1]">
                Your spreadsheet.
                <br />
                <span className="text-green-600 underline decoration-green-600 decoration-4 underline-offset-[0.2em]">
                  Your API.
                </span>
              </h1>
              <p className="mt-6 text-base leading-6 text-slate-600">
                Connect your Google Sheets and turn your spreadsheet data into a
                powerful REST API in minutes. No backend required.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-4 lg:justify-start">
                <Link href="/register" className={primaryClass}>
                  Get Started
                </Link>
                <Link
                  href="/docs"
                  className={`text-sm font-semibold text-slate-900 hover:text-green-700 ${focusClass}`}
                >
                  View Documentation
                </Link>
              </div>
            </div>
            <SheetPreview />
          </div>
        </section>

        <section className="bg-gradient-to-b from-white to-green-100 px-4 py-20 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
                From spreadsheet to API
              </h2>
              <p className="mt-4 text-base leading-6 text-slate-600">Three simple steps.</p>
            </div>
            <StepGrid />
            <div className="mt-12 text-center">
              <Link href="/register" className={primaryClass}>
                Get Started
              </Link>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="bg-gradient-to-b from-green-100 to-white px-4 py-20 sm:px-6 sm:py-32 lg:px-8"
        >
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
                From spreadsheet to API
              </h2>
              <p className="mt-4 text-base leading-6 text-slate-600">Three simple steps.</p>
            </div>
            <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-3xl bg-slate-950 text-left shadow-xl">
              <div className="border-b border-slate-800 px-5 py-3 text-sm text-slate-400">
                Your API
              </div>
              <div className="p-6">
                <p className="text-sm text-slate-400">GET</p>
                <code className="mt-4 block text-sm text-green-400">
                  https://api.sheetapi.dev/v1/products
                </code>
                <pre className="mt-6 overflow-x-auto font-mono text-xs leading-6 text-slate-300">
{`[
  {
    "id": 1,
    "name": "Nike Shoes",
    "price": 2999
  },
  {
    "id": 2,
    "name": "Adidas Shirt",
    "price": 1999
  }
]`}
                </pre>
              </div>
            </div>
            <p className="mt-8 text-center">
              <Link
                href="/docs"
                className={`text-sm font-semibold text-green-600 hover:text-green-700 ${focusClass}`}
              >
                View Documentation
              </Link>
            </p>
          </div>
        </section>

        <FeatureBand />
        <CloseBand />

        <section className="bg-white px-4 py-20 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
                From spreadsheet to API
              </h2>
              <p className="mt-4 text-base leading-6 text-slate-600">Three simple steps.</p>
            </div>
            <StepGrid />
            <div className="mt-16">
              <StepGrid />
            </div>
          </div>
        </section>

        <StepFaq />
        <CloseBand />
      </main>
      <SiteFooter />
    </div>
  );
}

function StepGrid() {
  return (
    <ol className="mt-16 grid gap-8 md:grid-cols-3 lg:gap-12">
      {steps.map((step) => (
        <li key={step.number} className="text-center">
          <p className="text-sm font-semibold text-green-600">{step.number}</p>
          <h3 className="mt-3 text-xl font-semibold text-slate-900">{step.title}</h3>
          <p className="mt-3 text-base leading-6 text-slate-600">{step.body}</p>
          <p className="mt-4">
            <Link
              href="/docs"
              className={`text-sm font-semibold text-green-600 hover:text-green-700 ${focusClass}`}
            >
              View Documentation
            </Link>
          </p>
        </li>
      ))}
    </ol>
  );
}

function CloseBand() {
  return (
    <section className="bg-green-700 px-4 py-20 text-center text-white sm:px-6 sm:py-32 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
          Your spreadsheet.
          <br />
          Your API.
        </h2>
        <p className="mt-4 text-base leading-6 text-white">
          Connect your Google Sheets and turn your spreadsheet data into a
          powerful REST API in minutes. No backend required.
        </p>
        <Link
          href="/register"
          className={`mt-8 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 ${focusClass}`}
        >
          Get Started
        </Link>
      </div>
    </section>
  );
}

function SheetPreview() {
  return (
    <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white text-left shadow-xl">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <p className="text-sm font-medium text-stone-800">Your API</p>
        <p className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-800">
          GET
        </p>
      </div>
      <p className="border-b border-stone-200 px-4 py-2 font-mono text-xs text-stone-700">
        https://api.sheetapi.dev/v1/products
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          <caption className="sr-only">Your API</caption>
          <thead>
            <tr className="bg-stone-100 text-xs text-stone-500">
              <th scope="col" className="w-8 border border-stone-200 px-2 py-1 font-medium" />
              {["A", "B", "C"].map((letter) => (
                <th
                  key={letter}
                  scope="col"
                  className="border border-stone-200 px-3 py-1 text-center font-medium"
                >
                  {letter}
                </th>
              ))}
            </tr>
            <tr>
              <th
                scope="row"
                className="border border-stone-200 bg-stone-100 px-2 py-2 text-center text-xs font-medium text-stone-500"
              >
                1
              </th>
              {["id", "name", "price"].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="border border-stone-200 px-3 py-2 text-left font-medium text-stone-800"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheetRows.map((row, index) => (
              <tr key={row[0]}>
                <th
                  scope="row"
                  className="border border-stone-200 bg-stone-100 px-2 py-2 text-center text-xs font-medium text-stone-500"
                >
                  {index + 2}
                </th>
                {row.map((cell) => (
                  <td
                    key={cell}
                    className={`border border-stone-200 px-3 py-2 text-stone-800 ${
                      cell === "Nike Shoes" ? "outline outline-2 outline-offset-[-2px] outline-green-600" : ""
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-stone-200 bg-slate-950 p-6 text-slate-100">
        <p className="font-mono text-xs text-green-400">GET</p>
        <p className="mt-2 font-mono text-xs text-slate-300">
          https://api.sheetapi.dev/v1/products
        </p>
        <pre className="mt-4 overflow-x-auto font-mono text-xs leading-6 text-slate-300">
{`[
  {
    "id": 1,
    "name": "Nike Shoes",
    "price": 2999
  },
  {
    "id": 2,
    "name": "Adidas Shirt",
    "price": 1999
  }
]`}
        </pre>
      </div>
    </div>
  );
}
