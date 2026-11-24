import { describe, expect, it } from "vitest";
import { convertCase } from "../../../apps/api/src/lib/convert-case.js";

describe("convertCase", () => {
  it("upper- and lower-cases the whole text", () => {
    expect(convertCase("Hello World", "upper")).toBe("HELLO WORLD");
    expect(convertCase("Hello World", "lower")).toBe("hello world");
  });

  it("follows the locale for letters that case differently", () => {
    expect(convertCase("istanbul", "upper", "tr")).toBe("İSTANBUL");
    expect(convertCase("ISTANBUL", "lower", "tr")).toBe("ıstanbul");
    expect(convertCase("istanbul", "upper")).toBe("ISTANBUL");
  });

  it("expands German sharp s when upper-casing", () => {
    expect(convertCase("straße", "upper", "de")).toBe("STRASSE");
  });

  it("capitalizes the first letter of each sentence and lowers the rest", () => {
    expect(convertCase("hELLO there. HOW are you? fine!  yes", "sentence")).toBe(
      "Hello there. How are you? Fine!  Yes",
    );
  });

  it("starts a new sentence on a new line and skips leading punctuation", () => {
    expect(convertCase('first LINE\nsecond line\n\n  "quoted" start', "sentence")).toBe(
      'First line\nSecond line\n\n  "Quoted" start',
    );
  });

  it("does not start a sentence after a dot inside a word", () => {
    expect(convertCase("visit snapotter.com today. it works", "sentence")).toBe(
      "Visit snapotter.com today. It works",
    );
  });

  it("capitalizes every word in Capitalized Case", () => {
    expect(convertCase("the QUICK brown fox of doom", "capitalized")).toBe(
      "The Quick Brown Fox Of Doom",
    );
  });

  it("keeps minor words lower in Title Case except at the start and end", () => {
    expect(convertCase("the lord OF the rings", "title")).toBe("The Lord of the Rings");
    expect(convertCase("what are you looking at", "title")).toBe("What Are You Looking At");
  });

  it("keeps apostrophes inside a word when capitalizing", () => {
    expect(convertCase("don't stop believin'", "capitalized")).toBe("Don't Stop Believin'");
  });

  it("capitalizes accented and non-Latin words", () => {
    expect(convertCase("élan vital über alles", "capitalized")).toBe("Élan Vital Über Alles");
    expect(convertCase("привет мир", "capitalized")).toBe("Привет Мир");
  });

  it("swaps the case of every letter in inverse case", () => {
    expect(convertCase("Hello World 42", "inverse")).toBe("hELLO wORLD 42");
  });

  it("alternates letters starting lower, skipping non-letters", () => {
    expect(convertCase("alternating case!", "alternating")).toBe("aLtErNaTiNg CaSe!");
  });

  it("joins words for camelCase and PascalCase", () => {
    expect(convertCase("Hello big World", "camel")).toBe("helloBigWorld");
    expect(convertCase("hello big world", "pascal")).toBe("HelloBigWorld");
  });

  it("joins words for snake_case and kebab-case", () => {
    expect(convertCase("Hello big World", "snake")).toBe("hello_big_world");
    expect(convertCase("Hello big World", "kebab")).toBe("hello-big-world");
  });

  it("splits existing identifiers, acronyms and digits into words", () => {
    expect(convertCase("XMLHttpRequest", "snake")).toBe("xml_http_request");
    expect(convertCase("some_value-here.now", "camel")).toBe("someValueHereNow");
    expect(convertCase("version2Update", "kebab")).toBe("version-2-update");
    expect(convertCase("user_id", "pascal")).toBe("UserId");
  });

  it("converts each line on its own for the identifier cases", () => {
    expect(convertCase("first name\nlast name", "snake")).toBe("first_name\nlast_name");
    expect(convertCase("a b\r\nc d", "camel")).toBe("aB\r\ncD");
    expect(convertCase("a b\rc d", "kebab")).toBe("a-b\rc-d");
  });

  it("keeps decomposed accents inside their word", () => {
    const nfd = "\u00c9COLE normale".normalize("NFD");
    expect(convertCase(nfd, "snake")).toBe("\u00e9cole_normale".normalize("NFD"));
  });

  it("starts a sentence after an ellipsis", () => {
    expect(convertCase("wait\u2026 what", "sentence")).toBe("Wait\u2026 What");
  });

  it("leaves text with no letters unchanged where there is nothing to case", () => {
    expect(convertCase("123 !?", "upper")).toBe("123 !?");
    expect(convertCase("--- ...", "snake")).toBe("");
  });

  it("returns the empty string for empty input", () => {
    expect(convertCase("", "title")).toBe("");
  });
});
