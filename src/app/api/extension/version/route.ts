import { jsonApi, optionsResponse } from "@/lib/api-auth";
import { readExtensionBuild } from "@/lib/extension-artifact";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  const build = await readExtensionBuild();
  if (!build) {
    return jsonApi(request, { available: false }, 404);
  }
  return jsonApi(request, {
    available: true,
    version: build.version,
    versionName: build.versionName,
    builtAt: build.builtAt,
    commit: build.commit,
  });
}
