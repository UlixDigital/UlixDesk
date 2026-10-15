/** Drop inline scripts. Next's flight payload is base64, and those bytes can spell a currency code. */
export function markupWithoutScripts(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}
