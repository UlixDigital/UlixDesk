"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BuildingIcon, ClockIcon, FolderIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

const items = [
  { href: "/clients", label: "Clients", icon: BuildingIcon },
  { href: "/projects", label: "Projects", icon: FolderIcon },
  { href: "/timesheets", label: "Timesheets", icon: ClockIcon },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1 px-3 pb-4">
      {items.map((item) => {
        const current =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400",
              current
                ? "bg-white/10 text-white"
                : "text-white/75 hover:bg-white/10 hover:text-white",
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
