import { popupCopy } from "./copy";

const CHROME_PART = /^(?:0|[1-9]\d*)$/;
const CHROME_PART_MAX = 65535;

/** Chrome versions are up to four integers. Invalid text does not count as newer. */
export function parseChromeVersion(value: string): number[] | null {
  const parts = value.trim().split(".");
  if (parts.length < 1 || parts.length > 4) return null;
  const numbers: number[] = [];
  for (const part of parts) {
    if (!CHROME_PART.test(part)) return null;
    const number = Number(part);
    if (number > CHROME_PART_MAX) return null;
    numbers.push(number);
  }
  return numbers;
}

export function isNewerChromeVersion(serverVersion: string, localVersion: string) {
  const server = parseChromeVersion(serverVersion);
  const local = parseChromeVersion(localVersion);
  if (!server || !local) return false;
  const length = Math.max(server.length, local.length);
  for (let index = 0; index < length; index += 1) {
    const left = server[index] ?? 0;
    const right = local[index] ?? 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return false;
}

export function extensionUpdateNotice(serverVersion: string | null, localVersion: string) {
  if (!serverVersion) return null;
  if (!isNewerChromeVersion(serverVersion, localVersion)) return null;
  return popupCopy.newVersion;
}
