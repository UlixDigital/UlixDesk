export default function LoadingTimesheets() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Loading timesheets</span>
      <div className="h-8 w-40 rounded bg-slate-200" />
      <div className="mt-3 h-4 w-72 max-w-full rounded bg-slate-200" />
      <div className="mt-8 h-10 rounded-lg bg-slate-200" />
      <div className="mt-6 h-64 rounded-xl bg-slate-200" />
    </div>
  );
}
