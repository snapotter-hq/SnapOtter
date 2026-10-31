import { describe, expect, it } from "vitest";
import { redactMessage } from "../../../packages/shared/src/analytics/redact-message.js";

describe("redactMessage (default)", () => {
  it("masks absolute paths", () => {
    expect(redactMessage("ENOENT open /data/uploads/9f/input.bin")).toBe("ENOENT open <path>");
  });
  it("masks a user filename token by known extension", () => {
    expect(redactMessage("cannot read family_photo.JPG")).toBe("cannot read <file>");
  });
  it("masks a user filename with spaces", () => {
    expect(redactMessage("write failed for My Holiday Photo.jpg")).toBe("write failed for <file>");
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

describe("redactMessage custom roots and media extensions (#4086)", () => {
  it("masks a self-hoster's custom storage root", () => {
    expect(
      redactMessage(
        "Error opening input file /volume1/snapotter-scratch/9f/media/in-0-Q3_Layoffs_v2.wma",
      ),
    ).toBe("Error opening input file <path>");
  });

  it("masks a macOS external volume path", () => {
    expect(redactMessage("open /Volumes/External/photo.png failed")).toBe("open <path> failed");
  });

  it("masks extensionless paths under the self-host roots", () => {
    for (const path of [
      "/volume2/scratch/in-0",
      "/Volumes/External",
      "/private/staging/in-0",
      "/media/9f/in-0",
      "/run/9f/in-0",
      "/storage/9f/in-0",
      "/scratch/9f/in-0",
      "/workspace/9f/in-0",
    ]) {
      expect(redactMessage(`open ${path} failed`)).toBe("open <path> failed");
    }
  });

  it("masks a bare media filename the extension list used to miss", () => {
    expect(redactMessage("cannot read in-0-Q3_Layoffs_v2.wma")).toBe("cannot read <file>");
  });

  it("masks the image formats the old extension list typo missed", () => {
    expect(redactMessage("cannot read scan.heic")).toBe("cannot read <file>");
    expect(redactMessage("cannot read scan.jxl")).toBe("cannot read <file>");
  });

  it("masks a privacy-sensitive private root", () => {
    expect(redactMessage("open /private/tmp/secret.bin failed")).toBe("open <path> failed");
  });

  it("keeps code extensions that collide with media containers", () => {
    expect(redactMessage("failed in vite.config.mts")).toBe("failed in vite.config.mts");
    expect(redactMessage("TypeError: fs.rm is not a function")).toBe(
      "TypeError: fs.rm is not a function",
    );
  });

  it("leaves app routes and source filenames alone", () => {
    expect(redactMessage("GET /api/v1/jobs/123 failed")).toBe("GET /api/v1/jobs/123 failed");
    expect(redactMessage("failed in rounded-crop.ts")).toBe("failed in rounded-crop.ts");
  });
});

describe("redactMessage paths with spaces, unknown roots, and UNC (#4093)", () => {
  it("masks a known-root path whose directory or filename has spaces", () => {
    expect(redactMessage("open /Volumes/My Passport/vacation photo.jpg failed")).toBe(
      "open <path> failed",
    );
    expect(redactMessage("open /data/uploads/9f/Q3 Layoffs final.wma failed")).toBe(
      "open <path> failed",
    );
    expect(redactMessage("open C:\\Users\\Jane Doe\\photo.jpg failed")).toBe("open <path> failed");
  });

  it("masks an unknown-root path with or without an extension", () => {
    expect(redactMessage("scandir /tank/john-nas/outputs failed")).toBe("scandir <path> failed");
    expect(redactMessage("open /tank/My Holiday Video.mp4 failed")).toBe("open <path> failed");
    expect(redactMessage("open /nfs-pool/9f/Jane_Doe_final failed")).toBe("open <path> failed");
  });

  it("masks UNC shares", () => {
    expect(redactMessage("open \\\\fileserver\\media\\My Photo.jpg failed")).toBe(
      "open <path> failed",
    );
    expect(redactMessage("open \\\\fileserver\\share failed")).toBe("open <path> failed");
  });

  it("masks quoted paths that contain spaces", () => {
    expect(redactMessage("open '/data/uploads/9f/Q3 Layoffs.wma' failed")).toBe(
      "open '<path>' failed",
    );
    expect(redactMessage("open `/tank/My Holiday Video.mp4` failed")).toBe("open `<path>` failed");
  });

  it("masks env-style assignments with spaced paths", () => {
    expect(redactMessage("FILES_STORAGE_PATH=/tank/Jane Doe failed")).toBe(
      "FILES_STORAGE_PATH=<path> failed",
    );
  });

  it("masks relative storage keys whose filename has spaces", () => {
    expect(redactMessage("ENOENT uploads/3f2a/My Holiday Photo.jpg missing")).toBe(
      "ENOENT <path> missing",
    );
  });

  it("keeps punctuation outside the mask", () => {
    expect(redactMessage("open /tank/My Holiday Video.mp4. failed")).toBe("open <path>. failed");
  });

  it("masks spaced filenames with parentheses", () => {
    expect(redactMessage("open /tank/photo (1).jpg failed")).toBe("open <path> failed");
    expect(redactMessage("open (/tank/My Holiday Video.mp4)")).toBe("open (<path>)");
  });

  it("does not merge two paths into one mask", () => {
    expect(redactMessage("open /data/file.mp4 and /tmp/other.mp4")).toBe("open <path> and <path>");
    expect(redactMessage("open /tank/My file.wma and /tank/Other file.wma")).toBe(
      "open <path> and <path>",
    );
  });

  it("masks a spaced directory path that ends in a separator", () => {
    expect(redactMessage("open /tank/My Documents/")).toBe("open <path>");
  });

  it("masks extensionless spaced paths under known roots", () => {
    expect(redactMessage("ENOENT /Users/jane/My Documents/tax return 2024")).toBe("ENOENT <path>");
    expect(redactMessage("open /Volumes/My Passport/raw footage")).toBe("open <path>");
    expect(redactMessage("at fn (/data/my app/src/index.js:10:5)")).toBe("at fn (<path>:10:5)");
  });

  it("masks extensionless spaced relative keys", () => {
    expect(redactMessage("ENOENT uploads/3f2a/My Holiday Photo missing")).toBe(
      "ENOENT <path> missing",
    );
    expect(redactMessage("ENOENT outputs/9b7c/final cut/ missing")).toBe("ENOENT <path> missing");
  });

  it("masks extensionless spaced drive and UNC paths", () => {
    expect(redactMessage("open C:\\Users\\Jane Doe\\My Documents\\taxes failed")).toBe(
      "open <path> failed",
    );
    expect(redactMessage("open \\\\fileserver\\share\\My Folder (1)\\raw failed")).toBe(
      "open <path> failed",
    );
    expect(redactMessage("PATH=C:\\Program Files\\SnapOtter\\bin; failed")).toBe(
      "PATH=<path>; failed",
    );
  });

  it("masks filenames containing apostrophes and commas", () => {
    expect(redactMessage("open /tank/John's vacation photo.jpg failed")).toBe("open <path> failed");
    expect(redactMessage("open /Users/jane/Q3 Layoffs, final.wma failed")).toBe(
      "open <path> failed",
    );
  });

  it("masks long and multi-token paths", () => {
    const longName = `${"x".repeat(250)}.mp4`;
    expect(redactMessage(`open /tank/${longName} failed`)).toBe("open <path> failed");
    expect(redactMessage("open /tank/alpha bravo charlie delta echo foxtrot golf.mp4 failed")).toBe(
      "open <path> failed",
    );
  });

  it("leaves quoted MIME types, routes, and prose apostrophes alone", () => {
    expect(redactMessage('unsupported media type "application/json"')).toBe(
      'unsupported media type "application/json"',
    );
    expect(redactMessage("it's a n/a case, isn't it")).toBe("it's a n/a case, isn't it");
    expect(redactMessage("route '/api/v1/jobs/1' failed")).toBe("route '/api/v1/jobs/1' failed");
  });

  it("does not cut directories named with conjunctions or symbols", () => {
    expect(redactMessage("ENOENT /tank/Photos and Videos/raw footage")).toBe("ENOENT <path>");
    expect(redactMessage("ENOENT /mnt/media/Movies and TV/Shows/clip.mkv")).toBe("ENOENT <path>");
    expect(redactMessage("ENOENT /home/jane/Trips to Japan/IMG_1234.jpg")).toBe("ENOENT <path>");
    expect(redactMessage("ENOENT /Volumes/My Passport/Photos & Videos/raw")).toBe("ENOENT <path>");
  });

  it("keeps a colon reason or a trailing option outside the mask", () => {
    expect(redactMessage("write /data/x: disk full")).toBe("write <path>: disk full");
    expect(redactMessage("open /data/x: stale file handle")).toBe("open <path>: stale file handle");
    expect(redactMessage("ENOENT /data/My Documents - retry")).toBe("ENOENT <path> - retry");
  });

  it("keeps a URL placeholder after a spaced path outside the mask", () => {
    expect(redactMessage("ENOENT /data/My Documents https://example.com/x")).toBe(
      "ENOENT <path> <url>",
    );
    expect(redactMessage("GET https://h/u/p.jpg then /tmp/z and blob:xyz")).toBe(
      "GET <url> then <path> and <blob>",
    );
  });

  it("bounds route allowlist prefixes to whole segments", () => {
    expect(redactMessage("ENOENT /healthcare/patient_Jane_Doe/scan.pdf")).toBe("ENOENT <path>");
    expect(redactMessage("GET /health/live failed")).toBe("GET /health/live failed");
    expect(redactMessage("GET /openapi.yaml failed")).toBe("GET /openapi.yaml failed");
  });

  it("stays linear on a long punctuation run", () => {
    const input = `Error at (/tank/${".".repeat(80_000)}/index.ts)`;
    const start = performance.now();
    redactMessage(input);
    expect(performance.now() - start).toBeLessThan(200);
  });

  it("leaves app routes, public assets, and code filenames alone", () => {
    expect(redactMessage("GET /api/v1/jobs/123 failed")).toBe("GET /api/v1/jobs/123 failed");
    expect(redactMessage("GET /api/v2.1/jobs failed")).toBe("GET /api/v2.1/jobs failed");
    expect(redactMessage("GET /assets/logo.png failed")).toBe("GET /assets/<file> failed");
    expect(redactMessage("failed in rounded-crop.ts")).toBe("failed in rounded-crop.ts");
    expect(redactMessage("failed in vite.config.mts")).toBe("failed in vite.config.mts");
  });
});
