import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadConfig = vi.hoisted(() => ({
  MAX_UPLOAD_SIZE_MB: 10,
  MAX_BATCH_SIZE: 5,
}));

vi.mock("../../../apps/api/src/config.js", () => ({ env: uploadConfig }));

const _mockStaticRegister = vi.fn().mockResolvedValue(undefined);
vi.mock("@fastify/static", () => ({ default: "fastify-static-plugin" }));

const mockMultipartPlugin = vi.fn();
vi.mock("@fastify/multipart", () => ({ default: mockMultipartPlugin }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    existsSync: vi.fn(() => true),
  };
});

describe("registerStatic", () => {
  let registerStatic: typeof import("../../../apps/api/src/plugins/static.js").registerStatic;
  let existsSyncMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const staticModule = await import("../../../apps/api/src/plugins/static.js");
    registerStatic = staticModule.registerStatic;
    const fsMod = await import("node:fs");
    existsSyncMock = fsMod.existsSync as ReturnType<typeof vi.fn>;
  });

  it("registers static plugin when dist path exists", async () => {
    existsSyncMock.mockReturnValue(true);
    const app = {
      register: vi.fn().mockResolvedValue(undefined),
      setNotFoundHandler: vi.fn(),
      hasReplyDecorator: vi.fn().mockReturnValue(false),
      log: { warn: vi.fn() },
    };

    await registerStatic(app as never);
    expect(app.register).toHaveBeenCalledWith("fastify-static-plugin", {
      root: expect.stringContaining("web/dist"),
      prefix: "/",
      wildcard: false,
      decorateReply: true,
    });
    expect(app.setNotFoundHandler).toHaveBeenCalled();
  });

  it("sets SPA not-found handler that returns 404 for API routes", async () => {
    existsSyncMock.mockReturnValue(true);
    let notFoundHandler: (request: unknown, reply: unknown) => void;
    const app = {
      register: vi.fn().mockResolvedValue(undefined),
      setNotFoundHandler: vi.fn((handler: typeof notFoundHandler) => {
        notFoundHandler = handler;
      }),
      hasReplyDecorator: vi.fn().mockReturnValue(false),
      log: { warn: vi.fn() },
    };

    await registerStatic(app as never);

    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn(), sendFile: vi.fn() };
    notFoundHandler?.({ url: "/api/v1/tools" }, reply);
    expect(reply.code).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ error: "Not found", code: "NOT_FOUND" });
  });

  it("sets SPA not-found handler that serves index.html for non-API routes", async () => {
    existsSyncMock.mockReturnValue(true);
    let notFoundHandler: (request: unknown, reply: unknown) => void;
    const app = {
      register: vi.fn().mockResolvedValue(undefined),
      setNotFoundHandler: vi.fn((handler: typeof notFoundHandler) => {
        notFoundHandler = handler;
      }),
      hasReplyDecorator: vi.fn().mockReturnValue(false),
      log: { warn: vi.fn() },
    };

    await registerStatic(app as never);

    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn(), sendFile: vi.fn() };
    notFoundHandler?.({ url: "/resize" }, reply);
    expect(reply.sendFile).toHaveBeenCalledWith("index.html");
  });

  it("logs warning and skips registration when dist path does not exist", async () => {
    existsSyncMock.mockReturnValue(false);
    const app = {
      register: vi.fn().mockResolvedValue(undefined),
      setNotFoundHandler: vi.fn(),
      log: { warn: vi.fn() },
    };

    await registerStatic(app as never);
    expect(app.log.warn).toHaveBeenCalledWith(expect.stringContaining("SPA dist not found"));
    expect(app.register).not.toHaveBeenCalled();
    expect(app.setNotFoundHandler).not.toHaveBeenCalled();
  });
});

describe("registerUpload", () => {
  let registerUpload: typeof import("../../../apps/api/src/plugins/upload.js").registerUpload;

  beforeEach(async () => {
    vi.clearAllMocks();
    const uploadModule = await import("../../../apps/api/src/plugins/upload.js");
    registerUpload = uploadModule.registerUpload;
  });

  it("registers multipart with correct file size limit", async () => {
    uploadConfig.MAX_UPLOAD_SIZE_MB = 10;
    uploadConfig.MAX_BATCH_SIZE = 5;
    const app = { register: vi.fn().mockResolvedValue(undefined), addHook: vi.fn() };

    await registerUpload(app as never);
    expect(app.register).toHaveBeenCalledWith(mockMultipartPlugin, {
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 5,
      },
    });
  });

  it("passes undefined for fileSize when MAX_UPLOAD_SIZE_MB is 0", async () => {
    uploadConfig.MAX_UPLOAD_SIZE_MB = 0;
    uploadConfig.MAX_BATCH_SIZE = 5;
    const app = { register: vi.fn().mockResolvedValue(undefined), addHook: vi.fn() };

    await registerUpload(app as never);
    expect(app.register).toHaveBeenCalledWith(mockMultipartPlugin, {
      limits: {
        fileSize: undefined,
        files: 5,
      },
    });
  });

  it("passes undefined for files when MAX_BATCH_SIZE is 0", async () => {
    uploadConfig.MAX_UPLOAD_SIZE_MB = 10;
    uploadConfig.MAX_BATCH_SIZE = 0;
    const app = { register: vi.fn().mockResolvedValue(undefined), addHook: vi.fn() };

    await registerUpload(app as never);
    expect(app.register).toHaveBeenCalledWith(mockMultipartPlugin, {
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: undefined,
      },
    });
  });

  it("passes undefined for both limits when both are 0", async () => {
    uploadConfig.MAX_UPLOAD_SIZE_MB = 0;
    uploadConfig.MAX_BATCH_SIZE = 0;
    const app = { register: vi.fn().mockResolvedValue(undefined), addHook: vi.fn() };

    await registerUpload(app as never);
    expect(app.register).toHaveBeenCalledWith(mockMultipartPlugin, {
      limits: {
        fileSize: undefined,
        files: undefined,
      },
    });
  });
});
