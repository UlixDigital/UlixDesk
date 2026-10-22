import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import rule from "../../eslint/no-optimized-image.mjs";

const linter = new Linter({ configType: "flat" });

const config = {
  plugins: {
    ulixdesk: {
      rules: {
        "no-optimized-image": rule,
      },
    },
  },
  languageOptions: {
    ecmaVersion: "latest" as const,
    sourceType: "module" as const,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  rules: {
    "ulixdesk/no-optimized-image": "error" as const,
  },
};

function lint(code: string) {
  return linter.verify(code, config);
}

describe("next/image must stay unoptimized", () => {
  it("rejects a next/image element that can reach the optimizer", () => {
    const missing = lint('import Image from "next/image";\nexport const Logo = () => <Image src="/ulix-logo.svg" alt="Ulix" />;\n');
    expect(missing.map((message) => message.message)).toEqual([
      "next/image must set unoptimized. The image optimizer is auth-gated (GHSA-2464-fhr4-w9xw).",
    ]);

    const turnedOff = lint(
      'import Logo from "next/image";\nexport const Mark = () => <Logo src="/ulix-logo.svg" alt="Ulix" unoptimized={false} />;\n',
    );
    expect(turnedOff).toHaveLength(1);
  });

  it("allows an explicit unoptimized image and ignores other Image components", () => {
    const allowed = lint(
      'import Image from "next/image";\nexport const Logo = () => <Image src="/ulix-logo.svg" alt="Ulix" unoptimized />;\n',
    );
    expect(allowed).toEqual([]);

    const other = lint('import { Image } from "./picture";\nexport const Logo = () => <Image src="/ulix-logo.svg" alt="Ulix" />;\n');
    expect(other).toEqual([]);
  });
});
