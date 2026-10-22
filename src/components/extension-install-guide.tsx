import { ExtensionGuideFigure } from "@/components/extension-guide-art";
import { extensionInstallGuide } from "@/lib/extension-install-guide.mjs";

export function ExtensionInstallGuide() {
  return (
    <article className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{extensionInstallGuide.title}</h1>
        <p className="text-base leading-7 text-slate-600">{extensionInstallGuide.intro}</p>
      </header>
      <ol className="space-y-8">
        {extensionInstallGuide.steps.map((step, index) => (
          <li key={step.id} className="space-y-3">
            <h2 className="text-xl font-semibold text-ink">
              {index + 1}. {step.title}
            </h2>
            <p className="leading-7 text-slate-600">{step.body}</p>
            <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <ExtensionGuideFigure name={step.figure} />
            </figure>
          </li>
        ))}
      </ol>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-ink">{extensionInstallGuide.update.title}</h2>
        <p className="leading-7 text-slate-600">{extensionInstallGuide.update.body}</p>
        <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ExtensionGuideFigure name={extensionInstallGuide.update.figure} />
        </figure>
      </section>
      <section className="space-y-6">
        <h2 className="text-xl font-semibold text-ink">Troubleshooting</h2>
        {extensionInstallGuide.troubleshooting.map((item) => (
          <div key={item.id} className="space-y-3">
            <h3 className="text-lg font-semibold text-ink">{item.title}</h3>
            <p className="leading-7 text-slate-600">{item.body}</p>
            <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <ExtensionGuideFigure name={item.figure} />
            </figure>
          </div>
        ))}
      </section>
    </article>
  );
}
