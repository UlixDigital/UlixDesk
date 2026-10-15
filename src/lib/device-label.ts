export const DEVICE_LABEL_MAX = 80;

/** A short device label from a User-Agent. The raw header is not stored. */
export function deviceLabelFromUserAgent(userAgent: string | null) {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /CrOS/.test(ua)
          ? "ChromeOS"
          : /Mac OS X/.test(ua)
            ? "macOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "this computer";
  const label = `${browser} on ${os}`;
  return label.length > DEVICE_LABEL_MAX ? label.slice(0, DEVICE_LABEL_MAX) : label;
}
