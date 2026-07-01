import { describe, expect, it } from "vitest";
import { promptVariantForSource, surveyIdForSource } from "@/lib/feedback";

describe("feedback search_miss mappings", () => {
  it("maps the search_miss source to its survey id", () => {
    expect(surveyIdForSource("search_miss")).toBe("search-miss-v1");
  });

  it("defaults the search_miss prompt variant to the empty-results entry point", () => {
    expect(promptVariantForSource("search_miss")).toBe("search-empty-v1");
  });
});
