import type { MarkdownRenderer } from "vitepress";

// Pages whose tables define environment variables. Matched in every locale
// tree, so `fr/guide/configuration.md` carries the same ids as English.
const ENV_REFERENCE_PAGE = /(^|\/)guide\/(configuration|oidc)\.md$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

export const envAnchorId = (name: string) => `env-${name.toLowerCase().replaceAll("_", "-")}`;

// Markdown table cells can't carry `{#id}`, so readers clicking a variable
// mentioned in another guide had nowhere to land (#5095). This gives each
// table row whose first cell is just `NAME` an `env-name` id on that cell.
// The ids come from the variable name, which is never translated, so links
// stay the same across all locales.
export function envAnchors(md: MarkdownRenderer) {
  md.core.ruler.push("env_anchors", (state) => {
    if (!ENV_REFERENCE_PAGE.test(String(state.env?.relativePath ?? ""))) return;
    const { tokens } = state;
    let firstCell = false;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === "tr_open") firstCell = true;
      if (token.type !== "td_open" || !firstCell) continue;
      firstCell = false;
      const children = tokens[i + 1]?.children ?? [];
      const [code] = children;
      if (children.length !== 1 || code.type !== "code_inline" || !ENV_NAME.test(code.content)) {
        continue;
      }
      token.attrSet("id", envAnchorId(code.content));
    }
  });
}
