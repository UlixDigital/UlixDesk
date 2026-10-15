import { twMerge } from "tailwind-merge";

/** Joins class names. Later utilities win, so an error border replaces the default border. */
export function cn(...parts: Array<string | false | null | undefined>) {
  return twMerge(parts.filter((part): part is string => Boolean(part)));
}
