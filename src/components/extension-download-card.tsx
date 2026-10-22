import Link from "next/link";
import { extensionCardCopy } from "@/lib/extension-install-guide.mjs";
import type { ExtensionBuildInfo } from "@/lib/extension-artifact";
import { formatTokenTimestamp } from "@/lib/token-copy";
import { ui } from "@/lib/ui";

export function ExtensionDownloadCard({
  build,
  timeZone,
}: {
  build: ExtensionBuildInfo | null;
  timeZone: string;
}) {
  const built = build ? formatTokenTimestamp(new Date(build.builtAt), timeZone) : null;
  return (
    <section
      id="chrome-extension"
      aria-labelledby="chrome-extension-heading"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,27,45,0.05)] sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h2 id="chrome-extension-heading" className="text-lg font-semibold text-ink">
            {extensionCardCopy.title}
          </h2>
          {build && built ? (
            <dl className="space-y-1 text-sm text-slate-600">
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-ink">Version</dt>
                <dd>
                  {build.version}
                  {build.commit ? (
                    <span className="text-slate-500"> · {build.commit.slice(0, 7)}</span>
                  ) : null}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-ink">Built</dt>
                <dd>
                  <time dateTime={build.builtAt}>{built}</time>
                </dd>
              </div>
            </dl>
          ) : (
            <div role="status" className="space-y-1 text-sm text-slate-600">
              <p>{extensionCardCopy.missing}</p>
              <p>{extensionCardCopy.missingHint}</p>
            </div>
          )}
        </div>
        {build ? (
          <a href="/api/extension/download" className={ui.primaryButton} download="ulixdesk-extension.zip">
            {extensionCardCopy.download}
          </a>
        ) : null}
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-600">
        {extensionCardCopy.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="text-sm leading-6 text-slate-600">{extensionCardCopy.updateNote}</p>
      <Link
        href="/help/extension"
        className="inline-flex text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {extensionCardCopy.guide}
      </Link>
    </section>
  );
}
