/**
 * Sliding max along one line of `src` (van Herk / Gil-Werman): each output is
 * the largest value within `radius` of it on the line, at constant cost per
 * pixel whatever the radius, so a wide window over a large image can't stall
 * the worker. The line is copied out before any of it is written, so `dst`
 * may be `src`. `line`, `prefix` and `suffix` are scratch space of at least
 * `length + 2 * radius`.
 */
function slideMax(
  src: Uint8Array,
  dst: Uint8Array,
  start: number,
  stride: number,
  length: number,
  radius: number,
  line: Uint8Array,
  prefix: Uint8Array,
  suffix: Uint8Array,
): void {
  const size = 2 * radius + 1;
  const padded = length + 2 * radius;
  // Zero padding leaves windows past the line's ends judged on the pixels
  // that exist, since zero never wins a max.
  line.fill(0, 0, radius);
  line.fill(0, radius + length, padded);
  for (let k = 0; k < length; k++) line[radius + k] = src[start + k * stride];

  for (let blockStart = 0; blockStart < padded; blockStart += size) {
    const blockEnd = Math.min(blockStart + size, padded);
    let run = 0;
    for (let j = blockStart; j < blockEnd; j++) {
      if (line[j] > run) run = line[j];
      prefix[j] = run;
    }
    run = 0;
    for (let j = blockEnd - 1; j >= blockStart; j--) {
      if (line[j] > run) run = line[j];
      suffix[j] = run;
    }
  }

  // The window [i, i + size) spans at most two blocks: the tail of one from
  // `suffix` and the head of the next from `prefix`.
  for (let i = 0; i < length; i++) {
    const tail = suffix[i];
    const head = prefix[i + size - 1];
    dst[start + i * stride] = tail > head ? tail : head;
  }
}

/** Largest value within `radius` pixels of each pixel, over a square window. */
export function windowMax(
  values: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  const scratchLength = Math.max(width, height) + 2 * radius;
  const line = new Uint8Array(scratchLength);
  const prefix = new Uint8Array(scratchLength);
  const suffix = new Uint8Array(scratchLength);
  const result = new Uint8Array(values.length);
  for (let y = 0; y < height; y++) {
    slideMax(values, result, y * width, 1, width, radius, line, prefix, suffix);
  }
  for (let x = 0; x < width; x++) {
    slideMax(result, result, x, width, height, radius, line, prefix, suffix);
  }
  return result;
}
