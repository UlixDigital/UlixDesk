import type { ProjectsResult } from "./api";
import { optionsCopy } from "./copy";
import { isConfigured, normalizeServerUrl } from "./server-url";

export type StatusTone = "success" | "error";

export type StatusMessage = {
  tone: StatusTone;
  message: string;
};

export function describeSave(input: { serverUrl: string; token: string }): StatusMessage | null {
  const parsed = normalizeServerUrl(input.serverUrl);
  if (!input.serverUrl.trim() || !input.token.trim()) {
    return { tone: "error", message: optionsCopy.missingFields };
  }
  if (!parsed.ok) return { tone: "error", message: optionsCopy.invalidUrl };
  return { tone: "success", message: optionsCopy.saved };
}

export function describeGrant(input: {
  serverUrl: string;
  granted: boolean | null;
}): StatusMessage {
  const parsed = normalizeServerUrl(input.serverUrl);
  if (!parsed.ok) return { tone: "error", message: optionsCopy.invalidUrl };
  if (!input.granted) return { tone: "error", message: optionsCopy.grantDenied };
  return { tone: "success", message: optionsCopy.granted };
}

export function describeTestConnection(input: {
  serverUrl: string;
  token: string;
  permission: boolean;
  result: ProjectsResult | null;
}): StatusMessage {
  if (!isConfigured(input)) return { tone: "error", message: optionsCopy.missingFields };
  const parsed = normalizeServerUrl(input.serverUrl);
  if (!parsed.ok) return { tone: "error", message: optionsCopy.invalidUrl };
  if (!input.permission) return { tone: "error", message: optionsCopy.needPermission };
  if (!input.result) return { tone: "error", message: optionsCopy.unexpected };
  if (input.result.ok) return { tone: "success", message: optionsCopy.connected };
  switch (input.result.reason) {
    case "unauthorized":
      return { tone: "error", message: optionsCopy.tokenRejected };
    case "unreachable":
      return { tone: "error", message: optionsCopy.unreachable };
    case "invalid-response":
      return { tone: "error", message: optionsCopy.unexpected };
    case "http":
      return { tone: "error", message: `${optionsCopy.serverError} ${input.result.message}` };
    default:
      return { tone: "error", message: optionsCopy.unexpected };
  }
}
