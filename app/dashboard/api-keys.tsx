"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { readErrorMessage } from "@/app/dashboard/save-spreadsheet-selection";
import {
  dangerButtonClass,
  fieldClass,
  formatTimestamp,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
} from "@/app/dashboard/ui";

type PublicApiKey = {
  id: number;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type KeyListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; keys: PublicApiKey[] };

type RevealedKey = {
  keyId: number;
  secret: string;
};

export type RevealedApiKey = {
  secret: string;
  keyPrefix: string;
};

export function ApiKeys({
  apiId,
  onRevealedChange,
}: {
  apiId: number;
  onRevealedChange?: (key: RevealedApiKey | null) => void;
}) {
  const [keys, setKeys] = useState<KeyListState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [revealed, setRevealed] = useState<RevealedKey | null>(null);
  const loadRequest = useRef(0);

  useEffect(() => {
    const request = ++loadRequest.current;
    const controller = new AbortController();

    async function load() {
      setKeys({ status: "loading" });

      try {
        const response = await fetch(`/api/apis/${apiId}/keys`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await readJson(response);
        const parsed = readKeyList(payload);

        if (controller.signal.aborted || request !== loadRequest.current) {
          return;
        }

        if (response.ok && parsed) {
          setKeys({ status: "ready", keys: parsed });
          return;
        }

        setKeys({
          status: "error",
          message:
            readErrorMessage(payload) ?? "API keys could not be loaded. Try again.",
        });
      } catch {
        if (controller.signal.aborted || request !== loadRequest.current) {
          return;
        }

        setKeys({
          status: "error",
          message:
            "API keys could not be loaded. Check your connection and try again.",
        });
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [apiId, reloadToken]);

  return (
    <section aria-labelledby="api-keys-heading">
      <h2 id="api-keys-heading" className="text-base font-semibold text-slate-900">
        API keys
      </h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        Create a key for this API, then send it as{" "}
        <span className="font-medium">Authorization: Bearer</span>. The full key
        is shown only once.
      </p>

      <ApiKeyPanel
        apiId={apiId}
        keys={keys.status === "ready" ? keys.keys : []}
        listStatus={keys.status}
        listError={keys.status === "error" ? keys.message : null}
        onRetry={() => setReloadToken((current) => current + 1)}
        revealed={revealed}
        onCreated={(key, secret) => {
          loadRequest.current += 1;
          setRevealed({ keyId: key.id, secret });
          onRevealedChange?.({ secret, keyPrefix: key.keyPrefix });
          setKeys((current) =>
            current.status === "ready"
              ? { status: "ready", keys: [key, ...current.keys] }
              : { status: "ready", keys: [key] },
          );
        }}
        onRevoked={(key) => {
          if (revealed?.keyId === key.id) {
            setRevealed(null);
            onRevealedChange?.(null);
          }

          setKeys((current) =>
            current.status === "ready"
              ? {
                  status: "ready",
                  keys: current.keys.map((item) =>
                    item.id === key.id ? key : item,
                  ),
                }
              : current,
          );
        }}
      />
    </section>
  );
}

function ApiKeyPanel({
  apiId,
  keys,
  listStatus,
  listError,
  onRetry,
  revealed,
  onCreated,
  onRevoked,
}: {
  apiId: number;
  keys: PublicApiKey[];
  listStatus: KeyListState["status"];
  listError: string | null;
  onRetry: () => void;
  revealed: RevealedKey | null;
  onCreated: (key: PublicApiKey, secret: string) => void;
  onRevoked: (key: PublicApiKey) => void;
}) {
  const submitting = useRef(false);
  const [name, setName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingRevokeId, setPendingRevokeId] = useState<number | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copySecret(secret: string) {
    setCopyError(null);

    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError(
        "Copy the key from the field. The browser blocked clipboard access.",
      );
    }
  }

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current) {
      return;
    }

    const trimmed = name.trim();

    if (!trimmed) {
      setSubmitError("Enter a name for this key.");
      return;
    }

    submitting.current = true;
    setCreating(true);
    setSubmitError(null);

    try {
      const response = await fetch(`/api/apis/${apiId}/keys`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: trimmed }),
      });
      const payload = await readJson(response);
      const created = readCreatedKey(payload);

      if (response.ok && created) {
        setName("");
        setCopied(false);
        setCopyError(null);
        onCreated(created.key, created.secret);
        return;
      }

      setSubmitError(
        readErrorMessage(payload) ?? "The API key could not be created. Try again.",
      );
    } catch {
      setSubmitError(
        "The API key could not be created. Check your connection and try again.",
      );
    } finally {
      submitting.current = false;
      setCreating(false);
    }
  }

  async function revokeKey(keyId: number) {
    if (revokingId != null) {
      return;
    }

    setRevokingId(keyId);
    setRevokeError(null);

    try {
      const response = await fetch(`/api/apis/${apiId}/keys/${keyId}/revoke`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await readJson(response);
      const key = readPublicKey(payload);

      if (response.ok && key) {
        setPendingRevokeId(null);
        onRevoked(key);
        return;
      }

      setRevokeError(
        readErrorMessage(payload) ?? "The API key could not be revoked. Try again.",
      );
    } catch {
      setRevokeError(
        "The API key could not be revoked. Check your connection and try again.",
      );
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="mt-4">
      {revealed ? (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
        >
          <p className="font-medium text-amber-950">
            Copy this key now. You will not be able to view it again.
          </p>
          <label htmlFor={`revealed-key-${revealed.keyId}`} className={`${labelClass} mt-3`}>
            New API key
          </label>
          <input
            id={`revealed-key-${revealed.keyId}`}
            readOnly
            value={revealed.secret}
            className={`${fieldClass} mt-1.5 font-mono`}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => {
              void copySecret(revealed.secret);
            }}
            className={`${secondaryButtonClass} mt-3`}
          >
            {copied ? "Copied" : "Copy key"}
          </button>
          {copyError ? (
            <p role="alert" className="mt-2 text-red-700">
              {copyError}
            </p>
          ) : null}
        </div>
      ) : null}

      <form className="mt-4" onSubmit={(event) => void createKey(event)}>
        <label htmlFor={`api-key-name-${apiId}`} className={labelClass}>
          Key name
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id={`api-key-name-${apiId}`}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSubmitError(null);
            }}
            maxLength={80}
            required
            autoComplete="off"
            placeholder="Website"
            className={fieldClass}
          />
          <button
            type="submit"
            disabled={creating}
            aria-busy={creating}
            className={`${primaryButtonClass} w-full sm:w-auto`}
          >
            {creating ? "Creating key…" : "Create key"}
          </button>
        </div>
        {submitError ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {submitError}
          </p>
        ) : null}
      </form>

      {listStatus === "loading" ? (
        <p role="status" className="mt-4 text-sm text-slate-600">
          Loading keys…
        </p>
      ) : null}

      {listStatus === "error" && listError ? (
        <div className="mt-4">
          <p role="alert" className="text-sm text-red-700">
            {listError}
          </p>
          <button type="button" onClick={onRetry} className={`${secondaryButtonClass} mt-3`}>
            Try again
          </button>
        </div>
      ) : null}

      {listStatus === "ready" && keys.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">No API keys yet.</p>
      ) : null}

      {listStatus === "ready" && keys.length > 0 ? (
        <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {keys.map((key) => (
            <li key={key.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-900">{key.name}</p>
                <StatusBadge tone={key.revokedAt ? "neutral" : "success"}>
                  {key.revokedAt ? "Revoked" : "Active"}
                </StatusBadge>
              </div>
              <p className="mt-1 font-mono text-slate-700">{key.keyPrefix}</p>
              <p className="mt-1 text-slate-600">
                Created {formatWhen(key.createdAt)}
              </p>
              <p className="mt-1 text-slate-600">
                {key.lastUsedAt
                  ? `Last used ${formatWhen(key.lastUsedAt)}`
                  : "Not used yet"}
              </p>
              {key.revokedAt ? null : pendingRevokeId === key.id ? (
                <div className="mt-3">
                  <p>Revoke this key? Requests using it will stop working.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void revokeKey(key.id);
                      }}
                      disabled={revokingId === key.id}
                      aria-busy={revokingId === key.id}
                      className={dangerButtonClass}
                    >
                      {revokingId === key.id ? "Revoking…" : "Revoke key"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingRevokeId(null)}
                      disabled={revokingId === key.id}
                      className={secondaryButtonClass}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRevokeError(null);
                    setPendingRevokeId(key.id);
                  }}
                  className={`${secondaryButtonClass} mt-3`}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {revokeError ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {revokeError}
        </p>
      ) : null}
    </div>
  );
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function readKeyList(payload: unknown) {
  if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.keys)) {
    return null;
  }

  const keys: PublicApiKey[] = [];

  for (const item of payload.keys) {
    const key = readKeyFields(item);

    if (!key) {
      return null;
    }

    keys.push(key);
  }

  return keys;
}

function readCreatedKey(payload: unknown) {
  if (!isRecord(payload) || payload.success !== true) {
    return null;
  }

  const key = readKeyFields(payload.key);

  if (!key || !isRecord(payload.key) || typeof payload.key.secret !== "string") {
    return null;
  }

  if (!payload.key.secret.startsWith(key.keyPrefix) || payload.key.secret === key.keyPrefix) {
    return null;
  }

  return { key, secret: payload.key.secret };
}

function readPublicKey(payload: unknown) {
  if (!isRecord(payload) || payload.success !== true) {
    return null;
  }

  return readKeyFields(payload.key);
}

function readKeyFields(value: unknown): PublicApiKey | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "number" ||
    !Number.isSafeInteger(value.id) ||
    typeof value.name !== "string" ||
    typeof value.keyPrefix !== "string" ||
    typeof value.createdAt !== "string" ||
    !isNullableString(value.lastUsedAt) ||
    !isNullableString(value.revokedAt)
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    keyPrefix: value.keyPrefix,
    createdAt: value.createdAt,
    lastUsedAt: value.lastUsedAt,
    revokedAt: value.revokedAt,
  };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatWhen(value: string) {
  return formatTimestamp(value) ?? value;
}
