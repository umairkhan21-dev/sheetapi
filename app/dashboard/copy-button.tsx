"use client";

import { useState } from "react";
import { secondaryButtonClass } from "@/app/dashboard/ui";

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  blockedMessage = "Select the text and copy it. The browser blocked clipboard access.",
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  blockedMessage?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    setError(null);

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
      setError(blockedMessage);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => {
          void copy();
        }}
        className={secondaryButtonClass}
      >
        {copied ? copiedLabel : label}
      </button>
      {error ? (
        <span role="alert" className="text-sm text-red-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}
