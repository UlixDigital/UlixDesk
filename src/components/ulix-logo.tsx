import Image from "next/image";

/**
 * Official Ulix wordmark. The gradient lives in the mark; the wordmark is #1D1D1D.
 * unoptimized is required: the image optimizer is auth-gated (GHSA-2464-fhr4-w9xw).
 */
export function UlixLogo({ height = 48 }: { height?: number }) {
  const width = Math.round((height * 173) / 74);
  return (
    <Image
      src="/ulix-logo.svg"
      alt="Ulix"
      width={width}
      height={height}
      unoptimized
      priority
      style={{ height, width }}
    />
  );
}
