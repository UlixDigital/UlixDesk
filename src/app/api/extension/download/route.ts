import { authorizeApiRequest, jsonApi } from "@/lib/api-auth";
import { apiCodes, apiError } from "@/lib/api-errors";
import { readExtensionZip } from "@/lib/extension-artifact";

export const dynamic = "force-dynamic";

const missing = "The Chrome extension download isn't built yet.";

export async function GET(request: Request) {
  const actor = await authorizeApiRequest(request, { requireJson: false });
  if (actor instanceof Response) return actor;

  const zip = await readExtensionZip();
  if (!zip) {
    return jsonApi(request, apiError(missing, apiCodes.EXTENSION_NOT_BUILT), 404);
  }

  return new Response(new Uint8Array(zip), {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-length": String(zip.length),
      "content-disposition": 'attachment; filename="ulixdesk-extension.zip"',
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
