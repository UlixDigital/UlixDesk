/**
 * next/image must set unoptimized.
 * The image optimizer is auth-gated. GHSA-2464-fhr4-w9xw is an unauthenticated
 * RCE when SVG reaches /_next/image, so the browser has to load the file directly.
 */
const noOptimizedImage = {
  meta: {
    type: "problem",
    docs: {
      description: "Require unoptimized on next/image because the optimizer is auth-gated.",
    },
    schema: [],
    messages: {
      missing:
        "next/image must set unoptimized. The image optimizer is auth-gated (GHSA-2464-fhr4-w9xw).",
    },
  },
  create(context) {
    /** @type {Set<string>} */
    const imageNames = new Set();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "next/image") return;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportDefaultSpecifier" || specifier.type === "ImportSpecifier") {
            imageNames.add(specifier.local.name);
          }
        }
      },
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier" || !imageNames.has(node.name.name)) return;
        const attribute = node.attributes.find(
          (item) => item.type === "JSXAttribute" && item.name?.name === "unoptimized",
        );
        if (!attribute || isExplicitlyFalse(attribute)) {
          context.report({ node, messageId: "missing" });
        }
      },
    };
  },
};

export default noOptimizedImage;

function isExplicitlyFalse(attribute) {
  const value = attribute.value;
  if (!value || value.type !== "JSXExpressionContainer") return false;
  return value.expression.type === "Literal" && value.expression.value === false;
}
