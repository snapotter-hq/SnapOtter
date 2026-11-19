import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.js";

// #4447 wrote nine localized docs pages in another locale's language (Dutch
// under ja/, Indonesian under es/, fr/ and hi/). They carried the current
// source hash, so i18n:check and the import validator both passed them (#4506).
// Neither looks at which language a page is in, so this test does.

const DOCS_ROOT = join(process.cwd(), "apps", "docs");

// Share of letters that must be in the locale's own script. Pages in another
// language score near zero; real pages can be heavily code-mixed (hi's
// supported-formats page keeps English headings and sits at 16%).
const SCRIPTS: Record<string, RegExp> = {
  ar: /\p{Script=Arabic}/u,
  hi: /\p{Script=Devanagari}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  ko: /\p{Script=Hangul}/u,
  ru: /\p{Script=Cyrillic}/u,
  th: /\p{Script=Thai}/u,
  uk: /\p{Script=Cyrillic}/u,
  "zh-CN": /\p{Script=Han}/u,
  "zh-TW": /\p{Script=Han}/u,
};
const MIN_SCRIPT_SHARE = 0.1;

// Letters or characters only one locale of a same-script pair uses. Russian
// under uk/ or Traditional under zh-CN/ would pass the script share alone.
// Fewer hits than this is noise from quoted names.
const MIN_SIBLING_HITS = 5;
const SIBLING_MARKERS: Record<string, { own: RegExp; other: RegExp }> = {
  ru: { own: /[ыэъё]/giu, other: /[іїєґ]/giu },
  uk: { own: /[іїєґ]/giu, other: /[ыэъё]/giu },
  "zh-CN": {
    own: /[这为个们说时会对发认过还经现应该实]/gu,
    other: /[這為個們說時會對發認過還經現應該實]/gu,
  },
  "zh-TW": {
    own: /[這為個們說時會對發認過還經現應該實]/gu,
    other: /[这为个们说时会对发认过还经现应该实]/gu,
  },
};

// Short lists of each Latin-script language's commonest function words. `en`
// is never a docs locale here; it is a rival so an untranslated page fails.
const STOPWORDS: Record<string, string[]> = {
  en: "the and of to is with for that this are when you your it be or not from by which".split(" "),
  de: "der die das und ist nicht mit für auf ein eine den dem wird sie wenn oder auch sich werden".split(
    " ",
  ),
  es: "el los las que y una por para con del al como se su está puede cuando más este esta".split(
    " ",
  ),
  fr: "le les des et une est pour dans qui pas sur aux du vous ce avec sont cette leur peut".split(
    " ",
  ),
  id: "yang dan dari untuk dengan ini itu tidak akan pada atau bisa jika anda juga saat".split(" "),
  it: "il gli di che per non del della è sono nel alla delle viene questo anche può".split(" "),
  nl: "het een van niet voor wordt worden naar ook zijn bij deze als je maar wanneer".split(" "),
  pl: "się nie jest że dla przez lub czy są jeśli oraz aby już jak po".split(" "),
  "pt-BR": "os um não da dos das é ao você são pelo pela também uma".split(" "),
  sv: "och att det som är för med på inte av till har kan eller när".split(" "),
  tr: "ve bir bu için ile olarak değil daha gibi veya olan eğer ancak".split(" "),
  vi: "của và là các có không được cho trong một này với khi để những".split(" "),
};
const STOPWORD_SETS = Object.fromEntries(
  Object.entries(STOPWORDS).map(([lang, words]) => [lang, new Set(words)]),
);
// Another language must outscore the locale's own by this factor, with at
// least MIN_RIVAL_HITS hits, so table-heavy pages with little prose pass.
const RIVAL_FACTOR = 2;
const MIN_RIVAL_HITS = 15;

function listMarkdown(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) return listMarkdown(abs);
    return name.endsWith(".md") ? [abs] : [];
  });
}

// The translated prose: the frontmatter description plus the body, without
// code, link targets, anchors, URLs or HTML, which stay in English everywhere.
// Table rows go too: format and preset tables are mostly names and extensions.
function proseOf(markdown: string): string {
  const fm = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  const description = fm?.[1].match(/^description:\s*(.*)$/m)?.[1] ?? "";
  const body = fm ? markdown.slice(fm[0].length) : markdown;
  return `${description}\n${body}`
    .replace(/(```|~~~)[\s\S]*?\1/g, " ")
    .replace(/^\s*\|.*$/gm, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/\{#[^}]*\}/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[^>]+>/g, " ");
}

function languageProblem(locale: string, markdown: string): string | null {
  const prose = proseOf(markdown);
  const script = SCRIPTS[locale];
  if (script) {
    const letters = prose.match(/\p{L}/gu) ?? [];
    if (letters.length === 0) return null;
    const own = letters.filter((ch) => script.test(ch)).length;
    const share = own / letters.length;
    if (share < MIN_SCRIPT_SHARE) {
      return `only ${(share * 100).toFixed(0)}% of letters are in the ${locale} script`;
    }
    const kana = prose.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0;
    if (locale === "ja" && kana === 0) return "no kana, so not Japanese";
    // Japanese is mostly Han too, so only kana tells it apart from Chinese.
    if (locale.startsWith("zh-") && kana > own * 0.05) return "kana throughout, so Japanese";
    const markers = SIBLING_MARKERS[locale];
    if (markers) {
      const ownHits = prose.match(markers.own)?.length ?? 0;
      const otherHits = prose.match(markers.other)?.length ?? 0;
      if (otherHits >= MIN_SIBLING_HITS && otherHits > ownHits * RIVAL_FACTOR) {
        return `${otherHits} sibling-locale markers against ${ownHits} of its own`;
      }
    }
    return null;
  }

  const ownSet = STOPWORD_SETS[locale];
  if (!ownSet) return `no language check defined for ${locale}`;
  const scores: Record<string, number> = {};
  for (const word of prose.toLowerCase().match(/\p{L}+/gu) ?? []) {
    for (const [lang, set] of Object.entries(STOPWORD_SETS)) {
      if (set.has(word)) scores[lang] = (scores[lang] ?? 0) + 1;
    }
  }
  const own = scores[locale] ?? 0;
  const [rival, rivalHits] = Object.entries(scores)
    .filter(([lang]) => lang !== locale)
    .sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  if (rivalHits >= MIN_RIVAL_HITS && rivalHits > own * RIVAL_FACTOR) {
    return `reads as ${rival} (${rivalHits} stopword hits against ${own} for ${locale})`;
  }
  return null;
}

const LOCALES = SUPPORTED_LOCALES.map((l) => l.code).filter((code) => code !== "en");

describe("localized docs pages are in their own language (#4506)", () => {
  it("defines a check for every docs locale", () => {
    const unchecked = LOCALES.filter((code) => !SCRIPTS[code] && !STOPWORD_SETS[code]);
    expect(unchecked).toEqual([]);
  });

  it("flags a page written in another locale's language", () => {
    const dutch =
      "---\ndescription: Alle omgevingsvariabelen met standaardwaarden.\n---\n\n# Configuratie\n\n" +
      "Alle configuratie verloopt via omgevingsvariabelen. Elke variabele heeft een zinvolle standaardwaarde, " +
      "dus het werkt direct zonder dat je iets hoeft in te stellen. Als je een waarde wilt wijzigen, zet je " +
      "deze in het bestand. Het is niet nodig om de container opnieuw te bouwen, maar wel om deze te herstarten " +
      "wanneer je een variabele van het systeem wijzigt. Voor de database wordt een eigen rol gebruikt, en deze " +
      "rol kan niet worden gewijzigd. Het bestand wordt bij het opstarten gelezen en ook bij een herstart van de " +
      "container. Een waarde die niet geldig is wordt geweigerd, en de app start dan niet op.\n";
    expect(languageProblem("ja", dutch)).toMatch(/script/);
    expect(languageProblem("fr", dutch)).toMatch(/reads as nl/);
    expect(languageProblem("nl", dutch)).toBeNull();
  });

  it("flags Russian under uk and Traditional Chinese under zh-CN", () => {
    const russian =
      "Это объём работы, который съёмка займёт. Мы ещё это обсудим, если вы этого захотите.";
    expect(languageProblem("uk", russian)).toMatch(/sibling/);
    const traditional =
      "這個設定會對所有使用者發生作用，們應該認為這是現在的實際設定，還要經過說明時間。";
    expect(languageProblem("zh-CN", traditional)).toMatch(/sibling/);
  });

  it("flags Japanese under zh-TW", () => {
    const japanese =
      "この設定はすべてのユーザーに適用されます。現在の値を確認してから、時間をかけて変更してください。";
    expect(languageProblem("zh-TW", japanese)).toMatch(/Japanese/);
    expect(languageProblem("ja", japanese)).toBeNull();
  });

  it("finds every localized page in its locale's language", () => {
    const problems: string[] = [];
    let pages = 0;
    for (const locale of LOCALES) {
      for (const file of listMarkdown(join(DOCS_ROOT, locale))) {
        pages += 1;
        const problem = languageProblem(locale, readFileSync(file, "utf8"));
        if (problem) problems.push(`${relative(DOCS_ROOT, file)}: ${problem}`);
      }
    }
    expect(pages).toBeGreaterThan(1000);
    expect(problems).toEqual([]);
  });
});
