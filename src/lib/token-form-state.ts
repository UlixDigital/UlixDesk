export type CreateTokenState = {
  errors: { name?: string; form?: string };
  values: { name: string };
  token: string | null;
  tokenName: string | null;
};

/**
 * Lives outside the server-actions module. A "use server" file can only
 * export async functions, so a constant defined there is not this object
 * in the browser.
 */
export const emptyCreateTokenState: CreateTokenState = {
  errors: {},
  values: { name: "" },
  token: null,
  tokenName: null,
};
