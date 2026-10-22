import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { readBuildIdentity, stampManifest } from "./chrome-version.mjs";
import { installGuideText } from "../src/lib/extension-install-guide.mjs";
import { zipDirectory } from "./zip.mjs";

export async function buildExtension(options = {}) {
  const root = options.root ?? process.cwd();
  const dist = options.dist ?? path.join(root, "extension", "dist");
  const zipPath = options.zipPath ?? path.join(root, "extension", "ulixdesk-extension.zip");
  const metaPath = options.metaPath ?? path.join(root, "extension", "extension-build.json");
  const builtAt = options.builtAt ?? new Date();
  const identity = options.identity ?? readBuildIdentity(options.env);
  const packageVersion =
    options.packageVersion ??
    JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;

  if (!options.skipTypecheck) {
    execSync("npx tsc -p extension/tsconfig.json --noEmit", { stdio: "inherit", cwd: root });
  }

  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  await esbuild.build({
    absWorkingDir: root,
    entryPoints: {
      background: "extension/src/background.ts",
      popup: "extension/src/popup.ts",
      options: "extension/src/options.ts",
    },
    bundle: true,
    format: "esm",
    target: "chrome120",
    outdir: dist,
    legalComments: "none",
  });

  await esbuild.build({
    absWorkingDir: root,
    entryPoints: ["extension/src/extension.css"],
    bundle: true,
    outfile: path.join(dist, "extension.css"),
    legalComments: "none",
  });

  for (const file of ["popup.html", "options.html", "ulix-logo.svg"]) {
    cpSync(path.join(root, "extension", "src", file), path.join(dist, file));
  }

  const manifest = JSON.parse(readFileSync(path.join(root, "extension", "manifest.json"), "utf8"));
  const stamped = stampManifest(manifest, {
    packageVersion,
    buildNumber: identity.buildNumber,
    commit: identity.commit,
  });
  writeFileSync(path.join(dist, "manifest.json"), `${JSON.stringify(stamped, null, 2)}\n`);
  writeFileSync(path.join(dist, "INSTALL.txt"), installGuideText());

  const iconDir = path.join(dist, "icons");
  mkdirSync(iconDir, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    cpSync(
      path.join(root, "extension", "icons", `icon${size}.png`),
      path.join(iconDir, `icon${size}.png`),
    );
  }

  const zip = zipDirectory(dist, builtAt);
  writeFileSync(zipPath, zip);
  const meta = {
    version: stamped.version,
    versionName: stamped.version_name,
    commit: identity.commit,
    builtAt: builtAt.toISOString(),
  };
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`Unpacked extension: ${dist}`);
  console.log(`Extension zip: ${zipPath}`);
  console.log(`Extension version: ${stamped.version_name}`);
  return { dist, zipPath, metaPath, meta };
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  await buildExtension();
}
