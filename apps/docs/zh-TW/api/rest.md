---
description: "完整的 REST API 參考。工具端點、批次處理、管線、檔案庫、驗證、團隊與管理操作。"
i18n_output_hash: 9fa4a9a91996
i18n_source_hash: 7e0a0db4abe0
i18n_provenance: human
---

# REST API 參考 {#rest-api-reference}

可在 [http://localhost:1349/api/docs](http://localhost:1349/api/docs) 取得含請求／回應範例的互動式 API 文件。

機器可讀規格：
- `/api/v1/openapi.yaml` - OpenAPI 3.1 規格
- `/llms.txt` - 便於 LLM 使用的摘要
- `/llms-full.txt` - 完整的 LLM 友善文件

## 驗證 {#authentication}

除非 `AUTH_ENABLED=false`，所有端點都需要驗證。

### Session Token {#session-token}

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

Session 會在 7 天後過期（可透過 `SESSION_DURATION_HOURS` 設定）。

### API Keys {#api-keys}

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

Key 以 `si_` 為前綴並以 scrypt 雜湊儲存，原始 key 只會顯示一次，之後無法再取回。

### 驗證端點 {#auth-endpoints}

| Method | Path | 存取權限 | 說明 |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Public | 登入，取得 session token |
| `POST` | `/api/auth/logout` | Auth | 銷毀目前的 session |
| `GET` | `/api/auth/session` | Auth | 驗證目前的 session |
| `POST` | `/api/auth/change-password` | Auth | 變更自己的密碼（會使所有其他 session 與 API key 失效） |
| `GET` | `/api/auth/users` | Admin | 列出所有使用者 |
| `POST` | `/api/auth/register` | Admin | 建立新使用者 |
| `PUT` | `/api/auth/users/:id` | Admin | 更新使用者角色或團隊 |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | 重設使用者密碼 |
| `DELETE` | `/api/auth/users/:id` | Admin | 刪除使用者 |
| `GET` | `/api/v1/config/auth` | Public | 檢查是否已啟用驗證（`{ authEnabled: bool }`） |
| `POST` | `/api/auth/mfa/enroll` | Auth | 啟動 TOTP MFA 註冊。需要企業版 `mfa` 功能 |
| `POST` | `/api/auth/mfa/verify` | Auth | 以 TOTP 代碼確認 MFA 註冊 |
| `POST` | `/api/auth/mfa/complete` | Public | 完成待處理的 MFA 登入挑戰 |
| `POST` | `/api/auth/mfa/disable` | Auth | 為目前使用者停用 MFA |
| `POST` | `/api/auth/users/:id/mfa/reset` | Admin（`users:manage`） | 重設某使用者的 MFA |
| `GET` | `/api/auth/oidc/login` | Public | 啟用 OIDC 時啟動 OIDC 登入 |
| `GET` | `/api/auth/oidc/callback` | Public | OIDC 授權回呼 |
| `GET` | `/api/auth/saml/metadata` | Public | 啟用 SAML 時的 SAML SP metadata XML |
| `GET` | `/api/auth/saml/login` | Public | 啟動 SAML 登入 |
| `POST` | `/api/auth/saml/callback` | Public | SAML assertion consumer service |

當使用者啟用 MFA 時，`POST /api/auth/login` 會回傳 `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` 而非 session token。將該 `mfaToken` 加上 TOTP 或復原代碼送至 `/api/auth/mfa/complete`。

### 權限 {#permissions}

| 權限 | Admin | User |
|-----------|:-----:|:----:|
| 使用工具 | ✓ | ✓ |
| 擁有檔案／管線／API key | ✓ | ✓ |
| 查看所有使用者的檔案／管線／key | ✓ | - |
| 寫入設定 | ✓ | - |
| 管理使用者與團隊 | ✓ | - |
| 管理品牌 | ✓ | - |

## 健康檢查 {#health-check}

| Method | Path | 存取權限 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Public | 基本健康檢查。健康時回傳 `{"status":"healthy","version":"..."}` 與 200；若資料庫無法連線則回傳 `{"status":"unhealthy"}` 與 503。 |
| `GET` | `/api/v1/readyz` | Public | 就緒探測。檢查 PostgreSQL、Redis、磁碟空間，以及設定後的 S3。當該執行個體不應接收流量時回傳 503。 |
| `GET` | `/api/v1/admin/health` | Admin（`system:health`） | 詳細診斷資訊，包含執行時間、儲存模式、資料庫狀態、佇列狀態與 GPU 可用性。 |

## 使用工具 {#using-tools}

每個工具都遵循相同模式：

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

`<section>` 是 `image`、`video`、`audio`、`pdf` 或 `files` 其中之一。

- 上傳為 `multipart/form-data`。
- `settings` 是含工具專屬選項的 JSON 字串。
- `clientJobId` 是選用的表單欄位，用於呼叫端提供的進度關聯。
- `fileId` 是選用的表單欄位，參照現有的檔案庫項目。存在時，處理後的輸出會另存為新版本，且回應會包含 `savedFileId`。
- **快速工具**通常回傳 200 JSON：`{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`。從 `downloadUrl` 取回處理後的檔案。
- **任何排入佇列的工具**若為長時間執行或超過同步等待視窗，可能回傳 202 JSON：`{"jobId":"...","async":true}`。連線至 SSE 取得進度，完成後再下載（請見 [進度追蹤](#progress-tracking)）。
- **批次**路由會直接串流回傳 ZIP 封存（帶有 `X-Job-Id` 標頭），適用於註冊在通用批次登錄表中的工具。

## 工具參考 {#tools-reference}

### 轉換預設 {#conversion-presets}

共用目錄包含 83 個專屬的轉換預設端點，例如 `jpg-to-png`、`mov-to-mp4`、`m4a-to-mp3`、`pdf-to-jpg` 與 `excel-to-csv`。預設是第一級工具路由：

`POST /api/v1/tools/<section>/<presetId>`

每個預設都會鎖定輸出格式，並委派給某個基底工具，例如 `convert`、`convert-video`、`extract-audio`、`convert-audio`、`image-to-pdf`、`pdf-to-image`、`svg-to-raster` 或 `convert-spreadsheet`。完整的路由表與選用設定請見 [轉換預設](/zh-TW/tools/conversion-presets)。

### 基本功能 {#essentials}

| Tool ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `resize` | 調整大小 | `width`、`height`、`fit`（cover/contain/fill/inside/outside）、`percentage`、`withoutEnlargement`，另有 23 個社群媒體預設 |
| `crop` | 裁切 | `left`、`top`、`width`、`height`、`unit`（px/percent） |
| `rotate` | 旋轉與翻轉 | `angle`、`horizontal`（bool）、`vertical`（bool） |
| `convert` | 轉換 | `format`（jpg/png/webp/avif/tiff/gif/heic/heif）、`quality` |
| `compress` | 壓縮 | `mode`（quality/targetSize）、`quality`（1–100）、`targetSizeKb` |

### 最佳化 {#optimization}

| Tool ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `optimize-for-web` | Web 最佳化 | `format`（webp/jpeg/avif/png）、`quality`、`maxWidth`、`maxHeight`、`progressive`、`stripMetadata` |
| `strip-metadata` | 移除中繼資料 | - |
| `edit-metadata` | 編輯中繼資料 | `title`、`description`、`author`、`copyright`、`keywords`、`gps`（lat/lon）、`dateTime` |
| `bulk-rename` | 批次重新命名 | `pattern`（支援 `{n}`、`{date}`、`{original}`）、`startIndex`、`padding` |
| `image-to-pdf` | 圖片轉 PDF | `pageSize`（A4/Letter/...）、`orientation`、`margin`、`targetSize`（{value, unit}） |
| `favicon` | Favicon 產生器 | `padding`、`backgroundColor`、`borderRadius` - 產生所有標準尺寸 |

### 調整 {#adjustments}

| Tool ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `adjust-colors` | 調整色彩 | `brightness`、`contrast`、`exposure`、`saturation`、`temperature`、`tint`、`hue`、`sharpness`、`red`、`green`、`blue`、`effect`（none/grayscale/sepia/invert） |
| `sharpening` | 銳化 | `method`（adaptive/unsharp-mask/high-pass）、`sigma`、`m1`、`m2`、`x1`、`y2`、`y3`、`amount`、`radius`、`threshold`、`strength`、`kernelSize`（3/5）、`denoise`（off/light/medium/strong） |
| `replace-color` | 取代色彩 | `sourceColor`、`targetColor`（取代色）、`makeTransparent`、`tolerance` |
| `color-blindness` | 色盲模擬 | `simulationType`（protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy，預設 "deuteranomaly"） |
| `duotone` | 雙色調 | `shadow`（hex）、`highlight`（hex）、`intensity`（0-100） |
| `pixelate` | 像素化 | `blockSize`（2-128）、`region`（{left, top, width, height}，用於部分像素化） |
| `vignette` | 暈影 | `strength`（0.1-1）、`color`（hex）、`radius`、`softness`、`roundness`、`centerX`、`centerY` |

### AI 工具 {#ai-tools}

所有 AI 工具都在你的硬體上執行：預設使用 CPU，或在有支援的 NVIDIA GPU 時使用 NVIDIA CUDA。目前不支援透過 VA-API、Quick Sync 或 OpenCL 的 Intel/AMD iGPU 加速做 AI 推論。無需連網。

| Tool ID | 名稱 | AI 模型 | 主要設定 |
|---------|------|---------|-------------|
| `remove-background` | 移除背景 | rembg（BiRefNet / U2-Net） | `model`、`backgroundType`（transparent/color/gradient/blur/image）、`backgroundColor`、`gradientColor1`、`gradientColor2`、`gradientAngle`、`blurEnabled`、`blurIntensity`、`shadowEnabled`、`shadowOpacity` |
| `upscale` | 影像放大 | RealESRGAN | `scale`（2/4）、`model`、`faceEnhance`、`denoise`、`format`、`quality` |
| `erase-object` | 物件消除 | LaMa（ONNX） | 遮罩以第二個檔案部分傳送（欄位名 `mask`）、`format`、`quality` |
| `ocr` | OCR / 文字擷取 | Tesseract（快速）；RapidOCR + PP-OCR ONNX（平衡/最佳） | `quality`（快速/平衡/最佳）、`language`、`enhance` |
| `blur-faces` | 臉部／PII 模糊 | MediaPipe | `blurRadius`、`sensitivity` |
| `smart-crop` | 智慧裁切 | MediaPipe + Sharp | `mode`（subject/face/trim）、`strategy`（attention/entropy）、`width`、`height`、`padding`、`facePreset`（closeup/head-shoulders/upper-body/half-body）、`sensitivity`、`threshold`、`padToSquare`、`padColor`、`targetSize`、`quality` |
| `image-enhancement` | 影像強化 | 以分析為基礎 | `mode`（auto/exposure/contrast/color/sharpness）、`strength` |
| `enhance-faces` | 臉部強化 | GFPGAN / CodeFormer | `model`（gfpgan/codeformer）、`strength`、`sensitivity`、`centerFace` |
| `colorize` | AI 上色 | DDColor | `intensity`、`model` |
| `noise-removal` | 雜訊移除 | 分層降噪 | `tier`（quick/balanced/quality/maximum）、`strength`、`detailPreservation`、`colorNoise`、`format`、`quality` |
| `red-eye-removal` | 移除紅眼 | 臉部特徵點 + 色彩分析 | `sensitivity`、`strength` |
| `restore-photo` | 照片修復 | 多步驟管線 | `mode`（auto/light/heavy）、`scratchRemoval`、`faceEnhancement`、`fidelity`、`denoise`、`denoiseStrength`、`colorize` |
| `passport-photo` | 證件照 | MediaPipe 特徵點 | 兩階段流程。分析使用 multipart `file`；產生使用 JSON，含 `countryCode`、`bgColor`、`printLayout`（none/4x6/a4）、特徵點、影像尺寸 |
| `content-aware-resize` | 內容感知調整大小 | Seam carving（caire） | `width`、`height`、`protectFaces`、`blurRadius`、`sobelThreshold`、`square` |
| `transparency-fixer` | PNG 透明度修正 | BiRefNet HR-matting | `defringe`（0-100）、`outputFormat`（png/webp） |
| `background-replace` | 背景取代 | rembg（BiRefNet） | `backgroundType`（color/gradient）、`color`（hex）、`gradientColor1`、`gradientColor2`、`gradientAngle`、`feather`（0-20）、`format`（png/webp） |
| `blur-background` | 模糊背景 | rembg（BiRefNet） | `intensity`（1-100）、`feather`（0-20）、`format`（png/webp） |
| `ai-canvas-expand` | AI 畫布擴展 | LaMa（outpainting） | `extendTop`、`extendRight`、`extendBottom`、`extendLeft`（px）、`tier`（fast/balanced/high）、`format`、`quality` |

### 浮水印與疊加 {#watermark-overlay}

| Tool ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `watermark-text` | 文字浮水印 | `text`、`font`、`fontSize`、`color`、`opacity`、`position`、`rotation`、`tile` |
| `watermark-image` | 圖片浮水印 | `opacity`、`position`、`scale` - 第二個檔案為浮水印 |
| `text-overlay` | 文字疊加 | `text`、`font`、`fontSize`、`color`、`x`、`y`、`background`、`padding`、`borderRadius` |
| `compose` | 影像合成 | `x`、`y`、`opacity`、`blend` - 第二個檔案疊在上方 |
| `meme-generator` | 迷因產生器 | `templateId`、`textLayout`（top-bottom/top-only/bottom-only/center/side-by-side）、`textBoxes`（[{id, text}]）、`fontFamily`（anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto）、`fontSize`、`textColor`、`strokeColor`、`textAlign`、`allCaps`。支援範本模式（帶有 `templateId` 的 JSON 主體）或自訂圖片模式（帶有檔案的 multipart）。 |

### 公用工具 {#utilities}

| Tool ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `info` | 影像資訊 | - （回傳寬度、高度、格式、大小、通道、hasAlpha、DPI、EXIF） |
| `compare` | 影像比較 | `mode`（side-by-side/overlay/diff）、`diffThreshold` - 第二個檔案為比較目標 |
| `find-duplicates` | 尋找重複 | `threshold`（感知雜湊距離，預設 8） - 多檔案 |
| `color-palette` | 色彩調色盤 | `count`（主要顏色數量）、`format`（hex/rgb） |
| `qr-generate` | QR Code 產生器 | `data`、`size`、`margin`、`colorDark`、`colorLight`、`errorCorrectionLevel`、`dotStyle`、`cornerStyle`、`logo`（選用檔案） |
| `barcode-read` | 條碼讀取器 | - （自動偵測 QR、EAN、Code128、DataMatrix 等） |
| `image-to-base64` | 影像轉 Base64 | `format`（data-uri/plain）、`mimeType` |
| `html-to-image` | HTML 轉圖片 | `url`、`format`（png/jpg/webp）、`quality`、`fullPage`、`devicePreset`（desktop/tablet/mobile/custom）、`viewportWidth`、`viewportHeight` |
| `histogram` | 直方圖 | `scale`（linear/log） - 回傳 RGB 直方圖圖表 + 各通道統計 |
| `lqip-placeholder` | LQIP 佔位圖 | `width`（4-64）、`blur`、`strategy`（blur/pixelate/solid）、`format`（webp/png/jpeg）、`quality` |
| `barcode-generate` | 條碼產生器 | `text`、`type`（code128/ean13/upca/code39/itf14/datamatrix）、`scale`（1-8）、`includeText`（bool）。JSON 主體，不需上傳檔案。 |

### 版面與構圖 {#layout-composition}

| Tool ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `collage` | 拼貼／網格 | `template`（25+ 種版面）、`gap`、`backgroundColor`、`borderRadius` - 多檔案 |
| `stitch` | 拼接／合併 | `direction`（horizontal/vertical/grid）、`gap`、`backgroundColor`、`alignment` - 多檔案 |
| `split` | 影像分割 | `mode`（grid/rows/cols）、`rows`、`cols`、`tileWidth`、`tileHeight` |
| `border` | 邊框與框架 | `width`、`color`、`style`（solid/gradient/pattern）、`borderRadius`、`padding`、`shadow` |
| `beautify` | 美化螢幕截圖 | `backgroundType`（solid/linear-gradient/radial-gradient/image/transparent）、`gradientStops`、`padding`、`borderRadius`、`shadowPreset`、`frame`（none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...）、`socialPreset`（none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt）、`watermarkText`、`outputFormat` |
| `circle-crop` | 圓形裁切 | `zoom`（1-5）、`offsetX`、`offsetY`、`borderWidth`、`borderColor`、`background`（transparent/hex）、`outputSize` |
| `image-pad` | 影像填充 | `target`（16:9/9:16/1:1/4:3/3:4/custom）、`ratioW`、`ratioH`、`background`（color/transparent/blur）、`color`（hex）、`padding`（0-50%） |
| `sprite-sheet` | 精靈圖表 | `columns`（1-16）、`padding`、`background`（hex）、`format`（png/webp/jpeg）、`quality` - 多檔案（2-64 張圖片） |

### 格式與轉換 {#format-conversion}

| Tool ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `svg-to-raster` | SVG 轉點陣圖 | `format`（png/jpeg/webp/avif/tiff/gif/heif）、`width`、`height`、`scale`、`dpi`、`background` |
| `vectorize` | 影像轉 SVG | `colorMode`（bw/color）、`threshold`、`colorPrecision`、`filterSpeckle`、`pathMode`（none/polygon/spline） |
| `gif-tools` | GIF 工具 | `action`（resize/optimize/reverse/speed/extract-frames/rotate/add-text）、各動作專屬參數 |
| `gif-webp` | GIF/WebP 轉換器 | `quality`（1-100）、`lossless`（bool）、`resizePercent`（10-100） |

### 影片工具 {#video-tools}

| Tool ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `convert-video` | 轉換影片 | `format`（mp4/mov/webm/avi/mkv）、`quality`（high/balanced/small） |
| `compress-video` | 壓縮影片 | `quality`（light/balanced/strong）、`resolution`（original/1080p/720p/480p） |
| `trim-video` | 修剪影片 | `startS`、`endS`、`precise`（bool，影格精確剪輯） |
| `mute-video` | 靜音影片 | - |
| `video-to-gif` | 影片轉 GIF | `fps`（1-30）、`width`、`startS`、`durationS`（最多 60 秒） |
| `resize-video` | 調整影片大小 | `width`、`height`、`preset`（custom/2160p/1440p/1080p/720p/480p/360p） |
| `crop-video` | 裁切影片 | `width`、`height`、`x`、`y` |
| `rotate-video` | 旋轉影片 | `transform`（cw90/ccw90/180/hflip/vflip） |
| `change-fps` | 變更 FPS | `fps`（1-120） |
| `video-color` | 影片色彩 | `brightness`、`contrast`、`saturation`、`gamma` |
| `video-speed` | 影片速度 | `factor`（0.25-4）、`keepPitch`（bool） |
| `reverse-video` | 倒轉影片 | - （最多 5 分鐘） |
| `video-loudnorm` | 正規化音訊 | - （EBU R128） |
| `aspect-pad` | 比例填充 | `target`（16:9/9:16/1:1/4:3/3:4）、`color`（hex） |
| `blur-pad` | 模糊填充 | `target`（16:9/9:16/1:1/4:3/3:4）、`blur`（2-50） |
| `watermark-video` | 影片浮水印 | `text`、`position`、`fontSize`、`opacity`、`color` |
| `stabilize-video` | 影片穩定 | `smoothing`（5-60，以影格計） |
| `gif-to-video` | GIF 轉影片 | `format`（mp4/webm/mov） |
| `video-to-webp` | 影片轉 WebP | `fps`、`width`、`quality`、`loop`（bool） |
| `video-to-frames` | 影片轉影格 | `mode`（all/nth/timestamps）、`n`、`timestamps`、`format`（png/jpg） |
| `merge-videos` | 合併影片 | - （多檔案，正規化為第一段影片的解析度） |
| `replace-audio` | 取代音訊 | - （影片 + 音訊檔，兩個檔案） |
| `burn-subtitles` | 燒錄字幕 | `fontSize`（8-72） - 影片 + 字幕檔 |
| `embed-subtitles` | 嵌入字幕 | `language`（ISO 639-2/B 代碼） - 影片 + 字幕檔 |
| `extract-subtitles` | 擷取字幕 | - （輸出 SRT） |
| `images-to-video` | 圖片轉影片 | `secondsPerImage`（0.5-10）、`resolution`（1080p/720p/square）、`fps` - 多檔案 |
| `video-metadata` | 清除影片中繼資料 | - |
| `auto-subtitles` | 自動字幕（AI） | `language`（auto/en/de/fr/es/zh/ja/ko/id/th/vi）、`format`（srt/vtt） |
| `extract-audio` | 擷取音訊 | `format`（mp3/wav/m4a/ogg） |

### 音訊工具 {#audio-tools}

| Tool ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `convert-audio` | 轉換音訊 | `format`（mp3/wav/ogg/flac/m4a）、`bitrateKbps`（32-320） |
| `trim-audio` | 修剪音訊 | `startS`、`endS` |
| `volume-adjust` | 音量調整 | `gainDb`（-30 至 30） |
| `normalize-audio` | 正規化音訊 | - （EBU R128，-16 LUFS） |
| `fade-audio` | 淡入淡出音訊 | `fadeInS`（0-30）、`fadeOutS`（0-30） |
| `reverse-audio` | 倒轉音訊 | - |
| `audio-speed` | 音訊速度 | `factor`（0.25-4） |
| `pitch-shift` | 音高位移 | `semitones`（-12 至 12） |
| `audio-channels` | 音訊聲道 | `mode`（stereo-to-mono/mono-to-stereo/swap） |
| `silence-removal` | 移除靜音 | `thresholdDb`（-80 至 -20）、`minSilenceS`（0.1-5） |
| `noise-reduction` | 降噪 | `strength`（light/medium/strong） |
| `merge-audio` | 合併音訊 | `format`（mp3/wav/flac/m4a） - 多檔案 |
| `split-audio` | 分割音訊 | `mode`（time/parts/silence）、`segmentS`、`parts`、`thresholdDb`、`minSilenceS` |
| `ringtone-maker` | 鈴聲製作 | `startS`、`durationS`（1-30） |
| `waveform-image` | 波形圖 | `width`、`height`、`color`（hex） |
| `audio-metadata` | 音訊中繼資料 | `strip`（bool）、`title`、`artist`、`album` |
| `transcribe-audio` | 音訊轉錄（AI） | `language`（auto/en/de/fr/es/zh/ja/ko/id/th/vi）、`outputFormat`（txt/srt/vtt） |

### 文件工具 {#document-tools}

| Tool ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `merge-pdf` | 合併 PDF | - （多檔案，最多 20 個 PDF） |
| `split-pdf` | 分割 PDF | `mode`（range/every）、`range`、`everyN`（1-500） |
| `compress-pdf` | 壓縮 PDF | `mode`（quality/targetSize）、`quality`（1-100）、`targetSizeKb` |
| `rotate-pdf` | 旋轉 PDF | `angle`（90/180/270）、`range`（頁面範圍） |
| `extract-pages` | 擷取頁面 | `range`（qpdf 語法，例如 "1-5,8,10-z"） |
| `remove-pages` | 移除頁面 | `pages`（要移除的 qpdf 範圍） |
| `organize-pdf` | 整理 PDF | `order`（qpdf 頁面順序，例如 "3,1,2,5-z"） |
| `protect-pdf` | 保護 PDF | `userPassword`、`ownerPassword`（AES-256） |
| `unlock-pdf` | 解鎖 PDF | `password` |
| `repair-pdf` | 修復 PDF | - |
| `linearize-pdf` | Web 最佳化 PDF | - （線性化以便快速網頁檢視） |
| `grayscale-pdf` | 灰階 PDF | - |
| `pdfa-convert` | PDF/A 轉換 | - （封存用 PDF/A-2） |
| `crop-pdf` | 裁切 PDF | `margin`（0-2000 點） |
| `nup-pdf` | N-up PDF | `perSheet`（2/3/4/8/9/12/16） |
| `booklet-pdf` | 小冊子 PDF | `perSheet`（2/4/6/8） |
| `watermark-pdf` | PDF 浮水印 | `text`、`position`、`fontSize`、`opacity`、`rotation` |
| `pdf-page-numbers` | PDF 頁碼 | `position`（bl/bc/br/tl/tc/tr）、`fontSize` |
| `flatten-pdf` | 平面化 PDF | - （將表單與註解烘焙進去） |
| `redact-pdf` | 遮蔽 PDF | `terms`（string[]）、`caseSensitive`（bool） |
| `sign-pdf` | 簽署 PDF | 自訂 multipart 路由，含 PDF `file`、簽名檔案 `sig0`、`sig1` 與 `placements` JSON 陣列 |
| `pdf-to-text` | PDF 轉文字 | - |
| `pdf-to-word` | PDF 轉 Word | - |
| `pdf-metadata` | PDF 中繼資料 | `title`、`author`、`subject`、`keywords` |
| `convert-document` | 轉換文件 | `format`（docx/odt/rtf/txt） |
| `convert-presentation` | 轉換簡報 | `format`（pptx/odp） |
| `convert-spreadsheet` | 轉換試算表 | `format`（xlsx/ods/csv） |
| `excel-to-pdf` | Excel 轉 PDF | - |
| `word-to-pdf` | Word 轉 PDF | - |
| `powerpoint-to-pdf` | PowerPoint 轉 PDF | - |
| `html-to-pdf` | HTML 轉 PDF | - （已停用遠端資源） |
| `markdown-to-docx` | Markdown 轉 Word | - |
| `markdown-to-html` | Markdown 轉 HTML | - |
| `markdown-to-pdf` | Markdown 轉 PDF | - （已停用遠端資源） |
| `epub-convert` | 轉換 EPUB | `format`（pdf/docx/html/md） |
| `to-epub` | 轉換為 EPUB | - （接受 .docx、.md、.html、.txt） |
| `ocr-pdf` | PDF OCR（AI） | `quality`（fast/balanced/best）、`language`（auto/en/de/fr/es/zh/ja/ko）、`pages` |
| `pdf-to-image` | PDF 轉圖片 | `pages`（all/range）、`format`、`dpi`、`quality` |
| `pdf-to-jpg` | PDF 轉 JPG | `pages`、`dpi`、`quality`、`colorMode` |
| `pdf-to-png` | PDF 轉 PNG | `pages`、`dpi`、`quality`、`colorMode` |
| `pdf-to-tiff` | PDF 轉 TIFF | `pages`、`dpi`、`quality`、`colorMode` |

### 檔案工具 {#file-tools}

| Tool ID | 名稱 | 主要設定 |
|---------|------|-------------|
| `chart-maker` | 圖表製作 | `kind`（bar/line/pie）、`title`、`width`、`height` |
| `csv-excel` | CSV 轉 Excel | `sheet`（XLSX 輸入的工作表編號） - 雙向 |
| `csv-json` | CSV 轉 JSON | `pretty`（bool） - 雙向 |
| `json-xml` | JSON 轉 XML | `pretty`（bool） - 雙向 |
| `split-csv` | 分割 CSV | `rowsPerFile`（1-1000000）、`keepHeader`（bool） |
| `merge-csvs` | 合併 CSV | - （多檔案，欄位需相符） |
| `yaml-json` | YAML / JSON | - （雙向） |
| `xml-to-csv` | XML 轉 CSV | - （自動尋找重複元素） |
| `excel-to-csv` | Excel 轉 CSV | 由 `convert-spreadsheet` 支援的專屬轉換預設 |
| `create-zip` | 建立 ZIP | - （多檔案，2-50 個檔案） |
| `extract-zip` | 解壓 ZIP | - （防炸彈保護） |

### HTML 轉圖片 {#html-to-image}

將網頁擷取為圖片。與其他工具不同，此端點接受 `application/json` 而非 multipart 表單資料（不需上傳檔案）。

**端點：** `POST /api/v1/tools/image/html-to-image`

**Content-Type：** `application/json`

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `url` | string | （必填） | 要擷取的 URL（僅限 http/https） |
| `format` | string | `"png"` | 輸出格式：`jpg`、`png`、`webp` |
| `quality` | number | `90` | 品質 1-100（僅限 JPG/WebP） |
| `fullPage` | boolean | `false` | 擷取整個可捲動頁面 |
| `devicePreset` | string | `"desktop"` | `desktop`、`tablet`、`mobile`、`custom` |
| `viewportWidth` | number | `1280` | 自訂視窗寬度 320-3840 |
| `viewportHeight` | number | `720` | 自訂視窗高度 320-2160 |

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

某些工具在標準的 `POST /api/v1/tools/<section>/<toolId>` 之外還提供額外端點：

| Method | Path | 說明 |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | 回傳熱門工具 ID；當使用資料稀少時退回到精選的預設清單 |
| `POST` | `/api/v1/tools/image/remove-background/effects` | 套用背景效果（color/gradient/blur/shadow）而不重新執行 AI。使用初次移除時快取的遮罩。 |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | 從影像讀取現有的 EXIF/IPTC/XMP 中繼資料 |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | 在移除前檢視中繼資料欄位 |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | 第 1 階段：AI 臉部偵測 + 移除背景。回傳臉部特徵點與快取資料。 |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | 第 2 階段：使用快取分析進行裁切、調整大小與拼貼。不重新執行 AI。 |
| `POST` | `/api/v1/tools/image/gif-tools/info` | 取得 GIF 中繼資料（影格數、尺寸、時長） |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | 取得 PDF 中繼資料（頁數、尺寸） |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | 產生特定 PDF 頁面的預覽 |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | 取得專屬 JPG 預設的 PDF 中繼資料 |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | 產生 JPG 預設的 PDF 頁面預覽 |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | 取得專屬 PNG 預設的 PDF 中繼資料 |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | 產生 PNG 預設的 PDF 頁面預覽 |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | 取得專屬 TIFF 預設的 PDF 中繼資料 |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | 產生 TIFF 預設的 PDF 頁面預覽 |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | 批次將多個 SVG 轉為點陣圖 |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | 分析影像品質並回傳強化建議 |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | 用於即時參數調整的輕量預覽。回傳帶有大小標頭的最佳化影像。 |

## 批次處理 {#batch-processing}

一次將支援批次的通用工具套用到多個檔案。回傳 ZIP 封存。自訂的多檔案或多步驟路由（例如 PDF 簽署以及 PDF 轉圖片預設路由）會使用各自的端點合約，而非通用的 `/batch` 路由。

`ocr-pdf` 工具支援此通用 `/batch` 路由。

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

並行數由 `CONCURRENT_JOBS` 控制（預設：從 CPU 核心自動偵測）。`MAX_BATCH_SIZE` 限制每批的檔案數（預設：100；設為 0 代表不限）。

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

每個步驟的輸出即為下一步的輸入。管線預設允許 20 個步驟，可透過 `MAX_PIPELINE_STEPS` 設定。設定 `MAX_PIPELINE_STEPS=0` 以移除限制。

### 儲存與管理管線 {#save-and-manage-pipelines}

| Method | Path | 說明 |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | 儲存具名管線（`name`、`description`、`steps[]`） |
| `GET` | `/api/v1/pipeline/list` | 列出已儲存的管線（管理員看全部；使用者看自己的） |
| `DELETE` | `/api/v1/pipeline/:id` | 刪除（擁有者或管理員） |
| `GET` | `/api/v1/pipeline/tools` | 列出可用於管線步驟的工具 ID |

## 進度追蹤 {#progress-tracking}

長時間執行的工作、排入佇列的工具、批次工作與管線都會透過 Server-Sent Events 發出即時進度。進度串流為公開且以工作 ID 為索引鍵，因此用戶端讀取時不需送出 Authorization 標頭。

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

你可以用 `POST /api/v1/jobs/:jobId/cancel` 對排入佇列或執行中的工作要求取消。回應為 `{"canceled":true|false}`。

## 檔案庫 {#file-library}

具版本歷史的持久性檔案儲存。

| Method | Path | 說明 |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | 將檔案上傳至工作區（暫時處理） |
| `POST` | `/api/v1/files/upload` | 將檔案上傳至持久性檔案庫 |
| `POST` | `/api/v1/files/save-result` | 將工具處理結果另存為新的檔案版本 |
| `GET` | `/api/v1/files` | 列出已儲存的檔案（分頁，可搜尋） |
| `GET` | `/api/v1/files/:id` | 取得檔案中繼資料 + 版本鏈 |
| `GET` | `/api/v1/files/:id/download` | 下載檔案 |
| `GET` | `/api/v1/files/:id/thumbnail` | 取得 300px JPEG 縮圖 |
| `DELETE` | `/api/v1/files` | 批次刪除檔案及其版本鏈（主體：`{ ids: [...] }`） |
| `POST` | `/api/v1/fetch-urls` | 將遠端 URL 抓取進工作區，用於以 URL 為基礎的匯入 |
| `POST` | `/api/v1/preview` | 產生瀏覽器相容的 WebP 預覽（適用於 HEIC/HEIF/RAW 格式） |
| `GET` | `/api/v1/files/:id/preview` | 為已儲存的 PDF、Office 文件、影片或音訊檔串流已快取或已產生的瀏覽器相容預覽 |
| `POST` | `/api/v1/preview/generate` | 為已上傳的媒體檔即時產生 MP4 或 MP3 預覽，而不需先儲存 |
| `GET` | `/api/v1/download/:jobId/:filename` | 從工作區下載已處理的檔案 |

若要將工具結果自動儲存至檔案庫，請將 `fileId` 作為 multipart 表單欄位傳入，參照現有的檔案庫檔案。處理結果會另存為新版本。

## API Key 管理 {#api-key-management}

| Method | Path | 存取權限 | 說明 |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Auth | 產生新 key，僅顯示一次 |
| `GET` | `/api/v1/api-keys` | Auth | 列出 key（name、id、lastUsedAt，非原始 key） |
| `DELETE` | `/api/v1/api-keys/:id` | Auth | 刪除 key |

## 團隊 {#teams}

| Method | Path | 存取權限 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin（`teams:manage`） | 列出團隊 |
| `POST` | `/api/v1/teams` | Admin（`teams:manage`） | 建立團隊 |
| `PUT` | `/api/v1/teams/:id` | Admin（`teams:manage`） | 重新命名團隊 |
| `DELETE` | `/api/v1/teams/:id` | Admin（`teams:manage`） | 刪除團隊（無法刪除預設團隊或含成員的團隊） |

## 設定 {#settings}

執行階段設定僅使用一組封閉的已識別 key。讀取需要 `settings:read`，寫入需要 `settings:write`；安全性和合規性 key 還分別需要 `security:manage` 或 `compliance:manage`。機密設定需要完整管理員權限，而由專用端點管理的憑證與狀態在此處為唯讀。系統會先驗證整批更新，再寫入任何值。

| Method | Path | 說明 |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | 取得所有設定 |
| `PUT` | `/api/v1/settings` | 批次更新設定（帶有鍵值對的 JSON 主體） |
| `GET` | `/api/v1/settings/:key` | 依 key 取得特定設定 |

代表性 key 包括：`disabledTools`（工具 ID 的 JSON 陣列）、`enableExperimentalTools`（布林值）、`loginAttemptLimit`（安全性政策），以及 `auditRetentionDays`（合規性政策）。未知的 key 會遭到拒絕。

## 偏好設定 {#preferences}

各使用者的偏好設定與執行個體設定分開。任何已驗證使用者都可讀取並更新自己的偏好設定對應表。

| Method | Path | 說明 |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | 以 `{ "preferences": { ... } }` 取得目前使用者的偏好設定 |
| `PUT` | `/api/v1/preferences` | 為目前使用者新增或更新一個以上的偏好設定 key |

## 角色 {#roles}

具細緻權限的自訂角色管理。

| Method | Path | 存取權限 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin（`audit:read`） | 列出所有角色及其使用者數 |
| `POST` | `/api/v1/roles` | Admin（`security:manage`） | 建立自訂角色（`name`、`description`、`permissions`） |
| `PUT` | `/api/v1/roles/:id` | Admin（`security:manage`） | 更新自訂角色（無法修改內建角色） |
| `DELETE` | `/api/v1/roles/:id` | Admin（`security:manage`） | 刪除自訂角色（無法刪除內建角色；受影響的使用者會還原為 `user` 角色） |

可用權限（17 項）：`tools:use`、`files:own`、`files:all`、`apikeys:own`、`apikeys:all`、`pipelines:own`、`pipelines:all`、`settings:read`、`settings:write`、`users:manage`、`teams:manage`、`features:manage`、`system:health`、`audit:read`、`compliance:manage`、`webhooks:manage`、`security:manage`。

## 稽核日誌 {#audit-log}

僅限管理員的端點，用於檢視與安全相關的動作。

| Method | Path | 存取權限 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin（`audit:read`） | 分頁的稽核日誌，含選用篩選條件 |

查詢參數：

| 參數 | 說明 |
|-----------|-------------|
| `page` | 頁碼（預設：1） |
| `limit` | 每頁項目數（預設：50，上限：100） |
| `action` | 依動作類型篩選（例如 `ROLE_CREATED`、`ROLE_DELETED`） |
| `ip` | 依來源 IP 位址篩選 |
| `from` | 篩選此 ISO 8601 日期之後的項目 |
| `to` | 篩選此 ISO 8601 日期之前的項目 |

## 分析 {#analytics}

| Method | Path | 存取權限 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Public | 取得有效的分析設定（PostHog key、Sentry DSN、取樣率）。當分析關閉時（無論來自編譯時的烘焙或執行個體的 `analyticsEnabled` 設定），key、DSN 與執行個體 ID 皆為空白。 |
| `POST` | `/api/v1/feedback` | Auth | 將明確的使用者意見回饋提交至設定的 PostHog 專案，作為 `feedback_submitted`。此路由遵守分析開關、對提交做速率限制，除非 `contactOk` 為 true 否則移除聯絡欄位，且永不接受檔案內容、檔名、上傳路徑或原始的私密錯誤文字。當分析停用時，回傳 `{ "ok": true, "accepted": false }`。 |
| `PUT` | `/api/v1/settings` | Admin（`settings:write`） | 設定整個執行個體的退出。送出 JSON 主體 `{ "analyticsEnabled": "false" }` 為所有人關閉分析，或 `"true"` 重新開啟。 |

## 功能 / AI Bundle {#features-ai-bundles}

管理 AI 功能 bundle（在 Docker 環境中安裝／解除安裝 AI 模型套件）。從自訂自動化流程啟用工具時，建議使用工具層級的安裝端點：某些 AI 工具需要一個以上的共用 bundle，而此端點會略過已安裝的 bundle，只將缺少的排入佇列。

OCR 是可選增強功能而不是硬依賴項。 其 `fast` Tesseract 層無需包裝即可運作； `POST /api/v1/admin/features/ocr/install` 安裝簽名的 RapidOCR 打包 `balanced` 和 `best` 在 Linux  amd64 或者 arm64。 準確的 OCR 運行時在僅 CPU 和 NVIDIA 主機上使用 CPU，並且需要至少 4 GiB 的有效記憶體（配置的容器 cgroup 限制，否則主機記憶體）。 SnapOtter 報告 `requiredMemoryBytes`、`effectiveMemoryBytes` 和 `insufficient-memory` 相容性原因，並在下載前拒絕不相容的安裝。 此記憶體需求不適用於 `fast`。 該包大約需要下載 208-234 MiB 和安裝 409-488 MiB，具體取決於目標； 簽章索引綁定安裝期間強制執行的確切大小。

| Method | Path | 存取權限 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Auth | 列出所有功能 bundle 及其安裝狀態 |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin（`features:manage`） | 安裝功能 bundle（非同步，回傳 `jobId` 以追蹤進度） |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | Admin（`features:manage`） | 安裝某工具所需的每個 bundle；回傳各 bundle 的已排入佇列／已略過狀態 |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin（`features:manage`） | 解除安裝功能 bundle 並清除模型檔案 |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin（`features:manage`） | 取得 AI 模型的總磁碟使用量 |
| `POST` | `/api/v1/admin/features/import` | 管理員 (`features:manage`) | 匯入舊版 AI 套裝 (`file`) 或已簽署的離線 OCR 版本（`index` 加 `archive`） |

氣隙 OCR 導入必須包含版本的簽章 `ocr-runtime-index.json` 和相符的平台存檔。 SnapOtter 應用與線上安裝相同的 Ed25519 簽章、工件雜湊、相容性、擷取和冒煙測試檢查：

```bash
curl -X POST http://localhost:1349/api/v1/admin/features/import \
  -H "Authorization: Bearer <admin-token>" \
  -F "index=@ocr-runtime-index.json" \
  -F "archive=@ocr-linux-amd64-cpu-py312.tar.gz"
```

在 arm64 上使用 `linux-arm64-cpu-py311` 檔案。另一個目標的簽名工件被拒絕而不是安裝。

## 管理操作 {#admin-operations}

用於可觀測性、支援、使用量報告與備份狀態的維運端點。

| Method | Path | 存取權限 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Admin（`settings:write`） | 讀取目前執行時的日誌層級 |
| `POST` | `/api/v1/admin/log-level` | Admin（`settings:write`） | 變更執行時的日誌層級（`fatal`、`error`、`warn`、`info`、`debug`、`trace` 或 `silent`） |
| `GET` | `/api/v1/metrics` | Admin（`system:health`） | 文字格式的 Prometheus metrics |
| `GET` | `/api/v1/admin/support-bundle` | Admin（`system:health`） | 下載已遮蔽的診斷支援 bundle ZIP |
| `GET` | `/api/v1/admin/usage` | Admin（`audit:read`） | 使用量儀表板資料，含選用的 `days` 查詢參數 |
| `GET` | `/api/v1/admin/backup-status` | Admin（`system:health`） | 讀取最近一次備份的中繼資料與新鮮度狀態 |
| `POST` | `/api/v1/admin/backup-status` | Admin（`system:health`） | 記錄一次已完成的備份（`type`、選用 `sizeBytes`、選用 `notes`） |

## 企業 API {#enterprise-apis}

這些路由受其相關企業功能的授權控管。它們仍需要所列的 SnapOtter 權限。

**擁有完整權限的內建管理員**是指已驗證的主體具有 `admin` 角色以及完整的有效管理員權限集。若 API 金鑰的權限範圍缺少任何管理員權限，則不符合此要求。

| Method | Path | 存取權限 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Admin（`audit:read`） | 以 JSON 或 CSV 匯出稽核項目，可加篩選 |
| `GET` | `/api/v1/enterprise/config/export` | 擁有完整權限的內建管理員 | 匯出已遮蔽的執行個體設定、自訂角色與團隊 |
| `POST` | `/api/v1/enterprise/config/import` | 擁有完整權限的內建管理員 | 匯入設定，可選乾跑 |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Admin（`security:manage`） | 讀取已設定的 CIDR 允許清單 |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Admin（`security:manage`） | 更新 CIDR 允許清單，並防止自我鎖定 |
| `GET` | `/api/v1/enterprise/legal-hold` | Admin（`compliance:manage`） | 列出使用者與團隊的法律保留 |
| `PUT` | `/api/v1/enterprise/legal-hold` | Admin（`compliance:manage`） | 對使用者或團隊套用或解除法律保留 |
| `POST` | `/api/v1/enterprise/scim/token` | Admin（`users:manage`） | 產生 SCIM bearer token，僅回傳一次 |
| `DELETE` | `/api/v1/enterprise/scim/token` | Admin（`users:manage`） | 撤銷目前的 SCIM bearer token |
| `GET` | `/api/v1/enterprise/siem/config` | Admin（`webhooks:manage`） | 讀取 SIEM 轉發設定 |
| `PUT` | `/api/v1/enterprise/siem/config` | Admin（`webhooks:manage`） | 更新 SIEM 轉發設定 |
| `GET` | `/api/v1/enterprise/webhooks` | Admin（`webhooks:manage`） | 列出 webhook 目的地 |
| `POST` | `/api/v1/enterprise/webhooks` | Admin（`webhooks:manage`） | 建立 webhook 目的地 |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Admin（`webhooks:manage`） | 更新 webhook 目的地 |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Admin（`webhooks:manage`） | 刪除 webhook 目的地 |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Admin（`webhooks:manage`） | 送出測試 webhook 酬載 |
| `POST` | `/api/v1/enterprise/users/:id/export` | Admin（`compliance:manage`） | 啟動 GDPR 使用者匯出工作 |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Admin（`compliance:manage`） | 讀取 GDPR 匯出狀態與下載 URL |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Admin（`compliance:manage`） | 確認後永久清除某使用者的資料 |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Admin（`compliance:manage`） | 確認後永久清除某團隊的資料 |
| `GET` | `/api/v1/admin/version` | Admin（`system:health`） | 讀取 app、build、Node 與 schema 版本中繼資料 |
| `GET` | `/api/v1/admin/migrations/pending` | Admin（`system:health`） | 比較封裝的遷移與已套用的遷移 |
| `GET` | `/api/v1/admin/upgrade-check` | Admin（`system:health`） | 執行升級就緒性檢查 |

### SCIM 2.0 {#scim-2-0}

SCIM 探索端點為公開。使用者與群組端點需要上方產生的 SCIM bearer token。

| Method | Path | 存取權限 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Public | SCIM 伺服器能力 |
| `GET` | `/api/v1/scim/v2/Schemas` | Public | SCIM schema 探索 |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Public | SCIM 資源類型探索 |
| `GET` | `/api/v1/scim/v2/Users` | SCIM token | 列出使用者，可加選用的 SCIM 篩選 |
| `POST` | `/api/v1/scim/v2/Users` | SCIM token | 建立使用者 |
| `GET` | `/api/v1/scim/v2/Users/:id` | SCIM token | 取得使用者 |
| `PUT` | `/api/v1/scim/v2/Users/:id` | SCIM token | 取代使用者 |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | SCIM token | 軟性停用使用者 |
| `GET` | `/api/v1/scim/v2/Groups` | SCIM token | 以 SCIM 群組列出團隊 |
| `POST` | `/api/v1/scim/v2/Groups` | SCIM token | 建立團隊 |
| `GET` | `/api/v1/scim/v2/Groups/:id` | SCIM token | 取得團隊 |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | SCIM token | 取代團隊與群組成員資格 |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | SCIM token | 刪除團隊 |

## 迷因範本 {#meme-templates}

支援迷因產生器工具的 API。

| Method | Path | 存取權限 | 說明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Auth | 列出所有可用的迷因範本及文字方塊位置 |
| `GET` | `/api/v1/meme-templates/full/:filename` | Auth | 提供全尺寸範本圖片 |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Auth | 提供範本縮圖 |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Auth | 提供迷因文字繪製所用的字型檔 |

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
| 413 | 檔案太大（見 `MAX_UPLOAD_SIZE_MB`） |
| 422 | 通過驗證後處理失敗 |
| 429 | 受速率限制（見 `RATE_LIMIT_PER_MIN`） |
| 501 | 未安裝所需的 AI 功能 bundle（`FEATURE_NOT_INSTALLED`） |
| 500 | 內部伺服器錯誤 |
