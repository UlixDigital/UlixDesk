/**
 * Render one invoice page inside the production image.
 * Uses the vendored DejaVu fonts and pdfkit. No database.
 * Usage: node scripts/render-invoice-sample.mjs [output-path]
 */
import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
import PDFDocument from "pdfkit";

const regular = resolve("assets/fonts/DejaVuSans.ttf");
const bold = resolve("assets/fonts/DejaVuSans-Bold.ttf");
const output = process.argv[2];
const doc = new PDFDocument({ size: "LETTER", margin: 0 });
doc.registerFont("DejaVu", regular);
doc.registerFont("DejaVu-Bold", bold);
doc.font("DejaVu").fontSize(16).text("Invoice LE1175", 28, 84, { lineBreak: false });
doc.font("DejaVu").fontSize(12).text("Ulix Digital", 28, 130, { lineBreak: false });
doc.font("DejaVu-Bold").fontSize(8).text("Total hours", 374, 254, { lineBreak: false });
doc.text("(qty)", 374, 265, { lineBreak: false });
doc.font("DejaVu").fontSize(9).text("Weekly Invoice", 37, 292, { lineBreak: false });
doc.font("DejaVu-Bold").fontSize(9).text("Amount due  $659.25", 430, 340, { lineBreak: false });

const chunks = [];
const done = new Promise((resolvePromise, reject) => {
  doc.on("data", (chunk) => chunks.push(chunk));
  doc.on("error", reject);
  doc.on("end", () => resolvePromise(Buffer.concat(chunks)));
});
doc.end();
const pdf = await done;
if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
  console.error("PDF render did not produce a PDF.");
  process.exit(1);
}
if (!pdf.includes(Buffer.from("DejaVuSans"))) {
  console.error("PDF render did not embed DejaVu Sans.");
  process.exit(1);
}
if (output) {
  await new Promise((resolvePromise, reject) => {
    const stream = createWriteStream(output);
    stream.on("error", reject);
    stream.on("finish", resolvePromise);
    stream.end(pdf);
  });
} else {
  process.stdout.write(pdf);
}
