"use client";

import { useState } from "react";

const steps = [
  {
    id: "connect",
    number: "01",
    title: "Connect your sheet",
    body: "Connect your Google Sheet securely with your Google account.",
  },
  {
    id: "create",
    number: "02",
    title: "Create your API",
    body: "Select your spreadsheet and create an API endpoint.",
  },
  {
    id: "build",
    number: "03",
    title: "Start building",
    body: "Use your API in websites, apps, scripts, and other projects.",
  },
] as const;

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export function FeatureBand() {
  const [selected, setSelected] = useState<(typeof steps)[number]["id"]>("connect");
  const current = steps.find((step) => step.id === selected) ?? steps[0];

  return (
    <section id="features" className="bg-green-600 px-4 py-20 sm:px-6 sm:py-32 lg:px-8">
      <div className="mx-auto max-w-7xl text-white">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-4xl font-normal tracking-tight sm:text-5xl">
            From spreadsheet to API
          </h2>
          <p className="mt-4 text-base leading-6 text-white">Three simple steps.</p>
        </div>

        <div className="mt-12 grid items-start gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div role="tablist" aria-label="From spreadsheet to API" className="flex flex-col gap-2">
            {steps.map((step) => {
              const active = step.id === current.id;

              return (
                <button
                  key={step.id}
                  type="button"
                  role="tab"
                  id={`feature-tab-${step.id}`}
                  aria-selected={active}
                  aria-controls={`feature-panel-${step.id}`}
                  onClick={() => setSelected(step.id)}
                  className={`rounded-2xl px-4 py-3 text-left text-sm font-semibold ${
                    active ? "bg-white text-slate-900" : "text-white hover:bg-white/10"
                  }`}
                >
                  {step.title}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id={`feature-panel-${current.id}`}
            aria-labelledby={`feature-tab-${current.id}`}
            className="rounded-3xl bg-white p-6 text-slate-900 shadow-xl sm:p-8"
          >
            <p className="text-sm font-semibold text-green-600">{current.number}</p>
            <h3 className="mt-2 text-xl font-semibold">{current.title}</h3>
            <p className="mt-3 text-base leading-6 text-slate-600">{current.body}</p>
            <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200">
              <div className="flex items-center justify-between bg-stone-100 px-4 py-2">
                <p className="text-sm font-medium text-stone-700">Your API</p>
                <p className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-800">
                  GET
                </p>
              </div>
              <p className="border-t border-stone-200 px-4 py-2 font-mono text-xs text-stone-700">
                https://api.sheetapi.dev/v1/products
              </p>
            </div>
            <ul className="mt-4 flex flex-wrap gap-2">
              {methods.map((method) => (
                <li
                  key={method}
                  className="rounded-full bg-green-50 px-3 py-1 font-mono text-xs font-semibold text-green-700"
                >
                  {method}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export function StepFaq() {
  const [open, setOpen] = useState<(typeof steps)[number]["id"]>("connect");

  return (
    <section id="faq" className="bg-white px-4 py-20 sm:px-6 sm:py-32 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <h2 className="font-display text-4xl font-medium tracking-tight text-slate-900 sm:text-5xl">
            From spreadsheet to API
          </h2>
          <p className="mt-4 text-base leading-6 text-slate-600">Three simple steps.</p>
        </div>
        <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
          {steps.map((step) => {
            const expanded = open === step.id;

            return (
              <div key={step.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between py-4 text-left text-base font-semibold text-slate-900"
                  aria-expanded={expanded}
                  onClick={() => setOpen(step.id)}
                >
                  {step.title}
                  <span aria-hidden="true" className="text-green-600">
                    {expanded ? "–" : "+"}
                  </span>
                </button>
                {expanded ? (
                  <p className="pb-4 text-base leading-6 text-slate-600">{step.body}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
