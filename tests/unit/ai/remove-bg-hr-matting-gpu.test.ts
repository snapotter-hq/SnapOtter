import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const pyDir = resolve(here, "../../../packages/ai/python");
const fixture = resolve(here, "../../fixtures/image/valid/portrait-color.jpg");

// Real-GPU check for #4744: transparency-fixer's birefnet-hr-matting step ran
// out of VRAM on a 12 GB card and the dispatcher restarted on every job. Opt in
// with SNAPOTTER_GPU_TEST_PYTHON (a python with rembg and onnxruntime-gpu, e.g.
// the background-removal bundle's) and U2NET_HOME holding the two models below.
// Runs the real dispatcher over stdin, the way the bridge does.
const python = process.env.SNAPOTTER_GPU_TEST_PYTHON ?? "";
const modelHome = process.env.U2NET_HOME ?? "";
const enabled =
  python !== "" &&
  existsSync(join(modelHome, "birefnet-hr-matting.onnx")) &&
  existsSync(join(modelHome, "birefnet-general-lite.onnx"));

interface Reply {
  id: string;
  stdout: string;
  exitCode: number;
}

describe.runIf(enabled)("birefnet-hr-matting on a real GPU (#4744)", () => {
  it("never restarts the dispatcher, back to back and after another model", async () => {
    const work = mkdtempSync(join(tmpdir(), "hrm-gpu-"));
    // The dispatcher refuses scripts whose bundle isn't in installed.json.
    mkdirSync(join(work, "ai"));
    writeFileSync(
      join(work, "ai", "installed.json"),
      JSON.stringify({ bundles: { "background-removal": {} } }),
    );
    const child = spawn(python, [join(pyDir, "dispatcher.py")], {
      cwd: pyDir,
      env: { ...process.env, DATA_DIR: work, PYTHONPATH: pyDir },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    const replies = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    const exited = new Promise<number | null>((r) => child.on("exit", (code) => r(code)));

    const ask = async (n: number, model: string) => {
      const id = `req-${n}`;
      child.stdin.write(
        `${JSON.stringify({
          id,
          script: "remove_bg",
          args: [fixture, join(work, `${id}.png`), JSON.stringify({ model })],
        })}\n`,
      );
      for (;;) {
        const next = await replies.next();
        if (next.done) throw new Error(`dispatcher exited before ${id}:\n${stderr}`);
        const reply = JSON.parse(next.value) as Reply;
        if (reply.id === id) return JSON.parse(reply.stdout.trim().split("\n").pop() ?? "{}");
      }
    };

    try {
      const sequence = [
        "birefnet-hr-matting",
        "birefnet-hr-matting",
        "birefnet-general-lite",
        "birefnet-hr-matting",
        "birefnet-general-lite",
      ];
      const results = [];
      for (const [i, model] of sequence.entries()) results.push(await ask(i, model));

      for (const [i, result] of results.entries()) {
        if (sequence[i] === "birefnet-hr-matting" && !result.success) {
          // A card too small for the model refuses up front; it never runs into
          // ONNX Runtime's arena.
          expect(result.error).toMatch(/^GPU out of memory: birefnet-hr-matting needs about/);
        } else {
          expect(result).toMatchObject({ success: true, device: "cuda" });
        }
        expect(JSON.stringify(result)).not.toMatch(/Failed to allocate|ONNXRuntimeError/);
      }
      expect(stderr).not.toContain("CUDA/ORT runtime failure detected");
      expect(child.exitCode).toBeNull();
    } finally {
      child.stdin.end();
      await exited;
      rmSync(work, { recursive: true, force: true });
    }
  }, 600_000);
});
