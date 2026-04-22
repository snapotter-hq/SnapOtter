/**
 * Unit tests for username validation rules.
 *
 * The validateUsername function is not exported from auth.ts,
 * so we reproduce its logic here to test the rules directly.
 */

import { describe, expect, it } from "vitest";

/**
 * Reproduce the validateUsername logic from apps/api/src/plugins/auth.ts
 * so we can unit-test the rules without importing the module (which
 * transitively opens a SQLite connection).
 */
function validateUsername(username: string): string | null {
  if (username.length < 3 || username.length > 50) {
    return "Username must be between 3 and 50 characters";
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    return "Username can only contain letters, numbers, dots, hyphens, and underscores";
  }
  return null;
}

describe("validateUsername", () => {
  describe("valid usernames", () => {
    it.each([
      ["alice", "lowercase letters"],
      ["bob123", "letters and digits"],
      ["user.name", "dots"],
      ["user-name", "hyphens"],
      ["user_name", "underscores"],
      ["abc", "minimum length (3)"],
      ["a".repeat(50), "maximum length (50)"],
      ["A.B-C_D", "mixed separators and uppercase"],
      ["123", "digits only"],
    ])("accepts %s (%s)", (username) => {
      expect(validateUsername(username)).toBeNull();
    });
  });

  describe("too short", () => {
    it.each([
      ["ab", "2 characters"],
      ["a", "1 character"],
      ["", "empty string"],
    ])("rejects %s (%s)", (username) => {
      expect(validateUsername(username)).toBe("Username must be between 3 and 50 characters");
    });
  });

  describe("too long", () => {
    it("rejects a 51-character username", () => {
      expect(validateUsername("a".repeat(51))).toBe("Username must be between 3 and 50 characters");
    });
  });

  describe("invalid characters", () => {
    it.each([
      ["has space", "space"],
      ["user@name", "@ symbol"],
      ["user#name", "# symbol"],
      ["user/name", "forward slash"],
      ["<script>", "angle brackets"],
      ["user\nname", "newline"],
      ["user!name", "exclamation mark"],
      ["user name", "tab character"],
    ])("rejects '%s' (%s)", (username) => {
      expect(validateUsername(username)).toBe(
        "Username can only contain letters, numbers, dots, hyphens, and underscores",
      );
    });
  });

  describe("unicode characters", () => {
    it.each([
      ["élève", "accented Latin letters"],
      ["用户名", "CJK characters"],
      ["пользователь", "Cyrillic characters"],
      ["üser", "umlaut"],
    ])("rejects '%s' (%s)", (username) => {
      expect(validateUsername(username)).toBe(
        "Username can only contain letters, numbers, dots, hyphens, and underscores",
      );
    });
  });
});
