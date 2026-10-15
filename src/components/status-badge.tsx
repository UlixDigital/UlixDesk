import { cn } from "@/lib/cn";

export function StatusBadge({ status }: { status: "Active" | "Archived" }) {
  const archived = status === "Archived";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        archived
          ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
          : "bg-primary-50 text-accent ring-1 ring-primary-100",
      )}
    >
      {status}
    </span>
  );
}
