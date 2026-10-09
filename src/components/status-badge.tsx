import { cn } from "@/lib/cn";

export function StatusBadge({ status }: { status: "Active" | "Archived" }) {
  const archived = status === "Archived";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        archived
          ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
          : "bg-teal-50 text-teal-800 ring-1 ring-teal-100",
      )}
    >
      {status}
    </span>
  );
}
