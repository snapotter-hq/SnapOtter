import { describe, expect, it } from "vitest";
import { redactMessage } from "../../../packages/shared/src/analytics/redact-message.js";

describe("redactMessage (default)", () => {
  it("masks absolute paths", () => {
    expect(redactMessage("ENOENT open /data/uploads/9f/input.bin")).toBe("ENOENT open <path>");
  });
  it("masks a user filename token by known extension", () => {
    expect(redactMessage("cannot read family_photo.JPG")).toBe("cannot read <file>");
  });
  it("keeps a source filename (code extension, not a user file)", () => {
    expect(redactMessage("failed in rounded-crop.ts")).toBe("failed in rounded-crop.ts");
  });
  it("masks a non-ASCII user filename", () => {
    expect(redactMessage("写真.jpg not found")).toBe("<file> not found");
  });
  it("masks a data: URI so base64 content cannot leak", () => {
    expect(redactMessage("bad img data:image/png;base64,iVBORw0KGgoAAAA end")).toBe(
      "bad img <data> end",
    );
  });
  it("masks emails", () => {
    expect(redactMessage("login failed for a.b+x@example.com")).toBe("login failed for <email>");
  });
  it("masks a long quoted literal but keeps the quotes", () => {
    expect(redactMessage(`bad value "this is a long user supplied caption here"`)).toBe(
      `bad value "<value>"`,
    );
  });
  it("masks urls and blob refs, blob before url", () => {
    expect(redactMessage("fetch blob:https://x/y then https://a.b/c")).toBe(
      "fetch <blob> then <url>",
    );
  });
  it("keeps a version string intact", () => {
    expect(redactMessage("torch 2.2.0 cannot access GPU")).toBe("torch 2.2.0 cannot access GPU");
  });
  it("caps length", () => {
    const long = redactMessage("x".repeat(500));
    expect(long.length).toBeLessThanOrEqual(301);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("redactMessage (raw)", () => {
  it("keeps paths and filenames, strips only control chars and caps", () => {
    expect(redactMessage("open /data/x/report.pdf", { raw: true })).toBe("open /data/x/report.pdf");
  });
});

describe("redactMessage adversarial", () => {
  it("masks an IPv4 address (never-collect: IP)", () => {
    expect(redactMessage("connect to 192.168.10.5:5432 refused")).toBe(
      "connect to <ip>:5432 refused",
    );
  });
  it("masks a windows path", () => {
    expect(redactMessage("open C:\\Users\\jane\\photo.png failed")).toBe("open <path> failed");
  });
  it("masks an email inside a long quoted parameter", () => {
    expect(
      redactMessage(`Failed query: update where email = 'averylonguseraddress@example.com'`),
    ).toContain("<email>");
  });
});

describe("redactMessage IPv6 and relative keys", () => {
  it("masks a link-local IPv6 address", () => {
    expect(redactMessage("connect to fe80::1ff:fe23:4567:890a failed")).toBe(
      "connect to <ip> failed",
    );
  });
  it("masks a bracketed IPv6 with port", () => {
    expect(redactMessage("peer [2001:db8::8a2e:370:7334]:443 down")).toBe("peer [<ip>]:443 down");
  });
  it("masks the IPv6 loopback", () => {
    expect(redactMessage("bind ::1 ok")).toBe("bind <ip> ok");
  });
  it("masks a full 8-group IPv6", () => {
    expect(redactMessage("host 2001:db8:0:0:0:0:0:1 up")).toBe("host <ip> up");
  });
  it("still masks IPv4 and leaves versions intact", () => {
    expect(redactMessage("host 10.0.0.1 up")).toBe("host <ip> up");
    expect(redactMessage("torch 2.2.0 ok")).toBe("torch 2.2.0 ok");
  });
  it("masks a relative object-storage key", () => {
    expect(redactMessage("ENOENT uploads/3f2a/input.bin missing")).toBe("ENOENT <path> missing");
    expect(redactMessage("wrote outputs/9b7c/result.dat")).toBe("wrote <path>");
  });
  it("does not mangle C++/Rust scope resolution", () => {
    expect(redactMessage("terminate called: std::bad_alloc")).toBe(
      "terminate called: std::bad_alloc",
    );
    expect(redactMessage("panic in core::result::unwrap")).toBe("panic in core::result::unwrap");
  });
});
