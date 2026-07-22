/**
 * Optional per-subprocess address-space cap (RLIMIT_AS) for the native media and
 * document engines.
 *
 * When SUBPROCESS_MEMORY_LIMIT_MB is a positive integer, the command runs under
 * /bin/sh, which sets `ulimit -v` and then `exec`s the real binary with its exact
 * argv. `exec "$@"` does not re-parse the arguments through the shell, so this
 * stays injection-safe. A decompression bomb or runaway filter graph is then
 * killed at that ceiling instead of driving the whole container to the cgroup
 * OOM-killer (which would take every in-flight job down with it).
 *
 * Disabled by default (unset or 0): the container memory limit remains the
 * primary backstop, and `ulimit -v` is a blunt instrument (it caps virtual
 * address space, not RSS). `|| true` makes it a no-op where `ulimit -v` is
 * unsupported, e.g. macOS.
 *
 * Deliberately NOT applied to the Python AI sidecar: ML frameworks (torch, CUDA)
 * reserve very large virtual address space without touching it, so an RLIMIT_AS
 * cap would break legitimate model loads. Those rely on the container limit.
 */
export function wrapWithMemoryLimit(bin: string, args: string[]): [string, string[]] {
  const mb = Number.parseInt(process.env.SUBPROCESS_MEMORY_LIMIT_MB ?? "", 10);
  if (!Number.isFinite(mb) || mb <= 0) return [bin, args];
  const script = 'ulimit -v "$1" 2>/dev/null || true; shift; exec "$@"';
  return ["/bin/sh", ["-c", script, "sh", String(mb * 1024), bin, ...args]];
}
