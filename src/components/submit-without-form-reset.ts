import { startTransition, type FormEvent } from "react";

/**
 * React 19 calls form.reset() while committing the result of <form action>.
 * The event system is disabled for that commit, so an onReset handler never
 * runs and cannot cancel the reset. A controlled <select> then falls back to
 * its first option because React does not rewrite defaultSelected.
 * Calling the useActionState dispatch from onSubmit, inside startTransition,
 * does not schedule that reset, so the select, checkbox, and text values stay.
 * The form still sets action to that dispatch. React posts server actions,
 * so a click before hydration does not fall through to a GET that puts the
 * fields in the URL.
 */
export function submitWithoutFormReset(
  event: FormEvent<HTMLFormElement>,
  action: (formData: FormData) => void,
) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  startTransition(() => {
    action(formData);
  });
}
