"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BuildingIcon, ChartIcon, ClockIcon, DocumentIcon, FolderIcon, KeyIcon, UsersIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { reportCopy } from "@/lib/report-copy";

const items = [
  { href: "/clients", label: "Clients", icon: BuildingIcon },
  { href: "/projects", label: "Projects", icon: FolderIcon },
  { href: "/timesheets", label: "Timesheets", icon: ClockIcon },
  { href: "/reports", label: reportCopy.navLabel, icon: ChartIcon },
  { href: "/settings", label: "Settings", icon: KeyIcon },
];

export function AppNav({
  showTeam = false,
  onNavigate,
}: {
  showTeam?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const links = showTeam
    ? [
        ...items.slice(0, 4),
        { href: "/invoices", label: "Invoices", icon: DocumentIcon },
        { href: "/team", label: "Team", icon: UsersIcon },
        items[4],
      ]
    : items;

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1 px-3 pb-4">
      {links.map((item) => {
        const current =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              current
                ? "bg-primary-50 text-accent"
                : "text-slate-600 hover:bg-primary-50 hover:text-accent",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
