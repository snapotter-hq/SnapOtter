import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "@/lib/format";

describe("formatDate", () => {
  it("formats a Date object with en-US locale", () => {
    const date = new Date(2025, 0, 15); // Jan 15, 2025
    const result = formatDate(date, "en-US");
    expect(result).toContain("2025");
    expect(result).toContain("15");
    expect(result).toContain("Jan");
  });

  it("formats an ISO date string", () => {
    const result = formatDate("2024-06-01T00:00:00Z", "en-US");
    expect(result).toContain("2024");
    expect(result).toContain("Jun");
  });

  it("handles different locales", () => {
    const date = new Date(2025, 2, 10); // Mar 10, 2025
    const enResult = formatDate(date, "en-US");
    const deResult = formatDate(date, "de-DE");
    // Both should contain the year, but month formatting may differ
    expect(enResult).toContain("2025");
    expect(deResult).toContain("2025");
  });

  it("formats end-of-year date correctly", () => {
    const result = formatDate("2024-12-15T12:00:00Z", "en-US");
    expect(result).toContain("Dec");
    expect(result).toContain("2024");
  });

  it("formats a numeric epoch timestamp", () => {
    const ts = Date.UTC(2026, 7, 27, 14, 30);
    expect(formatDate(ts, "de")).toBe(formatDate(new Date(ts), "de"));
  });

  it("falls back to English when given a malformed locale tag instead of throwing RangeError", () => {
    const ts = Date.UTC(2026, 7, 27, 14, 30);
    expect(formatDate(ts, "en_US")).toBe(formatDate(ts, "en"));
  });
});

describe("formatDateTime", () => {
  it("includes both date and time components", () => {
    const date = new Date(2025, 0, 15, 14, 30); // Jan 15, 2025 at 14:30
    const result = formatDateTime(date, "en-US");
    expect(result).toContain("2025");
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    // Should contain time portion (format varies by locale)
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it("formats an ISO string with time", () => {
    const result = formatDateTime("2024-07-04T09:15:00Z", "en-US");
    expect(result).toContain("2024");
    expect(result).toContain("Jul");
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it("handles midnight correctly", () => {
    const date = new Date(2025, 5, 1, 0, 0); // Jun 1, 2025 00:00
    const result = formatDateTime(date, "en-US");
    expect(result).toContain("Jun");
    expect(result).toContain("2025");
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it("formats a numeric epoch timestamp", () => {
    const ts = Date.UTC(2026, 7, 27, 14, 30);
    expect(formatDateTime(ts, "de")).toBe(formatDateTime(new Date(ts), "de"));
  });

  it("falls back to English when given a malformed locale tag instead of throwing RangeError", () => {
    const ts = Date.UTC(2026, 7, 27, 14, 30);
    expect(formatDateTime(ts, "en_US")).toBe(formatDateTime(ts, "en"));
  });
});
