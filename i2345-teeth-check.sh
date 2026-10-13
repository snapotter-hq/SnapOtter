#!/bin/bash
set -e

cat << 'PATCH' > revert.patch
--- apps/web/src/components/editor/tools/eyedropper-tool.tsx
+++ apps/web/src/components/editor/tools/eyedropper-tool.tsx
@@ -94,8 +94,8 @@
       if (!ctx) return null;

       // Transform pointer coordinates from screen space to canvas space
-      const x = Math.floor((pointer.x - panOffset.x) / zoom);
-      const y = Math.floor((pointer.y - panOffset.y) / zoom);
+      const x = Math.round((pointer.x - panOffset.x) / zoom);
+      const y = Math.round((pointer.y - panOffset.y) / zoom);

       // Bounds check against the actual canvas dimensions (unzoomed)
       if (x < 0 || y < 0 || x >= canvasSize.width || y >= canvasSize.height) {
PATCH

patch -p0 < revert.patch

echo "--- RUNNING WITH BUG ---"
pnpm vitest run tests/unit/web/eyedropper-sample-size.test.tsx || true

git checkout -- apps/web/src/components/editor/tools/eyedropper-tool.tsx

echo "--- RUNNING WITH FIX ---"
pnpm vitest run tests/unit/web/eyedropper-sample-size.test.tsx
