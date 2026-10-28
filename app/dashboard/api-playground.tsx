"use client";

import { useRef, useState } from "react";
import { ApiKeys, type RevealedApiKey } from "@/app/dashboard/api-keys";
import {
  fieldClass,
  labelClass,
  secondaryButtonClass,
} from "@/app/dashboard/ui";
import {
  buildPlaygroundRequest,
  formatPlaygroundBody,
  isPlaygroundMethodSupported,
  PLAYGROUND_DEFAULT_BODY,
  PLAYGROUND_DEFAULT_METHOD,
  PLAYGROUND_DELETE_CONFIRM_MESSAGE,
  PLAYGROUND_DESCRIPTION,
  PLAYGROUND_DOCS_LABEL,
  PLAYGROUND_METHODS,
  PLAYGROUND_MISSING_KEY_MESSAGE,
  PLAYGROUND_SELECTOR_HELP,
  PLAYGROUND_SELECTOR_LABEL,
  playgroundAuthorization,
  playgroundMethodUsesBody,
  readPlaygroundError,
  readPlaygroundMethod,
  redactPlaygroundSecret,
  type PlaygroundMethod,
} from "@/lib/api-playground";

type PlaygroundResult = {
  status: number;
  elapsedMs: number;
  body: string;
  error: string | null;
};

const runButtonClass =
  "inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:shrink-0";

export function ApiDetailTools({
  apiId,
  endpoint,
}: {
  apiId: number;
  endpoint: string;
}) {
  const [revealed, setRevealed] = useState<RevealedApiKey | null>(null);

  return (
    <>
      <ApiKeys apiId={apiId} onRevealedChange={setRevealed} />
      <ApiPlayground endpoint={endpoint} revealed={revealed} />
    </>
  );
}

function ApiPlayground({
  endpoint,
  revealed,
}: {
  endpoint: string;
  revealed: RevealedApiKey | null;
}) {
  const requestController = useRef<AbortController | null>(null);
  const [method, setMethod] = useState<PlaygroundMethod>(PLAYGROUND_DEFAULT_METHOD);
  const [selector, setSelector] = useState("");
  const [bodyText, setBodyText] = useState(PLAYGROUND_DEFAULT_BODY);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const methodSupported = isPlaygroundMethodSupported(method);
  const request = methodSupported
    ? buildPlaygroundRequest({
        endpoint,
        method,
        selector,
        body: bodyText,
        deleteConfirmed,
      })
    : {
        ok: false as const,
        message: `${method} is not supported yet.`,
      };
  const authorization = playgroundAuthorization(revealed?.secret);
  const showBody = playgroundMethodUsesBody(method);
  const showDeleteConfirm = method === "DELETE";
  const displayUrl = request.ok ? request.request.url : endpoint;

  function clearResponse() {
    requestController.current?.abort();
    requestController.current = null;
    setRunning(false);
    setFormError(null);
    setResult(null);
  }

  async function runRequest() {
    setFormError(null);

    if (!methodSupported) {
      setFormError(`${method} is not supported yet.`);
      return;
    }

    if (!authorization.ok) {
      setFormError(authorization.message);
      return;
    }

    if (!request.ok) {
      setFormError(request.message);
      return;
    }

    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setRunning(true);
    setResult(null);
    const started = performance.now();

    try {
      const response = await fetch(request.request.url, {
        method: request.request.method,
        cache: "no-store",
        credentials: "omit",
        headers: {
          Authorization: authorization.authorization,
          ...request.request.headers,
        },
        body: request.request.body,
        signal: controller.signal,
      });
      const text = await response.text();
      let parsed: unknown = text;

      try {
        parsed = text.length > 0 ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }

      const secret = revealed?.secret ?? "";
      const body =
        typeof parsed === "string"
          ? redactPlaygroundSecret(parsed, secret)
          : redactPlaygroundSecret(formatPlaygroundBody(parsed), secret);
      const error = readPlaygroundError(parsed, response.ok);

      if (controller.signal.aborted) {
        return;
      }

      setResult({
        status: response.status,
        elapsedMs: Math.max(0, Math.round(performance.now() - started)),
        body,
        error:
          error ??
          (typeof parsed === "string" && text.length > 0
            ? "The response was not JSON."
            : null),
      });
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }

      setFormError(
        "The request could not be sent. Check your connection and try again.",
      );
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setRunning(false);
      }
    }
  }

  return (
    <section aria-labelledby="api-playground-heading" className="space-y-4">
      <div>
        <h2
          id="api-playground-heading"
          className="text-base font-semibold text-slate-900"
        >
          API Playground
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
          {PLAYGROUND_DESCRIPTION}
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <div className="sm:w-32">
            <label htmlFor="playground-method" className="sr-only">
              HTTP method
            </label>
            <select
              id="playground-method"
              value={method}
              onChange={(event) => {
                const next = readPlaygroundMethod(event.target.value);

                if (!next) {
                  return;
                }

                setMethod(next);
                setFormError(null);
                setDeleteConfirmed(false);
              }}
              className={`${fieldClass} font-mono`}
            >
              {PLAYGROUND_METHODS.map((item) => (
                <option
                  key={item}
                  value={item}
                  disabled={!isPlaygroundMethodSupported(item)}
                >
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="playground-endpoint" className="sr-only">
              Endpoint URL
            </label>
            <input
              id="playground-endpoint"
              value={displayUrl}
              readOnly
              className={`${fieldClass} truncate bg-slate-50 font-mono text-slate-700`}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              void runRequest();
            }}
            disabled={
              !methodSupported || !authorization.ok || !request.ok || running
            }
            aria-busy={running}
            aria-describedby={
              authorization.ok ? undefined : "playground-key-instruction"
            }
            className={`${runButtonClass} w-full sm:w-auto`}
          >
            {running ? "Running…" : "Run"}
          </button>
        </div>

        <div>
          <label htmlFor="playground-selector" className={labelClass}>
            {PLAYGROUND_SELECTOR_LABEL}
          </label>
          <input
            id="playground-selector"
            value={selector}
            onChange={(event) => {
              setFormError(null);
              setSelector(event.target.value);
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="city/london or row/3"
            aria-describedby="playground-selector-help"
            className={`${fieldClass} mt-1.5 font-mono`}
          />
          <p
            id="playground-selector-help"
            className="mt-1.5 text-sm leading-6 text-slate-600"
          >
            {PLAYGROUND_SELECTOR_HELP}
          </p>
        </div>

        {showBody ? (
          <div>
            <label htmlFor="playground-body" className={labelClass}>
              Request body
            </label>
            <textarea
              id="playground-body"
              value={bodyText}
              onChange={(event) => {
                setFormError(null);
                setBodyText(event.target.value);
              }}
              rows={7}
              spellCheck={false}
              className={`${fieldClass} mt-1.5 font-mono text-sm`}
            />
            <p className="mt-1.5 text-sm text-slate-600">
              {method === "POST"
                ? "JSON object for the new row. Keys must match worksheet headers."
                : method === "PUT"
                  ? "JSON object that replaces the selected row. Omitted columns become blank."
                  : "JSON object with only the fields to change."}
            </p>
          </div>
        ) : null}

        {showDeleteConfirm ? (
          <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">
              DELETE removes one data row from the Google worksheet. Confirm
              before sending.
            </p>
            <label className="flex items-start gap-2 text-sm text-red-900">
              <input
                id="playground-delete-confirm"
                type="checkbox"
                checked={deleteConfirmed}
                onChange={(event) => {
                  setFormError(null);
                  setDeleteConfirmed(event.target.checked);
                }}
                className="mt-1"
              />
              <span>{PLAYGROUND_DELETE_CONFIRM_MESSAGE}</span>
            </label>
          </div>
        ) : null}

        {authorization.ok && revealed ? (
          <p className="text-sm text-slate-600">
            Requests send the new key{" "}
            <span className="font-mono">{revealed.keyPrefix}…</span> as
            Authorization: Bearer. The key stays on this page only.
          </p>
        ) : (
          <p id="playground-key-instruction" className="text-sm text-slate-600">
            {PLAYGROUND_MISSING_KEY_MESSAGE}
          </p>
        )}

        {!methodSupported ? (
          <p role="alert" className="text-sm text-amber-800">
            {method} is not supported yet.
          </p>
        ) : null}

        {!request.ok && methodSupported ? (
          <p role="alert" className="text-sm text-red-700">
            {request.message}
          </p>
        ) : null}

        <div className="border-t border-slate-200 pt-3">
          <a
            href="#playground-selector-help"
            className="text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
          >
            {PLAYGROUND_DOCS_LABEL}
          </a>
        </div>

        {running ? (
          <p role="status" className="text-sm text-slate-600">
            Sending request…
          </p>
        ) : null}

        {formError ? (
          <p role="alert" className="text-sm text-red-700">
            {formError}
          </p>
        ) : null}

        {result ? (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-800">
                Status{" "}
                <span
                  className={
                    result.status >= 400
                      ? "font-semibold text-red-700"
                      : "font-semibold text-emerald-700"
                  }
                >
                  {result.status}
                </span>
                <span className="text-slate-500"> · {result.elapsedMs} ms</span>
              </p>
              <button
                type="button"
                onClick={clearResponse}
                className={`${secondaryButtonClass} w-full sm:w-auto`}
              >
                Clear Response
              </button>
            </div>
            {result.error ? (
              <p role="alert" className="text-sm text-red-700">
                {result.error}
              </p>
            ) : null}
            <pre className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-800">
              {result.body}
            </pre>
          </div>
        ) : null}
      </div>
    </section>
  );
}
