export default function LoadingClients() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Loading clients</span>
      <div className="mt-6 h-10 rounded-lg bg-slate-200" />
      <div className="mt-6 h-64 rounded-xl bg-slate-200" />
    </div>
  );
}
