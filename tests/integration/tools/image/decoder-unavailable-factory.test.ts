/**
 * #1428: #795 taught the decoders to throw DecoderUnavailableError when a
 * decoder binary is missing, but the factory's image input handler
 * (apps/api/src/modality/image-input.ts) still wrapped every decode failure in
 * a 422 InputValidationError. On a host without libheif-examples or
 * ImageMagick, every factory image tool told the user their file was bad and
 * the operator heard nothing.
 *
 * The missing binary is simulated as a misconfigured host sees it: PATH points
 * at an empty directory, so every decoder spawn fails with ENOENT.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const HEIC = readFixture(fixtures.image.base.heic200);
const ICO = readFixture(fixtures.image.formats("ico"));
const DNG = readFixture(fixtures.image.formats("dng"));

const ORIGINAL_PATH = process.env.PATH;
const emptyBinDir = mkdtempSync(join(tmpdir(), "factory-no-decoders-"));

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
});

afterEach(() => {
  process.env.PATH = ORIGINAL_PATH;
});

afterAll(async () => {
  process.env.PATH = ORIGINAL_PATH;
  rmSync(emptyBinDir, { recursive: true, force: true });
  await testApp.cleanup();
});

function hideDecoderBinaries() {
  process.env.PATH = emptyBinDir;
}

function resizeRequest(file: { filename: string; contentType: string; content: Buffer }) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", ...file },
    { name: "settings", content: JSON.stringify({ width: 32 }) },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/image/resize",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("Factory image input: decoder availability (#1428)", () => {
  it("reports a missing HEIF decoder as 503 ENGINE_UNAVAILABLE, not a 422 bad input", async () => {
    hideDecoderBinaries();

    const res = await resizeRequest({
      filename: "photo.heic",
      contentType: "image/heic",
      content: HEIC,
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("ENGINE_UNAVAILABLE");
  });

  it("reports a missing ImageMagick as 503 ENGINE_UNAVAILABLE for a CLI-decoded format", async () => {
    hideDecoderBinaries();

    const res = await resizeRequest({
      filename: "icon.ico",
      contentType: "image/x-icon",
      content: ICO,
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("ENGINE_UNAVAILABLE");
  });

  it("still processes a file Sharp can read when the CLI decoder is missing", async () => {
    hideDecoderBinaries();

    // DNG is a TIFF container: Sharp's own fallback reads it with no RAW decoder.
    const res = await resizeRequest({
      filename: "photo.dng",
      contentType: "image/x-adobe-dng",
      content: DNG,
    });

    expect([200, 202]).toContain(res.statusCode);
  });

  it("decodes an AV1 image in a mif1 HEIF container via Sharp when heif-dec lacks AV1 (#1462)", async () => {
    const shimDir = mkdtempSync(join(tmpdir(), "factory-heif-av1-shims-"));
    try {
      const heifNoAv1 = `#!/bin/sh
if [ "$1" = "--version" ]; then echo "1.23.4"; exit 0; fi
echo "Could not decode image: No decoding plugin installed for this compression format" >&2
exit 1
`;
      for (const name of ["heif-convert", "heif-dec"]) {
        writeFileSync(join(shimDir, name), heifNoAv1);
        chmodSync(join(shimDir, name), 0o755);
      }
      process.env.PATH = shimDir;

      const mif1Av1 = Buffer.from(readFixture(fixtures.image.formats("avif")));
      const ftypSize = mif1Av1.readUInt32BE(0);
      mif1Av1.write("mif1", 8, 4, "ascii");
      for (let offset = 16; offset + 4 <= ftypSize && offset + 4 <= mif1Av1.length; offset += 4) {
        if (mif1Av1.subarray(offset, offset + 4).toString("ascii") === "avif") {
          mif1Av1.write("mif1", offset, 4, "ascii");
        }
      }

      const res = await resizeRequest({
        filename: "photo.heif",
        contentType: "image/heif",
        content: mif1Av1,
      });

      expect([200, 202], res.body).toContain(res.statusCode);
    } finally {
      rmSync(shimDir, { recursive: true, force: true });
    }
  });

  it("keeps 422 for a corrupt HEIC when the decoder is installed", async () => {
    const corrupt = Buffer.concat([HEIC.subarray(0, 64), Buffer.alloc(4096, 0x5a)]);

    const res = await resizeRequest({
      filename: "broken.heic",
      contentType: "image/heic",
      content: corrupt,
    });

    expect(res.statusCode).toBe(422);
  });

  it("keeps 422 for a corrupt ICO when ImageMagick is installed", async () => {
    const corrupt = Buffer.concat([ICO.subarray(0, 22), Buffer.alloc(2048, 0x5a)]);

    const res = await resizeRequest({
      filename: "broken.ico",
      contentType: "image/x-icon",
      content: corrupt,
    });

    expect(res.statusCode).toBe(422);
  });

  it("reports an ImageMagick without the JXL delegate, and no djxl, as 503 (#1429)", async () => {
    // The only decoder on PATH is an ImageMagick that runs but has no JXL
    // delegate, the stock-Ubuntu situation the issue describes. The factory's
    // pixel-limit preflight reads JXL dimensions through exiftool, so give it
    // one that answers; otherwise its own missing-binary 503 fires first.
    const shimDir = mkdtempSync(join(tmpdir(), "factory-jxl-shims-"));
    try {
      const imagemagick = `#!/bin/sh
if [ "$1" = "--version" ]; then echo "Version: ImageMagick 7"; exit 0; fi
echo "magick: no decode delegate for this image format" >&2
exit 1
`;
      // Both names: an earlier test may have cached either one, and an
      // ImageMagick 6 host caches `convert`.
      const shims = {
        magick: imagemagick,
        convert: imagemagick,
        exiftool: "#!/bin/sh\necho 1\necho 1\n",
      };
      for (const [name, script] of Object.entries(shims)) {
        writeFileSync(join(shimDir, name), script);
        chmodSync(join(shimDir, name), 0o755);
      }
      process.env.PATH = shimDir;

      const res = await resizeRequest({
        filename: "photo.jxl",
        contentType: "image/jxl",
        content: readFixture(fixtures.image.formats("jxl")),
      });

      expect(res.statusCode, res.body).toBe(503);
      expect(res.json().code).toBe("ENGINE_UNAVAILABLE");
      // djxl is the JXL decoder and it's missing, so the 503 names it rather
      // than ImageMagick's delegate.
      expect(res.json().error).toMatch(/could not be started/);
    } finally {
      rmSync(shimDir, { recursive: true, force: true });
    }
  });

  it("reports an ImageMagick security policy block on EPS as 503 ENGINE_UNAVAILABLE (#1461)", async () => {
    const shimDir = mkdtempSync(join(tmpdir(), "factory-eps-policy-shims-"));
    try {
      const imagemagick = `#!/bin/sh
if [ "$1" = "--version" ]; then echo "Version: ImageMagick 7"; exit 0; fi
echo "convert: attempt to perform an operation not allowed by the security policy \\\`EPS' @ error/constitute.c/IsCoderAuthorized/454." >&2
exit 1
`;
      for (const name of ["magick", "convert"]) {
        writeFileSync(join(shimDir, name), imagemagick);
        chmodSync(join(shimDir, name), 0o755);
      }
      process.env.PATH = shimDir;

      const res = await resizeRequest({
        filename: "vector.eps",
        contentType: "application/postscript",
        content: readFixture(fixtures.image.formats("eps")),
      });

      expect(res.statusCode, res.body).toBe(503);
      expect(res.json().code).toBe("ENGINE_UNAVAILABLE");
      expect(res.json().error).toMatch(/policy\.xml/);
    } finally {
      rmSync(shimDir, { recursive: true, force: true });
    }
  });

  it("reports an ImageMagick without Ghostscript on EPS as 503 ENGINE_UNAVAILABLE (#1461)", async () => {
    for (const stderrLine of [
      "convert: FailedToExecuteCommand \\`'gs' -sstdout=%stderr -dQUIET' (32512) @ error/ghostscript-private.h/ExecuteGhostscriptCommand/75.",
      "convert: delegate failed \\`'gs' -q -dQUIET' @ error/delegate.c/InvokeDelegate/1911.",
    ]) {
      const shimDir = mkdtempSync(join(tmpdir(), "factory-eps-gs-shims-"));
      try {
        const imagemagick = `#!/bin/sh
if [ "$1" = "--version" ]; then echo "Version: ImageMagick 7"; exit 0; fi
echo "${stderrLine}" >&2
exit 1
`;
        for (const name of ["magick", "convert"]) {
          writeFileSync(join(shimDir, name), imagemagick);
          chmodSync(join(shimDir, name), 0o755);
        }
        process.env.PATH = shimDir;

        const res = await resizeRequest({
          filename: "vector.eps",
          contentType: "application/postscript",
          content: readFixture(fixtures.image.formats("eps")),
        });

        expect(res.statusCode, res.body).toBe(503);
        expect(res.json().code).toBe("ENGINE_UNAVAILABLE");
      } finally {
        rmSync(shimDir, { recursive: true, force: true });
      }
    }
  });

  it("keeps 422 for a corrupt EPS when ImageMagick and Ghostscript reject the file (#1461)", async () => {
    const shimDir = mkdtempSync(join(tmpdir(), "factory-eps-corrupt-shims-"));
    try {
      const imagemagick = `#!/bin/sh
if [ "$1" = "--version" ]; then echo "Version: ImageMagick 7"; exit 0; fi
echo "GPL Ghostscript 10.05.1: Unrecoverable error, exit code 1" >&2
echo "convert: FailedToExecuteCommand \\\`'gs' -sstdout=%stderr -dQUIET' (256) @ error/ghostscript-private.h/ExecuteGhostscriptCommand/75." >&2
exit 1
`;
      for (const name of ["magick", "convert"]) {
        writeFileSync(join(shimDir, name), imagemagick);
        chmodSync(join(shimDir, name), 0o755);
      }
      writeFileSync(join(shimDir, "gs"), "#!/bin/sh\nexit 0\n");
      chmodSync(join(shimDir, "gs"), 0o755);
      process.env.PATH = shimDir;

      const res = await resizeRequest({
        filename: "broken.eps",
        contentType: "application/postscript",
        content: readFixture(fixtures.image.formats("eps")),
      });

      expect(res.statusCode, res.body).toBe(422);
    } finally {
      rmSync(shimDir, { recursive: true, force: true });
    }
  });
});
