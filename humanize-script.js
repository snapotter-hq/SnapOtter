const fs = require("fs");

const input = fs.readFileSync("file-issue.txt", "utf8");

// Apply humanizer rules
// 1. Start at the point
// 2. Concrete details
// 3. No em dashes
// 4. Vary sentence length
// 5. Delete wrap-ups

const output = input
  .replace(
    "### Expected Behavior\nWhen using the Magic Wand selection tool or viewing the cursor coordinates in the editor while zoomed in, the pixel selected or displayed should precisely match the pixel under the pointer.\n\n### Actual Behavior\n",
    "",
  )
  .replace(
    "Similar to the eyedropper bug fixed in #2345, the Magic Wand tool and the canvas cursor tracker currently use `Math.round()` to translate screen coordinates to canvas pixels.",
    "The Magic Wand tool and the canvas cursor tracker use `Math.round()` to translate screen coordinates to canvas pixels, missing the fix applied to the eyedropper in #2345.",
  )
  .replace(
    "This causes two inaccuracies when zoomed in:\n1. Clicking the right or bottom half of a pixel will sample/select the next adjacent pixel instead of the one actually clicked.\n2. Clicking the right or bottom edge of the final row/column of the canvas will silently fail bounds checks and do nothing.\n3. The cursor coordinates displayed in the UI will flip to the next pixel halfway across the current pixel's visual footprint.",
    "When zoomed in, this means clicking the right or bottom half of a pixel selects the next adjacent pixel. Clicking the right or bottom edge of the final row or column silently fails bounds checks. The cursor coordinates displayed in the UI also flip to the next pixel halfway across the current pixel's visual footprint.",
  )
  .replace(
    "### Proposed Fix\nReplace `Math.round` with `Math.floor` in both files so coordinate translation behaves identically to the fixed eyedropper and brush tools.",
    "The fix is replacing `Math.round` with `Math.floor` in both files.",
  );

fs.writeFileSync("file-issue.txt", output);
