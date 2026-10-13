Closes #2345

The eyedropper tool read the neighbouring pixel when clicking the right or lower half of a pixel while zoomed in. `Math.round` picked the nearest pixel boundary instead of the pixel containing the pointer.

Swapped `Math.round` for `Math.floor` for both x and y coordinates in `useEyedropperTool`. Added tests for sub-pixel zoom coordinates, negative bounds handling, and panning offsets.

Verified:
- Teeth check: tests failed on the bug, passed on the fix.
- Targeted pair (`eyedropper-sample-size.test.tsx`, `editor-capture-failure-readers.test.tsx`, `editor-pixel-tools-large-canvas.test.tsx`) against the baseline. Zero regressions.
- Ran review agents. Dropped a silent-failure-hunter suggestion that broke the intentional once-per-press throw in `handleEyedropperMove`, but kept its `try...catch` around `samplePixelColor`.