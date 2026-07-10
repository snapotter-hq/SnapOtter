// scripts/i18n/lib/claude.mjs
import { buildSystemPrompt } from "./glossary.mjs";
import { mask, restore } from "./mask.mjs";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.I18N_MODEL || "claude-sonnet-5"; // set I18N_MODEL=claude-opus-4-8 for max quality
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Default network sender: one Messages API call, returns the assistant text.
 * @param {{ system: string, text: string }} args
 * @returns {Promise<string>}
 */
async function defaultSend({ system, text }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        system,
        messages: [{ role: "user", content: text }],
      }),
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= MAX_RETRIES) throw new Error(`Messages API failed: ${res.status}`);
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`Messages API failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    return (json.content || []).map((c) => c.text || "").join("");
  }
}

/**
 * Build a translate function: (units, locale) => Promise<Map<id, translatedText>>.
 * `send` is injectable for tests. Each unit is masked before sending and restored after.
 * @param {{ send?: (args: { system: string, text: string }) => Promise<string> }} [opts]
 */
export function makeTranslator({ send = defaultSend } = {}) {
  return async function translate(units, locale) {
    const system = buildSystemPrompt(locale);
    const out = new Map();
    for (const unit of units) {
      const { masked, tokens } = mask(unit.sourceText);
      const raw = await send({ system, text: masked });
      out.set(unit.id, restore(raw, tokens));
    }
    return out;
  };
}
