/**
 * #4422: a tag value over the length cap used to come back as a 422 titled
 * "Metadata edit failed", with the field and limit buried in `details`. The
 * cap is MAX_METADATA_TAG_LENGTH now (0 = unlimited), and the refusal is a 400
 * whose title names the field and the limit.
 */

import multipart from "@fastify/multipart";
import { apiToolPath } from "@snapotter/shared";
import Fastify from "fastify";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import * as exiftoolMod from "../../../apps/api/src/lib/exiftool.js";
import { buildTagArgs, sanitizeTagValue } from "../../../apps/api/src/lib/exiftool.js";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerEditMetadata } from "../../../apps/api/src/routes/tools/edit-metadata.js";

const originalLimit = env.MAX_METADATA_TAG_LENGTH;

afterEach(() => {
  env.MAX_METADATA_TAG_LENGTH = originalLimit;
  vi.restoreAllMocks();
});

describe("MAX_METADATA_TAG_LENGTH (#4422)", () => {
  it("defaults to 10,000 characters", () => {
    expect(originalLimit).toBe(10_000);
  });

  it("refuses an over-limit value with a 400 InputValidationError naming the field and limit", () => {
    let thrown: unknown;
    try {
      sanitizeTagValue("d".repeat(12_000), "ImageDescription");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(InputValidationError);
    expect(thrown).toMatchObject({
      statusCode: 400,
      message:
        'Tag value for "ImageDescription" exceeds maximum length of 10000 characters (MAX_METADATA_TAG_LENGTH)',
    });
  });

  it("honors a raised limit", () => {
    env.MAX_METADATA_TAG_LENGTH = 20_000;
    const value = "d".repeat(12_000);
    expect(sanitizeTagValue(value, "ImageDescription")).toBe(value);
    expect(buildTagArgs({ imageDescription: value })).toContain(`-ImageDescription=${value}`);
  });

  it("reports a lowered limit in the message", () => {
    env.MAX_METADATA_TAG_LENGTH = 5;
    expect(sanitizeTagValue("abcde", "Artist")).toBe("abcde");
    expect(() => sanitizeTagValue("abcdef", "Artist")).toThrow(
      'Tag value for "Artist" exceeds maximum length of 5 characters (MAX_METADATA_TAG_LENGTH)',
    );
  });

  it("treats 0 as unlimited", () => {
    env.MAX_METADATA_TAG_LENGTH = 0;
    const value = "d".repeat(100_000);
    expect(sanitizeTagValue(value, "ImageDescription")).toBe(value);
  });

  it("still strips null bytes when unlimited", () => {
    env.MAX_METADATA_TAG_LENGTH = 0;
    expect(sanitizeTagValue("a\0b", "Artist")).toBe("ab");
  });
});

describe("edit-metadata route refuses an over-limit tag (#4422)", () => {
  let png: Buffer;

  beforeAll(async () => {
    png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#0f0" } })
      .png()
      .toBuffer();
  });

  function multipartBody(settings: Record<string, unknown>) {
    const boundary = "----unit4422";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      png,
      Buffer.from(
        `\r\n--${boundary}\r\nContent-Disposition: form-data; name="settings"\r\n\r\n${JSON.stringify(settings)}\r\n--${boundary}--\r\n`,
      ),
    ]);
    return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
  }

  async function buildApp() {
    const app = Fastify({ logger: false });
    await app.register(multipart);
    registerErrorHandler(app);
    registerEditMetadata(app);
    await app.ready();
    return app;
  }

  it("answers 400 with the field and limit in the error title and never runs ExifTool", async () => {
    const writeSpy = vi.spyOn(exiftoolMod, "writeMetadata");
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: "POST",
        url: apiToolPath("edit-metadata"),
        ...multipartBody({ imageDescription: "d".repeat(12_000) }),
      });
      expect(res.statusCode, res.body).toBe(400);
      expect(res.json()).toMatchObject({
        error:
          'Tag value for "ImageDescription" exceeds maximum length of 10000 characters (MAX_METADATA_TAG_LENGTH)',
      });
      expect(res.json().error).not.toBe("Metadata edit failed");
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("fails a pipeline or batch step with the same 400 InputValidationError", async () => {
    const app = await buildApp();
    try {
      const config = getToolConfig("edit-metadata");
      await expect(
        config?.process(png, { imageDescription: "d".repeat(12_000) }, "a.png"),
      ).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 400,
        message: expect.stringContaining("MAX_METADATA_TAG_LENGTH"),
      });
    } finally {
      await app.close();
    }
  });
});
