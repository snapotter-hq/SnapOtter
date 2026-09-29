/**
 * The username and role-name rules the server enforces and the settings
 * forms check before sending (#1445). The server's validators read these
 * same constants, so this pins both sides.
 */

import { isValidRoleName, isValidUsername, normalizeRoleName } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

describe("isValidUsername", () => {
  it.each(["abc", "a".repeat(50), "A.B-C_D", "123"])("accepts %j", (username) => {
    expect(isValidUsername(username)).toBe(true);
  });

  it.each([
    ["too short", "ab"],
    ["empty", ""],
    ["too long", "a".repeat(51)],
    ["a space", "jane doe"],
    ["an @", "jane@example.com"],
    ["a slash", "user/name"],
    ["a newline", "user\nname"],
    ["accented letters", "élève"],
    ["CJK", "用户名"],
    ["Cyrillic", "пользователь"],
    // Not trimmed: the server checks the name as sent.
    ["surrounding spaces", " jane "],
  ])("rejects %s", (_case, username) => {
    expect(isValidUsername(username)).toBe(false);
  });
});

describe("role names", () => {
  it("normalizes by trimming and lowercasing, as the server stores them", () => {
    expect(normalizeRoleName("  Content-Editor ")).toBe("content-editor");
  });

  it.each(["ab", "a".repeat(30), "Reviewer", "  reviewer  ", "team_lead-2"])(
    "accepts %j",
    (name) => {
      expect(isValidRoleName(name)).toBe(true);
    },
  );

  it.each([
    ["one character", "x"],
    ["one character after trimming", "  x  "],
    ["too long", "a".repeat(31)],
    ["a space inside", "content editor"],
    ["a dot", "content.editor"],
    ["an accent", "rédacteur"],
  ])("rejects %s", (_case, name) => {
    expect(isValidRoleName(name)).toBe(false);
  });
});
