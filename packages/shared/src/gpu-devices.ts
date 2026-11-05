// Native Linux and the NVIDIA Container Toolkit create /dev/nvidiactl plus one
// /dev/nvidiaN per GPU with the host's numbering, so a container given only
// GPU 1 has /dev/nvidia1 and no /dev/nvidia0.
const NVIDIA_DEVICE_NODES = ["/dev/nvidiactl", "/dev/nvidia0"];

// WSL2 never creates those nodes (#4449). The GPU arrives as /dev/dxg, which
// Intel and AMD GPUs create too, so an NVIDIA driver file has to be visible as
// well. Where it lands depends on how the process was started.
const WSL_NVIDIA_MARKERS = [
  // A WSL distro, where WSL mounts the Windows driver's user-mode libraries.
  "/usr/lib/wsl/lib/libcuda.so.1",
  // A container from the toolkit's legacy hook, which bind-mounts the library
  // into the image's lib directory.
  "/usr/lib/x86_64-linux-gnu/libcuda.so.1",
  // A container from a CDI spec (Docker Engine 29.2 and later prefer one),
  // which keeps libcuda under a per-driver /usr/lib/wsl/drivers/<dir> and
  // links nvidia-smi here.
  "/usr/bin/nvidia-smi",
];

/**
 * Whether the filesystem shows an NVIDIA GPU, without loading a driver. The
 * caller passes the existence check because the web app loads this package
 * too, and a Node built-in import here blanks the Vite dev server (#1394).
 * Don't add /usr/local/cuda/compat/libcuda.so.1: the image ships it on every
 * host, GPU or not.
 */
export function nvidiaDeviceVisible(exists: (path: string) => boolean): boolean {
  if (NVIDIA_DEVICE_NODES.some((path) => exists(path))) return true;
  return exists("/dev/dxg") && WSL_NVIDIA_MARKERS.some((path) => exists(path));
}
