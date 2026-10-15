export const ui = {
  primaryButton:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-primary-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60",
  secondaryButton:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-300 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  dangerButton:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-rose-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:cursor-not-allowed disabled:opacity-60",
  input:
    "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink shadow-sm placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30",
  inputError: "border-rose-400 focus:border-rose-600 focus:ring-rose-600/20",
};

/**
 * Border color is applied on its own. `border-slate-300` and `border-rose-400`
 * in the same class string fight in the stylesheet, and the default wins.
 */
export function textInputClass(invalid: boolean) {
  return [
    "block w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2",
    invalid ? ui.inputError : "border-slate-300 focus:border-accent focus:ring-accent/30",
  ].join(" ");
}
