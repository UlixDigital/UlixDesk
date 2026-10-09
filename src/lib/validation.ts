const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export const NAME_MAX = 200;
export const ADDRESS_MAX = 1000;
export const PHONE_MAX = 40;
export const EMAIL_MAX_COUNT = 20;

export type ClientFormValues = {
  name: string;
  address: string;
  phone: string;
  emails: string[];
  emailDraft: string;
};

export type ClientFieldErrors = {
  name?: string;
  address?: string;
  phone?: string;
  emails?: string;
  form?: string;
};

export type ClientFormState = {
  errors: ClientFieldErrors;
  values: ClientFormValues;
};

export type NormalizedClient = {
  name: string;
  address: string | null;
  phone: string | null;
  emails: string[];
};

export const emptyClientFormValues: ClientFormValues = {
  name: "",
  address: "",
  phone: "",
  emails: [],
  emailDraft: "",
};

export function isValidEmail(email: string) {
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function isValidPhone(phone: string) {
  if (phone.length > PHONE_MAX) return false;
  if (!/^[0-9+().\-\s]+$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function normalizeEmails(raw: string[]) {
  const emails: string[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const email = item.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    if (!isValidEmail(email)) {
      return {
        emails: [] as string[],
        error: `"${item.trim()}" is not a valid email address.`,
      };
    }
    seen.add(email);
    emails.push(email);
  }

  if (emails.length > EMAIL_MAX_COUNT) {
    return {
      emails: [] as string[],
      error: `Add up to ${EMAIL_MAX_COUNT} email addresses.`,
    };
  }

  return { emails, error: undefined };
}

export function parseClientFormData(formData: FormData): ClientFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    address: String(formData.get("address") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    emails: formData.getAll("emails").map((value) => String(value)),
    emailDraft: String(formData.get("emailDraft") ?? ""),
  };
}

export function validateClientInput(
  input: ClientFormValues,
):
  | { ok: true; data: NormalizedClient }
  | { ok: false; errors: ClientFieldErrors; values: ClientFormValues } {
  const errors: ClientFieldErrors = {};
  const name = input.name.trim().replace(/\s+/g, " ");

  if (!name) {
    errors.name = "Name is required.";
  } else if (name.length > NAME_MAX) {
    errors.name = `Name must be ${NAME_MAX} characters or fewer.`;
  }

  const address = input.address.trim();
  if (address.length > ADDRESS_MAX) {
    errors.address = `Address must be ${ADDRESS_MAX} characters or fewer.`;
  }

  const phone = input.phone.trim();
  if (phone && !isValidPhone(phone)) {
    errors.phone = "Enter a valid phone number, or leave this blank.";
  }

  const emailResult = normalizeEmails([...input.emails, input.emailDraft]);
  if (emailResult.error) {
    errors.emails = emailResult.error;
  }

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
      values: {
        name: input.name,
        address: input.address,
        phone: input.phone,
        emails: emailResult.error
          ? input.emails.map((email) => email.trim()).filter(Boolean)
          : emailResult.emails,
        emailDraft: emailResult.error ? input.emailDraft : "",
      },
    };
  }

  return {
    ok: true,
    data: {
      name,
      address: address || null,
      phone: phone || null,
      emails: emailResult.emails,
    },
  };
}
