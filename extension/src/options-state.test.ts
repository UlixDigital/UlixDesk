import { describe, expect, it } from "vitest";
import { optionsCopy } from "./copy";
import { describeGrant, describeSave, describeTestConnection } from "./options-state";

const serverUrl = "http://127.0.0.1:3000";
const token = "ulixdesk_secret";

describe("options status", () => {
  it("describes save, grant, and each test connection result", () => {
    expect(describeSave({ serverUrl: "", token: "" })).toEqual({
      tone: "error",
      message: optionsCopy.missingFields,
    });
    expect(describeSave({ serverUrl: "notaurl", token })).toEqual({
      tone: "error",
      message: optionsCopy.invalidUrl,
    });
    expect(describeSave({ serverUrl, token })).toEqual({
      tone: "success",
      message: optionsCopy.saved,
    });

    expect(describeGrant({ serverUrl: "ftp://files", granted: true })).toEqual({
      tone: "error",
      message: optionsCopy.invalidUrl,
    });
    expect(describeGrant({ serverUrl, granted: false })).toEqual({
      tone: "error",
      message: optionsCopy.grantDenied,
    });
    expect(describeGrant({ serverUrl, granted: true })).toEqual({
      tone: "success",
      message: optionsCopy.granted,
    });

    expect(
      describeTestConnection({ serverUrl, token: "", permission: false, result: null }),
    ).toEqual({ tone: "error", message: optionsCopy.missingFields });
    expect(
      describeTestConnection({ serverUrl, token, permission: false, result: null }),
    ).toEqual({ tone: "error", message: optionsCopy.needPermission });
    expect(
      describeTestConnection({
        serverUrl,
        token,
        permission: true,
        result: { ok: true, projects: [] },
      }),
    ).toEqual({ tone: "success", message: optionsCopy.connected });
    expect(
      describeTestConnection({
        serverUrl,
        token,
        permission: true,
        result: { ok: false, reason: "unauthorized", message: "no" },
      }),
    ).toEqual({ tone: "error", message: optionsCopy.tokenRejected });
    expect(
      describeTestConnection({
        serverUrl,
        token,
        permission: true,
        result: { ok: false, reason: "unreachable" },
      }),
    ).toEqual({ tone: "error", message: optionsCopy.unreachable });
    expect(
      describeTestConnection({
        serverUrl,
        token,
        permission: true,
        result: { ok: false, reason: "http", status: 500, message: "Down" },
      }),
    ).toEqual({ tone: "error", message: `${optionsCopy.serverError} Down` });
  });
});
