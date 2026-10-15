"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { logoutAction } from "@/app/login/actions";
import { AppNav } from "@/components/app-nav";
import { UlixLogo } from "@/components/ulix-logo";
import { authCopy } from "@/lib/auth-copy";

export function AppSidebar({
  name,
  role,
  showTeam,
}: {
  name: string;
  role: string;
  showTeam: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <aside className="border-b border-slate-200 bg-white text-ink md:flex md:flex-col md:border-r md:border-b-0">
      <div className="flex items-center justify-between gap-3 px-4 py-4 md:block md:px-5 md:py-5">
        <Link
          href="/clients"
          className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <UlixLogo height={44} />
        </Link>
        <button
          ref={buttonRef}
          type="button"
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-primary-50 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:hidden"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
        >
          {authCopy.menu}
        </button>
      </div>
      <div
        id={panelId}
        ref={panelRef}
        className={open ? "flex flex-col md:flex-1" : "hidden md:flex md:flex-1 md:flex-col"}
      >
        <AppNav showTeam={showTeam} onNavigate={() => setOpen(false)} />
        <div className="mt-2 border-t border-slate-200 px-3 py-4 md:mt-auto">
          <p className="px-3 text-sm font-medium text-ink">{name}</p>
          <p className="px-3 text-xs text-slate-500">{role}</p>
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-primary-50 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {authCopy.signOut}
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
