export function PermissionNote({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <h1 className="text-xl font-semibold text-ink">{message}</h1>
    </div>
  );
}
