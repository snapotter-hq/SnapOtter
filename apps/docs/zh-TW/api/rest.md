---
description: "完整的 REST API 參考。工具端點、批次處理、管線、檔案庫、身分驗證、團隊以及管理操作。"
i18n_source_hash: eb73a14533a1
i18n_provenance: human
i18n_output_hash: ac48a4a14310
---

# REST API 參考 {#rest-api-reference}

包含請求／回應範例的互動式 API 文件可於 [http://localhost:1349/api/docs](http://localhost:1349/api/docs) 取得。

機器可讀規格：
- `/api/v1/openapi.yaml` - OpenAPI 3.1 規格
- `/llms.txt` - 適合 LLM 閱讀的摘要
- `/llms-full.txt` - 完整的適合 LLM 閱讀文件

## 身分驗證 {#authentication}

除非 `AUTH_ENABLED=false`，否則所有端點都需要身分驗證。

### 工作階段權杖 {#session-token}

```bash
# Login
curl -X POST http://localhost:1349/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Returns: {"token":"<session-token>"}

# Use token
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer <session-token>"
```

工作階段在 7 天後過期（可透過 `SESSION_DURATION_HOURS` 設定）。

### API 金鑰 {#api-keys}

```bash
# Create a key (returns key once - store it)
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-script"}'
# Returns: {"key":"si_<96 hex chars>","id":"...","name":"my-script"}

# Use the key
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-key>"
```

金鑰以 `si_` 為前綴，並以 scrypt 雜湊儲存，原始金鑰只會顯示一次，之後無法再次取得。

### 身分驗證端點 {#auth-endpoints}

| 方法 | 路徑 | 存取權 | 說明 |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | 公開 | 登入，取得工作階段權杖 |
| `POST` | `/api/auth/logout` | 需驗證 | 銷毀目前工作階段 |
| `GET` | `/api/auth/session` | 需驗證 | 驗證目前工作階段 |
| `POST` | `/api/auth/change-password` | 需驗證 | 變更自己的密碼（會使所有其他工作階段與 API 金鑰失效） |
| `GET` | `/api/auth/users` | 管理員 | 列出所有使用者 |
| `POST` | `/api/auth/register` | 管理員 | 建立新使用者 |
| `PUT` | `/api/auth/users/:id` | 管理員 | 更新使用者角色或團隊 |
| `POST` | `/api/auth/users/:id/reset-password` | 管理員 | 重設使用者密碼 |
| `DELETE` | `/api/auth/users/:id` | 管理員 | 刪除使用者 |
| `GET` | `/api/v1/config/auth` | 公開 | 檢查是否已啟用身分驗證（`{ authEnabled: bool }`） |
| `POST` | `/api/auth/mfa/enroll` | 需驗證 | 開始 TOTP MFA 註冊。需要企業版 `mfa` 功能 |
| `POST` | `/api/auth/mfa/verify` | 需驗證 | 使用 TOTP 代碼確認 MFA 註冊 |
| `POST` | `/api/auth/mfa/complete` | 公開 | 完成待處理的 MFA 登入挑戰 |
| `POST` | `/api/auth/mfa/disable` | 需驗證 | 為目前使用者停用 MFA |
| `POST` | `/api/auth/users/:id/mfa/reset` | 管理員（`users:manage`） | 為使用者重設 MFA |
| `GET` | `/api/auth/oidc/login` | 公開 | 啟用 OIDC 時開始 OIDC 登入 |
| `GET` | `/api/auth/oidc/callback` | 公開 | OIDC 授權回呼 |
| `GET` | `/api/auth/saml/metadata` | 公開 | 啟用 SAML 時提供 SAML SP 中繼資料 XML |
| `GET` | `/api/auth/saml/login` | 公開 | 開始 SAML 登入 |
| `POST` | `/api/auth/saml/callback` | 公開 | SAML 判斷提示消費者服務 |

當使用者啟用了 MFA 時，`POST /api/auth/login` 會回傳 `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` 而非工作階段權杖。將該 `mfaToken` 連同 TOTP 或復原代碼一起傳送到 `/api/auth/mfa/complete`。

### 權限 {#permissions}

| 權限 | 管理員 | 使用者 |
|-----------|:-----:|:----:|
| 使用工具 | ✓ | ✓ |
| 自己的檔案／管線／API 金鑰 | ✓ | ✓ |
| 檢視所有使用者的檔案／管線／金鑰 | ✓ | - |
| 寫入設定 | ✓ | - |
| 管理使用者與團隊 | ✓ | - |
| 管理品牌 | ✓ | - |

## 健康檢查 {#health-check}

| 方法 | 路徑 | 存取權 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | 公開 | 基本健康檢查。正常時回傳 `{"status":"healthy","version":"..."}` 並帶 200，若資料庫無法連線則回傳 `{"status":"unhealthy"}` 並帶 503。 |
| `GET` | `/api/v1/readyz` | 公開 | 就緒探測。檢查 PostgreSQL、Redis、磁碟空間，以及設定時的 S3。當該執行個體不應接收流量時回傳 503。 |
| `GET` | `/api/v1/admin/health` | 管理員（`system:health`） | 詳細診斷資訊，包括執行時間、儲存模式、資料庫狀態、佇列狀態與 GPU 可用性。 |

## 使用工具 {#using-tools}

每個工具都遵循相同的模式：

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId> \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'settings={"width":800,"height":600}'

# Batch (returns ZIP)
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId>/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'settings={...}'
```

`<section>` 為 `image`、`video`、`audio`、`pdf` 或 `files` 之一。

- 上傳為 `multipart/form-data`。
- `settings` 是包含工具專屬選項的 JSON 字串。
- `clientJobId` 是可選的表單欄位，供呼叫端提供進度關聯用。
- `fileId` 是可選的表單欄位，用於參照現有檔案庫項目。存在時，處理後的輸出會另存為新版本，且回應會包含 `savedFileId`。
- **快速工具** 通常回傳 200 JSON：`{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`。從 `downloadUrl` 取得處理後的檔案。
- **任何排入佇列的工具** 若為長時間執行或超過同步等待視窗，都可能回傳 202 JSON：`{"jobId":"...","async":true}`。連線到 SSE 取得進度，完成後再下載（請參閱 [進度追蹤](#progress-tracking)）。
- **批次** 路由會直接串流回傳 ZIP 封存檔（帶有 `X-Job-Id` 標頭），適用於已註冊在通用批次登錄中的工具。

## 工具參考 {#tools-reference}

### 轉換預設 {#conversion-presets}

共享目錄包含 83 個專用轉換預設端點，例如 `jpg-to-png`、`mov-to-mp4`、`m4a-to-mp3`、`pdf-to-jpg` 與 `excel-to-csv`。預設是一級工具路由：

`POST /api/v1/tools/<section>/<presetId>`

每個預設都鎖定輸出格式，並委派給基礎工具，例如 `convert`、`convert-video`、`extract-audio`、`convert-audio`、`image-to-pdf`、`pdf-to-image`、`svg-to-raster` 或 `convert-spreadsheet`。完整的路由表與可選設定請參閱 [轉換預設](/zh-TW/tools/conversion-presets)。

### 基本工具 {#essentials}

| 工具 ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `resize` | 調整大小 | `width`、`height`、`fit`（cover/contain/fill/inside/outside）、`percentage`、`withoutEnlargement`，另有 23 個社群媒體預設 |
| `crop` | 裁切 | `left`、`top`、`width`、`height`、`unit`（px/percent） |
| `rotate` | 旋轉與翻轉 | `angle`、`horizontal`（bool）、`vertical`（bool） |
| `convert` | 轉換 | `format`（jpg/png/webp/avif/tiff/gif/heic/heif）、`quality` |
| `compress` | 壓縮 | `mode`（quality/targetSize）、`quality`（1–100）、`targetSizeKb` |

### 最佳化 {#optimization}

| 工具 ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `optimize-for-web` | 網頁最佳化 | `format`（webp/jpeg/avif/png）、`quality`、`maxWidth`、`maxHeight`、`progressive`、`stripMetadata` |
| `strip-metadata` | 移除中繼資料 | - |
| `edit-metadata` | 編輯中繼資料 | `title`、`description`、`author`、`copyright`、`keywords`、`gps`（lat/lon）、`dateTime` |
| `bulk-rename` | 批次重新命名 | `pattern`（支援 `{n}`、`{date}`、`{original}`）、`startIndex`、`padding` |
| `image-to-pdf` | 圖片轉 PDF | `pageSize`（A4/Letter/...）、`orientation`、`margin`、`targetSize`（{value, unit}） |
| `favicon` | Favicon 產生器 | `padding`、`backgroundColor`、`borderRadius` - 產生所有標準尺寸 |

### 調整 {#adjustments}

| 工具 ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `adjust-colors` | 調整色彩 | `brightness`、`contrast`、`exposure`、`saturation`、`temperature`、`tint`、`hue`、`sharpness`、`red`、`green`、`blue`、`effect`（none/grayscale/sepia/invert） |
| `sharpening` | 銳化 | `method`（adaptive/unsharp-mask/high-pass）、`sigma`、`m1`、`m2`、`x1`、`y2`、`y3`、`amount`、`radius`、`threshold`、`strength`、`kernelSize`（3/5）、`denoise`（off/light/medium/strong） |
| `replace-color` | 取代色彩 | `sourceColor`、`targetColor`（取代色）、`makeTransparent`、`tolerance` |
| `color-blindness` | 色盲模擬 | `simulationType`（protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy，預設 \"deuteranomaly\"） |
| `duotone` | 雙色調 | `shadow`（hex）、`highlight`（hex）、`intensity`（0-100） |
| `pixelate` | 像素化 | `blockSize`（2-128）、`region`（用於局部像素化的 {left, top, width, height}） |
| `vignette` | 暈影 | `strength`（0.1-1）、`color`（hex）、`radius`、`softness`、`roundness`、`centerX`、`centerY` |

### AI 工具 {#ai-tools}

所有 AI 工具都在你的硬體上執行：預設使用 CPU，或在有支援的 NVIDIA GPU 時使用 NVIDIA CUDA。目前不支援透過 VA-API、Quick Sync 或 OpenCL 進行 Intel/AMD iGPU 加速的 AI 推論。無需網路連線。

| 工具 ID | 名稱 | AI 模型 | 主要設定 |
|---------|------|---------|-------------|
| `remove-background` | 移除背景 | rembg（BiRefNet / U2-Net） | `model`、`backgroundType`（transparent/color/gradient/blur/image）、`backgroundColor`、`gradientColor1`、`gradientColor2`、`gradientAngle`、`blurEnabled`、`blurIntensity`、`shadowEnabled`、`shadowOpacity` |
| `upscale` | 圖片放大 | RealESRGAN | `scale`（2/4）、`model`、`faceEnhance`、`denoise`、`format`、`quality` |
| `erase-object` | 物件橡皮擦 | LaMa（ONNX） | 遮罩以第二個檔案部分傳送（欄位名稱 `mask`）、`format`、`quality` |
| `ocr` | OCR／文字擷取 | PaddleOCR / Tesseract | `quality`（fast/balanced/best）、`language`、`enhance` |
| `blur-faces` | 臉部／PII 模糊 | MediaPipe | `blurRadius`、`sensitivity` |
| `smart-crop` | 智慧裁切 | MediaPipe + Sharp | `mode`（subject/face/trim）、`strategy`（attention/entropy）、`width`、`height`、`padding`、`facePreset`（closeup/head-shoulders/upper-body/half-body）、`sensitivity`、`threshold`、`padToSquare`、`padColor`、`targetSize`、`quality` |
| `image-enhancement` | 圖片增強 | 分析式 | `mode`（auto/exposure/contrast/color/sharpness）、`strength` |
| `enhance-faces` | 臉部增強 | GFPGAN / CodeFormer | `model`（gfpgan/codeformer）、`strength`、`sensitivity`、`centerFace` |
| `colorize` | AI 上色 | DDColor | `intensity`、`model` |
| `noise-removal` | 雜訊移除 | 分級降噪 | `tier`（quick/balanced/quality/maximum）、`strength`、`detailPreservation`、`colorNoise`、`format`、`quality` |
| `red-eye-removal` | 紅眼移除 | 臉部特徵點 + 色彩分析 | `sensitivity`、`strength` |
| `restore-photo` | 相片修復 | 多步驟管線 | `mode`（auto/light/heavy）、`scratchRemoval`、`faceEnhancement`、`fidelity`、`denoise`、`denoiseStrength`、`colorize` |
| `passport-photo` | 證件照 | MediaPipe 特徵點 | 兩階段流程。分析使用 multipart `file`；產生則使用 JSON，帶有 `countryCode`、`bgColor`、`printLayout`（none/4x6/a4）、特徵點與影像尺寸 |
| `content-aware-resize` | 內容感知調整大小 | 接縫裁減（caire） | `width`、`height`、`protectFaces`、`blurRadius`、`sobelThreshold`、`square` |
| `transparency-fixer` | PNG 透明度修正 | BiRefNet HR-matting | `defringe`（0-100）、`outputFormat`（png/webp） |
| `background-replace` | 背景替換 | rembg（BiRefNet） | `backgroundType`（color/gradient）、`color`（hex）、`gradientColor1`、`gradientColor2`、`gradientAngle`、`feather`（0-20）、`format`（png/webp） |
| `blur-background` | 背景模糊 | rembg（BiRefNet） | `intensity`（1-100）、`feather`（0-20）、`format`（png/webp） |
| `ai-canvas-expand` | AI 畫布延伸 | LaMa（outpainting） | `extendTop`、`extendRight`、`extendBottom`、`extendLeft`（px）、`tier`（fast/balanced/high）、`format`、`quality` |

### 浮水印與疊加 {#watermark-overlay}

| 工具 ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `watermark-text` | 文字浮水印 | `text`、`font`、`fontSize`、`color`、`opacity`、`position`、`rotation`、`tile` |
| `watermark-image` | 圖片浮水印 | `opacity`、`position`、`scale` - 第二個檔案為浮水印 |
| `text-overlay` | 文字疊加 | `text`、`font`、`fontSize`、`color`、`x`、`y`、`background`、`padding`、`borderRadius` |
| `compose` | 圖片合成 | `x`、`y`、`opacity`、`blend` - 第二個檔案疊在最上層 |
| `meme-generator` | 迷因產生器 | `templateId`、`textLayout`（top-bottom/top-only/bottom-only/center/side-by-side）、`textBoxes`（[{id, text}]）、`fontFamily`（anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto）、`fontSize`、`textColor`、`strokeColor`、`textAlign`、`allCaps`。支援範本模式（含 `templateId` 的 JSON 主體）或自訂圖片模式（含檔案的 multipart）。 |

### 公用程式 {#utilities}

| 工具 ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `info` | 圖片資訊 | -（回傳寬度、高度、格式、大小、色版、hasAlpha、DPI、EXIF） |
| `compare` | 圖片比對 | `mode`（side-by-side/overlay/diff）、`diffThreshold` - 第二個檔案為比對目標 |
| `find-duplicates` | 尋找重複項 | `threshold`（感知雜湊距離，預設 8） - 多檔案 |
| `color-palette` | 色彩調色盤 | `count`（主色數量）、`format`（hex/rgb） |
| `qr-generate` | QR Code 產生器 | `data`、`size`、`margin`、`colorDark`、`colorLight`、`errorCorrectionLevel`、`dotStyle`、`cornerStyle`、`logo`（可選檔案） |
| `barcode-read` | 條碼讀取器 | -（自動偵測 QR、EAN、Code128、DataMatrix 等） |
| `image-to-base64` | 圖片轉 Base64 | `format`（data-uri/plain）、`mimeType` |
| `html-to-image` | HTML 轉圖片 | `url`、`format`（png/jpg/webp）、`quality`、`fullPage`、`devicePreset`（desktop/tablet/mobile/custom）、`viewportWidth`、`viewportHeight` |
| `histogram` | 直方圖 | `scale`（linear/log） - 回傳 RGB 直方圖圖表 + 各色版統計 |
| `lqip-placeholder` | LQIP 佔位圖 | `width`（4-64）、`blur`、`strategy`（blur/pixelate/solid）、`format`（webp/png/jpeg）、`quality` |
| `barcode-generate` | 條碼產生器 | `text`、`type`（code128/ean13/upca/code39/itf14/datamatrix）、`scale`（1-8）、`includeText`（bool）。JSON 主體，無需上傳檔案。 |

### 版面與合成 {#layout-composition}

| 工具 ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `collage` | 拼貼／網格 | `template`（25 種以上版面）、`gap`、`backgroundColor`、`borderRadius` - 多檔案 |
| `stitch` | 拼接／合併 | `direction`（horizontal/vertical/grid）、`gap`、`backgroundColor`、`alignment` - 多檔案 |
| `split` | 圖片分割 | `mode`（grid/rows/cols）、`rows`、`cols`、`tileWidth`、`tileHeight` |
| `border` | 邊框與外框 | `width`、`color`、`style`（solid/gradient/pattern）、`borderRadius`、`padding`、`shadow` |
| `beautify` | 美化螢幕截圖 | `backgroundType`（solid/linear-gradient/radial-gradient/image/transparent）、`gradientStops`、`padding`、`borderRadius`、`shadowPreset`、`frame`（none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...）、`socialPreset`（none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt）、`watermarkText`、`outputFormat` |
| `circle-crop` | 圓形裁切 | `zoom`（1-5）、`offsetX`、`offsetY`、`borderWidth`、`borderColor`、`background`（transparent/hex）、`outputSize` |
| `image-pad` | 圖片填補 | `target`（16:9/9:16/1:1/4:3/3:4/custom）、`ratioW`、`ratioH`、`background`（color/transparent/blur）、`color`（hex）、`padding`（0-50%） |
| `sprite-sheet` | 精靈圖表 | `columns`（1-16）、`padding`、`background`（hex）、`format`（png/webp/jpeg）、`quality` - 多檔案（2-64 張圖片） |

### 格式與轉換 {#format-conversion}

| 工具 ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `svg-to-raster` | SVG 轉點陣圖 | `format`（png/jpeg/webp/avif/tiff/gif/heif）、`width`、`height`、`scale`、`dpi`、`background` |
| `vectorize` | 圖片轉 SVG | `colorMode`（bw/color）、`threshold`、`colorPrecision`、`filterSpeckle`、`pathMode`（none/polygon/spline） |
| `gif-tools` | GIF 工具 | `action`（resize/optimize/reverse/speed/extract-frames/rotate/add-text），依動作而定的參數 |
| `gif-webp` | GIF/WebP 轉換器 | `quality`（1-100）、`lossless`（bool）、`resizePercent`（10-100） |

### 影片工具 {#video-tools}

| 工具 ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `convert-video` | 轉換影片 | `format`（mp4/mov/webm/avi/mkv）、`quality`（high/balanced/small） |
| `compress-video` | 壓縮影片 | `quality`（light/balanced/strong）、`resolution`（original/1080p/720p/480p） |
| `trim-video` | 修剪影片 | `startS`、`endS`、`precise`（bool，逐格精確剪輯） |
| `mute-video` | 靜音影片 | - |
| `video-to-gif` | 影片轉 GIF | `fps`（1-30）、`width`、`startS`、`durationS`（最長 60 秒） |
| `resize-video` | 調整影片大小 | `width`、`height`、`preset`（custom/2160p/1440p/1080p/720p/480p/360p） |
| `crop-video` | 裁切影片 | `width`、`height`、`x`、`y` |
| `rotate-video` | 旋轉影片 | `transform`（cw90/ccw90/180/hflip/vflip） |
| `change-fps` | 變更 FPS | `fps`（1-120） |
| `video-color` | 影片色彩 | `brightness`、`contrast`、`saturation`、`gamma` |
| `video-speed` | 影片速度 | `factor`（0.25-4）、`keepPitch`（bool） |
| `reverse-video` | 倒轉影片 | -（最長 5 分鐘） |
| `video-loudnorm` | 音訊正規化 | -（EBU R128） |
| `aspect-pad` | 比例填補 | `target`（16:9/9:16/1:1/4:3/3:4）、`color`（hex） |
| `blur-pad` | 模糊填補 | `target`（16:9/9:16/1:1/4:3/3:4）、`blur`（2-50） |
| `watermark-video` | 影片浮水印 | `text`、`position`、`fontSize`、`opacity`、`color` |
| `stabilize-video` | 影片穩定 | `smoothing`（5-60，以格為單位） |
| `gif-to-video` | GIF 轉影片 | `format`（mp4/webm/mov） |
| `video-to-webp` | 影片轉 WebP | `fps`、`width`、`quality`、`loop`（bool） |
| `video-to-frames` | 影片轉影格 | `mode`（all/nth/timestamps）、`n`、`timestamps`、`format`（png/jpg） |
| `merge-videos` | 合併影片 | -（多檔案，正規化為第一部影片的解析度） |
| `replace-audio` | 替換音訊 | -（影片 + 音訊檔，兩個檔案） |
| `burn-subtitles` | 燒錄字幕 | `fontSize`（8-72） - 影片 + 字幕檔 |
| `embed-subtitles` | 嵌入字幕 | `language`（ISO 639-2/B 代碼） - 影片 + 字幕檔 |
| `extract-subtitles` | 擷取字幕 | -（輸出 SRT） |
| `images-to-video` | 圖片轉影片 | `secondsPerImage`（0.5-10）、`resolution`（1080p/720p/square）、`fps` - 多檔案 |
| `video-metadata` | 清理影片中繼資料 | - |
| `auto-subtitles` | 自動字幕（AI） | `language`（auto/en/de/fr/es/zh/ja/ko/id/th/vi）、`format`（srt/vtt） |
| `extract-audio` | 擷取音訊 | `format`（mp3/wav/m4a/ogg） |

### 音訊工具 {#audio-tools}

| 工具 ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `convert-audio` | 轉換音訊 | `format`（mp3/wav/ogg/flac/m4a）、`bitrateKbps`（32-320） |
| `trim-audio` | 修剪音訊 | `startS`、`endS` |
| `volume-adjust` | 音量調整 | `gainDb`（-30 到 30） |
| `normalize-audio` | 音訊正規化 | -（EBU R128，-16 LUFS） |
| `fade-audio` | 音訊淡入淡出 | `fadeInS`（0-30）、`fadeOutS`（0-30） |
| `reverse-audio` | 倒轉音訊 | - |
| `audio-speed` | 音訊速度 | `factor`（0.25-4） |
| `pitch-shift` | 音高調整 | `semitones`（-12 到 12） |
| `audio-channels` | 音訊聲道 | `mode`（stereo-to-mono/mono-to-stereo/swap） |
| `silence-removal` | 靜音移除 | `thresholdDb`（-80 到 -20）、`minSilenceS`（0.1-5） |
| `noise-reduction` | 降噪 | `strength`（light/medium/strong） |
| `merge-audio` | 合併音訊 | `format`（mp3/wav/flac/m4a） - 多檔案 |
| `split-audio` | 分割音訊 | `mode`（time/parts/silence）、`segmentS`、`parts`、`thresholdDb`、`minSilenceS` |
| `ringtone-maker` | 鈴聲製作器 | `startS`、`durationS`（1-30） |
| `waveform-image` | 波形圖 | `width`、`height`、`color`（hex） |
| `audio-metadata` | 音訊中繼資料 | `strip`（bool）、`title`、`artist`、`album` |
| `transcribe-audio` | 音訊轉錄（AI） | `language`（auto/en/de/fr/es/zh/ja/ko/id/th/vi）、`outputFormat`（txt/srt/vtt） |

### 文件工具 {#document-tools}

| 工具 ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `merge-pdf` | 合併 PDF | -（多檔案，最多 20 個 PDF） |
| `split-pdf` | 分割 PDF | `mode`（range/every）、`range`、`everyN`（1-500） |
| `compress-pdf` | 壓縮 PDF | `mode`（quality/targetSize）、`quality`（1-100）、`targetSizeKb` |
| `rotate-pdf` | 旋轉 PDF | `angle`（90/180/270）、`range`（頁面範圍） |
| `extract-pages` | 擷取頁面 | `range`（qpdf 語法，例如 \"1-5,8,10-z\"） |
| `remove-pages` | 移除頁面 | `pages`（要移除的 qpdf 範圍） |
| `organize-pdf` | 整理 PDF | `order`（qpdf 頁面順序，例如 \"3,1,2,5-z\"） |
| `protect-pdf` | 保護 PDF | `userPassword`、`ownerPassword`（AES-256） |
| `unlock-pdf` | 解鎖 PDF | `password` |
| `repair-pdf` | 修復 PDF | - |
| `linearize-pdf` | PDF 網頁最佳化 | -（線性化以加快網頁檢視） |
| `grayscale-pdf` | PDF 灰階 | - |
| `pdfa-convert` | PDF/A 轉換 | -（封存用 PDF/A-2） |
| `crop-pdf` | 裁切 PDF | `margin`（0-2000 點） |
| `nup-pdf` | N-up PDF | `perSheet`（2/3/4/8/9/12/16） |
| `booklet-pdf` | 小冊子 PDF | `perSheet`（2/4/6/8） |
| `watermark-pdf` | PDF 浮水印 | `text`、`position`、`fontSize`、`opacity`、`rotation` |
| `pdf-page-numbers` | PDF 頁碼 | `position`（bl/bc/br/tl/tc/tr）、`fontSize` |
| `flatten-pdf` | 扁平化 PDF | -（烘焙表單與註解） |
| `redact-pdf` | 遮蔽 PDF | `terms`（string[]）、`caseSensitive`（bool） |
| `sign-pdf` | 簽署 PDF | 自訂 multipart 路由，含 PDF `file`、簽名檔 `sig0`、`sig1`，以及 `placements` JSON 陣列 |
| `pdf-to-text` | PDF 轉文字 | - |
| `pdf-to-word` | PDF 轉 Word | - |
| `pdf-metadata` | PDF 中繼資料 | `title`、`author`、`subject`、`keywords` |
| `convert-document` | 轉換文件 | `format`（docx/odt/rtf/txt） |
| `convert-presentation` | 轉換簡報 | `format`（pptx/odp） |
| `convert-spreadsheet` | 轉換試算表 | `format`（xlsx/ods/csv） |
| `excel-to-pdf` | Excel 轉 PDF | - |
| `word-to-pdf` | Word 轉 PDF | - |
| `powerpoint-to-pdf` | PowerPoint 轉 PDF | - |
| `html-to-pdf` | HTML 轉 PDF | -（停用遠端資源） |
| `markdown-to-docx` | Markdown 轉 Word | - |
| `markdown-to-html` | Markdown 轉 HTML | - |
| `markdown-to-pdf` | Markdown 轉 PDF | -（停用遠端資源） |
| `epub-convert` | 轉換 EPUB | `format`（pdf/docx/html/md） |
| `to-epub` | 轉換為 EPUB | -（接受 .docx、.md、.html、.txt） |
| `ocr-pdf` | PDF OCR（AI） | `quality`（fast/balanced/best）、`language`（auto/en/de/fr/es/zh/ja/ko）、`pages` |
| `pdf-to-image` | PDF 轉圖片 | `pages`（all/range）、`format`、`dpi`、`quality` |
| `pdf-to-jpg` | PDF 轉 JPG | `pages`、`dpi`、`quality`、`colorMode` |
| `pdf-to-png` | PDF 轉 PNG | `pages`、`dpi`、`quality`、`colorMode` |
| `pdf-to-tiff` | PDF 轉 TIFF | `pages`、`dpi`、`quality`、`colorMode` |

### 檔案工具 {#file-tools}

| 工具 ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `chart-maker` | 圖表製作器 | `kind`（bar/line/pie）、`title`、`width`、`height` |
| `csv-excel` | CSV 轉 Excel | `sheet`（XLSX 輸入的工作表編號） - 雙向 |
| `csv-json` | CSV 轉 JSON | `pretty`（bool） - 雙向 |
| `json-xml` | JSON 轉 XML | `pretty`（bool） - 雙向 |
| `split-csv` | 分割 CSV | `rowsPerFile`（1-1000000）、`keepHeader`（bool） |
| `merge-csvs` | 合併 CSV | -（多檔案，欄位須相符） |
| `yaml-json` | YAML / JSON | -（雙向） |
| `xml-to-csv` | XML 轉 CSV | -（自動尋找重複元素） |
| `excel-to-csv` | Excel 轉 CSV | 由 `convert-spreadsheet` 支援的專用轉換預設 |
| `create-zip` | 建立 ZIP | -（多檔案，2-50 個檔案） |
| `extract-zip` | 解壓縮 ZIP | -（有防炸彈保護） |

### HTML 轉圖片 {#html-to-image}

將網頁擷取為圖片。與其他工具不同，此端點接受 `application/json` 而非 multipart 表單資料（無需上傳檔案）。

**端點：** `POST /api/v1/tools/image/html-to-image`

**Content-Type：** `application/json`

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `url` | string | （必填） | 要擷取的 URL（僅限 http/https） |
| `format` | string | `"png"` | 輸出格式：`jpg`、`png`、`webp` |
| `quality` | number | `90` | 品質 1-100（僅限 JPG/WebP） |
| `fullPage` | boolean | `false` | 擷取整個可捲動頁面 |
| `devicePreset` | string | `"desktop"` | `desktop`、`tablet`、`mobile`、`custom` |
| `viewportWidth` | number | `1280` | 自訂檢視區寬度 320-3840 |
| `viewportHeight` | number | `720` | 自訂檢視區高度 320-2160 |

**範例：**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**回應：**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### 工具子路由 {#tool-sub-routes}

某些工具在標準 `POST /api/v1/tools/<section>/<toolId>` 之外，還提供額外端點：

| 方法 | 路徑 | 說明 |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | 回傳熱門工具 ID，當使用資料稀少時退回到精選的預設清單 |
| `POST` | `/api/v1/tools/image/remove-background/effects` | 套用背景效果（color/gradient/blur/shadow）而無需重新執行 AI。使用初次移除時快取的遮罩。 |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | 從圖片讀取現有的 EXIF/IPTC/XMP 中繼資料 |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | 在移除前檢視中繼資料欄位 |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | 第 1 階段：AI 臉部偵測 + 背景移除。回傳臉部特徵點與快取資料。 |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | 第 2 階段：使用快取分析進行裁切、調整大小與排版。不重新執行 AI。 |
| `POST` | `/api/v1/tools/image/gif-tools/info` | 取得 GIF 中繼資料（影格數、尺寸、時長） |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | 取得 PDF 中繼資料（頁數、尺寸） |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | 產生特定 PDF 頁面的預覽 |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | 取得專用 JPG 預設的 PDF 中繼資料 |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | 產生 JPG 預設的 PDF 頁面預覽 |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | 取得專用 PNG 預設的 PDF 中繼資料 |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | 產生 PNG 預設的 PDF 頁面預覽 |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | 取得專用 TIFF 預設的 PDF 中繼資料 |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | 產生 TIFF 預設的 PDF 頁面預覽 |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | 批次將多個 SVG 轉換為點陣圖 |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | 分析圖片品質並回傳增強建議 |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | 供即時參數調整的輕量預覽。回傳含大小標頭的最佳化圖片。 |

## 批次處理 {#batch-processing}

一次將支援批次的通用工具套用於多個檔案。回傳 ZIP 封存檔。自訂的多檔案或多步驟路由，例如 PDF 簽署、PDF OCR 與 PDF 轉圖片預設路由，會改用各自的端點合約，而非通用的 `/batch` 路由。

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

並行度由 `CONCURRENT_JOBS` 控制（預設：從 CPU 核心自動偵測）。`MAX_BATCH_SIZE` 限制每批次的檔案數量（預設：100；設為 0 表示無限制）。

## 管線 {#pipelines}

### 執行管線 {#execute-a-pipeline}

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/pipeline/execute \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'pipeline={"steps":[
    {"toolId":"resize","settings":{"width":1200}},
    {"toolId":"compress","settings":{"quality":80}},
    {"toolId":"watermark-text","settings":{"text":"© 2025"}}
  ]}'

# Batch (multiple files → ZIP)
curl -X POST http://localhost:1349/api/v1/pipeline/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'pipeline={"steps":[{"toolId":"resize","settings":{"width":800}}]}'
```

每個步驟的輸出就是下一個步驟的輸入。管線預設允許 20 個步驟，可透過 `MAX_PIPELINE_STEPS` 設定。設定 `MAX_PIPELINE_STEPS=0` 可移除此限制。

### 儲存與管理管線 {#save-and-manage-pipelines}

| 方法 | 路徑 | 說明 |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | 儲存具名管線（`name`、`description`、`steps[]`） |
| `GET` | `/api/v1/pipeline/list` | 列出已儲存的管線（管理員可見全部；使用者僅見自己的） |
| `DELETE` | `/api/v1/pipeline/:id` | 刪除（擁有者或管理員） |
| `GET` | `/api/v1/pipeline/tools` | 列出可用於管線步驟的工具 ID |

## 進度追蹤 {#progress-tracking}

長時間執行的工作、排入佇列的工具、批次工作與管線都會透過 Server-Sent Events 發出即時進度。進度串流為公開且以工作 ID 為索引鍵，因此用戶端讀取時無需傳送 Authorization 標頭。

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

事件格式：
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

你可以使用 `POST /api/v1/jobs/:jobId/cancel` 對排入佇列或執行中的工作要求取消。回應為 `{"canceled":true|false}`。

## 檔案庫 {#file-library}

具有版本歷程的持久檔案儲存。

| 方法 | 路徑 | 說明 |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | 上傳檔案到工作區（暫存處理） |
| `POST` | `/api/v1/files/upload` | 上傳檔案到持久檔案庫 |
| `POST` | `/api/v1/files/save-result` | 將工具處理結果另存為新的檔案版本 |
| `GET` | `/api/v1/files` | 列出已儲存檔案（分頁，含搜尋） |
| `GET` | `/api/v1/files/:id` | 取得檔案中繼資料 + 版本鏈 |
| `GET` | `/api/v1/files/:id/download` | 下載檔案 |
| `GET` | `/api/v1/files/:id/thumbnail` | 取得 300px JPEG 縮圖 |
| `DELETE` | `/api/v1/files` | 大量刪除檔案及其版本鏈（主體：`{ ids: [...] }`） |
| `POST` | `/api/v1/fetch-urls` | 將遠端 URL 擷取到工作區，供以 URL 為基礎的匯入 |
| `POST` | `/api/v1/preview` | 產生瀏覽器相容的 WebP 預覽（適用於 HEIC/HEIF/RAW 格式） |
| `GET` | `/api/v1/files/:id/preview` | 為已儲存的 PDF、辦公文件、影片或音訊檔串流已快取或已產生的瀏覽器相容預覽 |
| `POST` | `/api/v1/preview/generate` | 為已上傳的媒體檔產生隨選 MP4 或 MP3 預覽，而無需先儲存 |
| `GET` | `/api/v1/download/:jobId/:filename` | 從工作區下載已處理的檔案 |

若要將工具結果自動儲存至檔案庫，請包含 `fileId` 作為 multipart 表單欄位，參照現有的檔案庫檔案。處理結果將另存為新版本。

## API 金鑰管理 {#api-key-management}

| 方法 | 路徑 | 存取權 | 說明 |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | 需驗證 | 產生新金鑰 - 只顯示一次 |
| `GET` | `/api/v1/api-keys` | 需驗證 | 列出金鑰（名稱、id、lastUsedAt - 不含原始金鑰） |
| `DELETE` | `/api/v1/api-keys/:id` | 需驗證 | 刪除金鑰 |

## 團隊 {#teams}

| 方法 | 路徑 | 存取權 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | 管理員（`teams:manage`） | 列出團隊 |
| `POST` | `/api/v1/teams` | 管理員（`teams:manage`） | 建立團隊 |
| `PUT` | `/api/v1/teams/:id` | 管理員（`teams:manage`） | 重新命名團隊 |
| `DELETE` | `/api/v1/teams/:id` | 管理員（`teams:manage`） | 刪除團隊（無法刪除預設團隊或有成員的團隊） |

## 設定 {#settings}

執行時的鍵值設定（任何已驗證使用者皆可讀取，僅管理員可寫入）。

| 方法 | 路徑 | 說明 |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | 取得所有設定 |
| `PUT` | `/api/v1/settings` | 大量更新設定（含鍵值對的 JSON 主體） |
| `GET` | `/api/v1/settings/:key` | 依索引鍵取得特定設定 |

已知索引鍵：`disabledTools`（工具 ID 的 JSON 陣列）、`enableExperimentalTools`（bool 字串）、`loginAttemptLimit`（數字）。

## 偏好設定 {#preferences}

各使用者的偏好設定與執行個體設定是分開的。任何已驗證使用者皆可讀取並更新自己的偏好設定對應。

| 方法 | 路徑 | 說明 |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | 以 `{ "preferences": { ... } }` 取得目前使用者的偏好設定 |
| `PUT` | `/api/v1/preferences` | 為目前使用者插入或更新一個以上的偏好設定索引鍵 |

## 角色 {#roles}

具有細緻權限的自訂角色管理。

| 方法 | 路徑 | 存取權 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | 管理員（`audit:read`） | 列出所有角色及使用者數 |
| `POST` | `/api/v1/roles` | 管理員（`security:manage`） | 建立自訂角色（`name`、`description`、`permissions`） |
| `PUT` | `/api/v1/roles/:id` | 管理員（`security:manage`） | 更新自訂角色（無法修改內建角色） |
| `DELETE` | `/api/v1/roles/:id` | 管理員（`security:manage`） | 刪除自訂角色（無法刪除內建角色；受影響的使用者會還原為 `user` 角色） |

可用權限（17 個）：`tools:use`、`files:own`、`files:all`、`apikeys:own`、`apikeys:all`、`pipelines:own`、`pipelines:all`、`settings:read`、`settings:write`、`users:manage`、`teams:manage`、`features:manage`、`system:health`、`audit:read`、`compliance:manage`、`webhooks:manage`、`security:manage`。

## 稽核記錄 {#audit-log}

供檢視安全相關動作的僅限管理員端點。

| 方法 | 路徑 | 存取權 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | 管理員（`audit:read`） | 分頁稽核記錄，含可選篩選條件 |

查詢參數：

| 參數 | 說明 |
|-----------|-------------|
| `page` | 頁碼（預設：1） |
| `limit` | 每頁筆數（預設：50，上限：100） |
| `action` | 依動作類型篩選（例如 `ROLE_CREATED`、`ROLE_DELETED`） |
| `ip` | 依來源 IP 位址篩選 |
| `from` | 篩選此 ISO 8601 日期之後的項目 |
| `to` | 篩選此 ISO 8601 日期之前的項目 |

## 分析 {#analytics}

| 方法 | 路徑 | 存取權 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | 公開 | 取得有效的分析設定（PostHog 金鑰、Sentry DSN、取樣率）。當分析關閉時，無論是來自編譯期烘焙或執行個體的 `analyticsEnabled` 設定，金鑰、DSN 與執行個體 ID 都會是空白。 |
| `POST` | `/api/v1/feedback` | 需驗證 | 將明確的使用者意見回饋以 `feedback_submitted` 形式提交給已設定的 PostHog 專案。此路由遵守分析閘門、對提交進行速率限制、除非 `contactOk` 為 true 否則移除聯絡欄位，且絕不接受檔案內容、檔案名稱、上傳路徑或原始私密錯誤文字。分析停用時，回傳 `{ "ok": true, "accepted": false }`。 |
| `PUT` | `/api/v1/settings` | 管理員（`settings:write`） | 設定執行個體層級的退出。傳送 JSON 主體 `{ "analyticsEnabled": "false" }` 為所有人關閉分析，或 `"true"` 重新開啟。 |

## 功能／AI 套件包 {#features-ai-bundles}

管理 AI 功能套件包（在 Docker 環境中安裝／解除安裝 AI 模型套件）。

| 方法 | 路徑 | 存取權 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | 需驗證 | 列出所有功能套件包及其安裝狀態 |
| `POST` | `/api/v1/admin/features/:bundleId/install` | 管理員（`features:manage`） | 安裝功能套件包（非同步，回傳 `jobId` 供進度追蹤） |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | 管理員（`features:manage`） | 解除安裝功能套件包並清理模型檔案 |
| `GET` | `/api/v1/admin/features/disk-usage` | 管理員（`features:manage`） | 取得 AI 模型的總磁碟使用量 |
| `POST` | `/api/v1/admin/features/import` | 管理員（`features:manage`） | 匯入離線 AI 套件包封存檔 |

## 管理操作 {#admin-operations}

供可觀測性、支援、使用回報與備份狀態用的操作端點。

| 方法 | 路徑 | 存取權 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | 管理員（`settings:write`） | 讀取目前的執行時記錄層級 |
| `POST` | `/api/v1/admin/log-level` | 管理員（`settings:write`） | 變更執行時記錄層級（`fatal`、`error`、`warn`、`info`、`debug`、`trace` 或 `silent`） |
| `GET` | `/api/v1/metrics` | 管理員（`system:health`） | 文字格式的 Prometheus 指標 |
| `GET` | `/api/v1/admin/support-bundle` | 管理員（`system:health`） | 下載已編修的診斷支援套件 ZIP |
| `GET` | `/api/v1/admin/usage` | 管理員（`audit:read`） | 使用儀表板資料，含可選的 `days` 查詢參數 |
| `GET` | `/api/v1/admin/backup-status` | 管理員（`system:health`） | 讀取上次備份中繼資料與新鮮度狀態 |
| `POST` | `/api/v1/admin/backup-status` | 管理員（`system:health`） | 記錄一次已完成的備份（`type`，可選 `sizeBytes`，可選 `notes`） |

## 企業版 API {#enterprise-apis}

這些路由由其相關的企業版功能進行授權閘控。它們仍需要所列的 SnapOtter 權限。

| 方法 | 路徑 | 存取權 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | 管理員（`audit:read`） | 以 JSON 或 CSV 格式匯出稽核項目，含篩選條件 |
| `GET` | `/api/v1/enterprise/config/export` | 管理員（`system:health`） | 匯出已編修的執行個體設定、自訂角色與團隊 |
| `POST` | `/api/v1/enterprise/config/import` | 管理員（`system:health`） | 匯入設定，含可選的試執行 |
| `GET` | `/api/v1/enterprise/ip-allowlist` | 管理員（`security:manage`） | 讀取已設定的 CIDR 允許清單 |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | 管理員（`security:manage`） | 更新 CIDR 允許清單，並防止自我鎖定 |
| `GET` | `/api/v1/enterprise/legal-hold` | 管理員（`compliance:manage`） | 列出使用者與團隊的法律保留 |
| `PUT` | `/api/v1/enterprise/legal-hold` | 管理員（`compliance:manage`） | 對使用者或團隊套用或解除法律保留 |
| `POST` | `/api/v1/enterprise/scim/token` | 管理員（`users:manage`） | 產生 SCIM bearer 權杖，只回傳一次 |
| `DELETE` | `/api/v1/enterprise/scim/token` | 管理員（`users:manage`） | 撤銷目前的 SCIM bearer 權杖 |
| `GET` | `/api/v1/enterprise/siem/config` | 管理員（`webhooks:manage`） | 讀取 SIEM 轉發設定 |
| `PUT` | `/api/v1/enterprise/siem/config` | 管理員（`webhooks:manage`） | 更新 SIEM 轉發設定 |
| `GET` | `/api/v1/enterprise/webhooks` | 管理員（`webhooks:manage`） | 列出 webhook 目的地 |
| `POST` | `/api/v1/enterprise/webhooks` | 管理員（`webhooks:manage`） | 建立 webhook 目的地 |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | 管理員（`webhooks:manage`） | 更新 webhook 目的地 |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | 管理員（`webhooks:manage`） | 刪除 webhook 目的地 |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | 管理員（`webhooks:manage`） | 傳送測試 webhook 酬載 |
| `POST` | `/api/v1/enterprise/users/:id/export` | 管理員（`compliance:manage`） | 啟動 GDPR 使用者匯出工作 |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | 管理員（`compliance:manage`） | 讀取 GDPR 匯出狀態與下載 URL |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | 管理員（`compliance:manage`） | 經確認後永久清除使用者資料 |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | 管理員（`compliance:manage`） | 經確認後永久清除團隊資料 |
| `GET` | `/api/v1/admin/version` | 管理員（`system:health`） | 讀取應用程式、組建、Node 與結構描述版本中繼資料 |
| `GET` | `/api/v1/admin/migrations/pending` | 管理員（`system:health`） | 比較封裝的遷移與已套用的遷移 |
| `GET` | `/api/v1/admin/upgrade-check` | 管理員（`system:health`） | 執行升級就緒檢查 |

### SCIM 2.0 {#scim-2-0}

SCIM 探索端點為公開。使用者與群組端點需要上方產生的 SCIM bearer 權杖。

| 方法 | 路徑 | 存取權 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | 公開 | SCIM 伺服器功能 |
| `GET` | `/api/v1/scim/v2/Schemas` | 公開 | SCIM 結構描述探索 |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | 公開 | SCIM 資源類型探索 |
| `GET` | `/api/v1/scim/v2/Users` | SCIM 權杖 | 列出使用者，含可選的 SCIM 篩選 |
| `POST` | `/api/v1/scim/v2/Users` | SCIM 權杖 | 建立使用者 |
| `GET` | `/api/v1/scim/v2/Users/:id` | SCIM 權杖 | 取得使用者 |
| `PUT` | `/api/v1/scim/v2/Users/:id` | SCIM 權杖 | 取代使用者 |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | SCIM 權杖 | 軟性停用使用者 |
| `GET` | `/api/v1/scim/v2/Groups` | SCIM 權杖 | 以 SCIM 群組形式列出團隊 |
| `POST` | `/api/v1/scim/v2/Groups` | SCIM 權杖 | 建立團隊 |
| `GET` | `/api/v1/scim/v2/Groups/:id` | SCIM 權杖 | 取得團隊 |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | SCIM 權杖 | 取代團隊與群組成員資格 |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | SCIM 權杖 | 刪除團隊 |

## 迷因範本 {#meme-templates}

支援迷因產生器工具的 API。

| 方法 | 路徑 | 存取權 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | 需驗證 | 列出所有可用的迷因範本及文字方塊位置 |
| `GET` | `/api/v1/meme-templates/full/:filename` | 需驗證 | 提供全尺寸範本圖片 |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | 需驗證 | 提供範本縮圖 |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | 需驗證 | 提供迷因文字渲染所用的字型檔 |

## 錯誤回應 {#error-responses}

所有錯誤都回傳 JSON：

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| 狀態 | 意義 |
|--------|---------|
| 400 | 無效請求／驗證失敗 |
| 401 | 未驗證 |
| 403 | 權限不足 |
| 404 | 找不到資源 |
| 413 | 檔案過大（請參閱 `MAX_UPLOAD_SIZE_MB`） |
| 422 | 驗證後處理失敗 |
| 429 | 已達速率限制（請參閱 `RATE_LIMIT_PER_MIN`） |
| 501 | 未安裝所需的 AI 功能套件包（`FEATURE_NOT_INSTALLED`） |
| 500 | 內部伺服器錯誤 |
