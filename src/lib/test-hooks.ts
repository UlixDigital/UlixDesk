/**
 * Vitest stands in for the request cookie and headers. Production ignores this.
 */
export const testState: {
  sessionToken: string | null;
  headers: Record<string, string> | null;
} = {
  sessionToken: null,
  headers: null,
};

const userMemo = new Map<string, unknown>();

export function setTestSessionToken(token: string | null) {
  testState.sessionToken = token;
}

export function setTestRequestHeaders(headers: Record<string, string> | null) {
  testState.headers = headers
    ? Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
    : null;
}

export function takeUserMemo<T>(token: string): T | undefined {
  return userMemo.get(token) as T | undefined;
}

export function rememberUser(token: string, user: unknown) {
  userMemo.set(token, user);
}

export function clearRequestTestState() {
  testState.sessionToken = null;
  testState.headers = null;
  userMemo.clear();
}
