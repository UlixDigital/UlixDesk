declare module "@/lib/extension-install-guide.mjs" {
  export const extensionCardCopy: {
    title: string;
    missing: string;
    missingHint: string;
    download: string;
    guide: string;
    steps: string[];
    updateNote: string;
  };

  export const extensionInstallGuide: {
    title: string;
    intro: string;
    steps: Array<{ id: string; title: string; figure: string; body: string }>;
    update: { title: string; figure: string; body: string };
    troubleshooting: Array<{ id: string; title: string; figure: string; body: string }>;
  };

  export function installGuideText(
    guide?: typeof extensionInstallGuide,
  ): string;
}
