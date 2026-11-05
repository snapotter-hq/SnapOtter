import { nvidiaDeviceVisible } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

const only =
  (...paths: string[]) =>
  (path: string) =>
    paths.includes(path);

describe("nvidiaDeviceVisible (#4449)", () => {
  it("sees native NVIDIA device nodes, including a container given only GPU 1", () => {
    expect(nvidiaDeviceVisible(only("/dev/nvidiactl", "/dev/nvidia1"))).toBe(true);
    expect(nvidiaDeviceVisible(only("/dev/nvidia0"))).toBe(true);
  });

  it.each([
    ["a WSL distro or a chroot inside one", "/usr/lib/wsl/lib/libcuda.so.1"],
    ["a container from the toolkit's legacy hook", "/usr/lib/x86_64-linux-gnu/libcuda.so.1"],
    ["a container from a CDI spec", "/usr/bin/nvidia-smi"],
  ])("sees an NVIDIA GPU under WSL2 in %s", (_layout, marker) => {
    expect(nvidiaDeviceVisible(only("/dev/dxg", marker))).toBe(true);
  });

  it("does not count /dev/dxg without an NVIDIA driver file", () => {
    // An Intel or AMD GPU, or an NVIDIA driver too old for CUDA on WSL, with
    // /usr/lib/wsl mounted in, next to the compat libcuda the image always ships.
    expect(
      nvidiaDeviceVisible(
        only("/dev/dxg", "/usr/lib/wsl/lib/libdxcore.so", "/usr/local/cuda/compat/libcuda.so.1"),
      ),
    ).toBe(false);
  });

  it("does not count an NVIDIA driver file without /dev/dxg", () => {
    expect(
      nvidiaDeviceVisible(
        only(
          "/usr/lib/wsl/lib/libcuda.so.1",
          "/usr/lib/x86_64-linux-gnu/libcuda.so.1",
          "/usr/bin/nvidia-smi",
        ),
      ),
    ).toBe(false);
  });

  it("is false with no GPU at all", () => {
    expect(nvidiaDeviceVisible(only())).toBe(false);
  });
});
