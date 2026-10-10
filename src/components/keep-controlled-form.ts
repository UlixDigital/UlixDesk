import type { FormEvent } from "react";

/**
 * React 19 calls form.reset() after a server action finishes.
 * Controlled text inputs survive because React copies `value` onto
 * `defaultValue`. A controlled `<select>` does not set `defaultSelected`,
 * so the native reset returns it to the first option while React state
 * still holds the chosen value. A checkbox can snap back to the initial
 * `defaultChecked` the same way. Cancelling the reset leaves those fields
 * as the user left them, which is what a failed save must do.
 */
export function keepControlledFormValues(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
}
