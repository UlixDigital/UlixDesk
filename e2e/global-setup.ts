import { execSync } from "node:child_process";

export default function globalSetup() {
  execSync("node extension/build.mjs", { stdio: "inherit" });
}
