"use client";

import { useState } from "react";
import { invoiceCopy } from "@/lib/invoice-copy";
import { ui } from "@/lib/ui";

export function CopyLinkButton({ url, id = "invoice-client-link" }: { url: string; id?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        id={id}
        readOnly
        value={url}
        aria-label={invoiceCopy.clientLink}
        className={ui.input}
        onFocus={(event) => event.currentTarget.select()}
      />
      <button
        type="button"
        className={ui.secondaryButton}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? invoiceCopy.clientLinkCopied : invoiceCopy.clientLinkCopy}
      </button>
    </div>
  );
}
