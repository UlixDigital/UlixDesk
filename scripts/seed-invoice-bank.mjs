import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseInvoiceBankFile } from "./invoice-bank-file.mjs";

loadEnvFile(new URL("../.env", import.meta.url));

const file = new URL("../secrets/invoice-bank-details.txt", import.meta.url);
let bankDetails = "";
try {
  bankDetails = parseInvoiceBankFile(readFileSync(file, "utf8"));
} catch {
  console.error(
    "Missing secrets/invoice-bank-details.txt. Copy secrets/invoice-bank-details.example.txt and fill it in. That file stays gitignored.",
  );
  process.exit(1);
}
if (!bankDetails || bankDetails.includes("[not set]")) {
  console.error("secrets/invoice-bank-details.txt still has placeholders. Fill the account fields, then run this again.");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  await prisma.workspaceSettings.upsert({
    where: { id: "workspace" },
    update: { invoiceBankDetails: bankDetails },
    create: {
      id: "workspace",
      invoiceBankDetails: bankDetails,
    },
  });
  console.log("Invoice bank details were saved on the workspace row. The file contents were not printed.");
} finally {
  await prisma.$disconnect();
}

function loadEnvFile(url) {
  let text = "";
  try {
    text = readFileSync(url, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
