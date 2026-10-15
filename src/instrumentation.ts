import { invoiceLinkKeyProblem } from "@/lib/invoice-link-guard";

/** Runs once when the Node server starts, including `next dev` and the image. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const problem = invoiceLinkKeyProblem(process.env.INVOICE_LINK_KEY ?? "", process.env.ULIXDESK_APP_HOSTS ?? "");
  if (!problem) return;
  console.error(problem);
  process.exit(1);
}
