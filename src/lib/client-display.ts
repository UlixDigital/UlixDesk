export type ClientStatus = "active" | "archived";

export type EmptyStateKind =
  | "no-clients"
  | "no-active"
  | "no-archived"
  | "no-matches";

export function parseClientStatus(value: string | undefined): ClientStatus {
  return value === "archived" ? "archived" : "active";
}

export function clientCountLabel(count: number) {
  return `${count} ${count === 1 ? "client" : "clients"}`;
}

export function matchingClientsLabel(count: number, query: string) {
  return `${clientCountLabel(count)} matching “${query}”`;
}

export function clientsHref(status: ClientStatus, query = "") {
  const params = new URLSearchParams();
  if (status === "archived") params.set("status", "archived");
  const trimmed = query.trim();
  if (trimmed) params.set("q", trimmed);
  const qs = params.toString();
  return qs ? `/clients?${qs}` : "/clients";
}

export function clientSummary(client: {
  emails: string[];
  phone: string | null;
  address: string | null;
}) {
  const parts: string[] = [];

  if (client.emails.length > 0) {
    const visible = client.emails.slice(0, 2).join(", ");
    const extra = client.emails.length - 2;
    parts.push(extra > 0 ? `${visible} +${extra} more` : visible);
  }

  if (client.phone) parts.push(client.phone);

  if (client.address) {
    const oneLine = client.address.replace(/\s+/g, " ").trim();
    if (oneLine) parts.push(oneLine);
  }

  return parts.length > 0 ? parts.join(" · ") : "No contact details yet";
}

export function emptyStateKind(input: {
  status: ClientStatus;
  query: string;
  visibleCount: number;
  otherCount: number;
}): EmptyStateKind | null {
  if (input.visibleCount > 0) return null;
  if (input.query.trim()) return "no-matches";
  if (input.status === "archived") return "no-archived";
  if (input.otherCount > 0) return "no-active";
  return "no-clients";
}
