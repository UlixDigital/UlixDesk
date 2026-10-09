export const PROJECT_NAME_MAX = 200;
export const DESCRIPTION_MAX = 2000;

export type ProjectFormValues = {
  name: string;
  description: string;
  clientId: string;
  billable: boolean;
};

export type ProjectFieldErrors = {
  name?: string;
  description?: string;
  clientId?: string;
  form?: string;
};

export type ProjectFormState = {
  errors: ProjectFieldErrors;
  values: ProjectFormValues;
};

export type NormalizedProject = {
  name: string;
  description: string | null;
  clientId: string | null;
  billable: boolean;
};

export const emptyProjectFormValues: ProjectFormValues = {
  name: "",
  description: "",
  clientId: "",
  billable: true,
};

export function parseProjectFormData(formData: FormData): ProjectFormValues {
  const billable = formData.get("billable");
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    clientId: String(formData.get("clientId") ?? ""),
    billable: billable === "on" || billable === "true",
  };
}

export function validateProjectInput(
  input: ProjectFormValues,
):
  | { ok: true; data: NormalizedProject }
  | { ok: false; errors: ProjectFieldErrors; values: ProjectFormValues } {
  const errors: ProjectFieldErrors = {};
  const name = input.name.trim().replace(/\s+/g, " ");

  if (!name) {
    errors.name = "Name is required.";
  } else if (name.length > PROJECT_NAME_MAX) {
    errors.name = `Name must be ${PROJECT_NAME_MAX} characters or fewer.`;
  }

  const description = input.description.trim();
  if (description.length > DESCRIPTION_MAX) {
    errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, values: input };
  }

  const clientId = input.clientId.trim();

  return {
    ok: true,
    data: {
      name,
      description: description || null,
      clientId: clientId || null,
      billable: input.billable,
    },
  };
}
