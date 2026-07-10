---
description: "AI 引擎參考，涵蓋所有本機 ML 工具。背景移除、放大、OCR、人臉偵測、相片修復等等。"
i18n_source_hash: dd135f2e9fdb
i18n_provenance: human
i18n_output_hash: f910ac2ad3a5
---

# AI 引擎參考 {#ai-engine-reference}

`@snapotter/ai` 套件將 Node.js 橋接到一個**常駐的 Python sidecar**，用於所有 ML 操作。dispatcher 程序會在請求之間保持存活，以達到快速的暖啟動效能。啟動時會自動偵測 NVIDIA CUDA，並在可用時使用；否則 AI 工具會在 CPU 上執行。

目前不支援透過 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD iGPU 加速進行 AI 推論。將 `/dev/dri` 對應到容器中並不會加速這些 Python sidecar 工具，除非有支援 CUDA 的 NVIDIA GPU 可用。

橫跨四種模態（影像、音訊、影片、文件）的 19 個 Python sidecar AI 工具，外加 2 個具備選用 AI 功能的工具。所有模型都在本機執行，初次下載模型後即不需要網際網路。

## 架構 {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- ocr.py              (PaddleOCR / Tesseract)
      |-- ocr_pdf.py          (page-by-page document OCR)
      |-- ocr_preprocess.py   (image enhancement for OCR)
      |-- detect_faces.py     (MediaPipe)
      |-- face_landmarks.py   (MediaPipe landmarks)
      |-- enhance_faces.py    (GFPGAN / CodeFormer)
      |-- colorize.py         (DDColor)
      |-- noise_removal.py    (SCUNet / tiered denoising)
      |-- red_eye_removal.py  (landmark + color analysis)
      |-- restore.py          (scratch repair + enhancement + denoising)
      |-- transcribe.py       (faster-whisper speech-to-text)
      +-- install_feature.py  (on-demand bundle installer)
```

另一個「docs」dispatcher 設定檔會以文件處理指令碼（`doc_pagecount`、`doc_health`、`doc_flatten`、`doc_redact`、`doc_text`、`doc_to_word`、`doc_metadata`、`doc_html_pdf`）取代 AI 允許清單，並略過繁重的 ML 匯入。

**逾時：**預設 300 秒；OCR 與 BiRefNet 背景移除為 600 秒。

## 功能套件 {#feature-bundles}

每個 AI 工具在使用前都需要安裝一個模型套件。套件會透過管理 UI 或 `install_feature.py` 依需求安裝。

| 套件 | 大小 | 工具 |
|--------|------|-------|
| `background-removal` | 4-5 GB | remove-background、passport-photo、transparency-fixer、background-replace、blur-background |
| `face-detection` | 200-300 MB | blur-faces、red-eye-removal、smart-crop |
| `object-eraser-colorize` | 1-2 GB | erase-object、colorize、ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | upscale、enhance-faces、noise-removal |
| `photo-restoration` | 4-5 GB | restore-photo |
| `ocr` | 5-6 GB | ocr、ocr-pdf |
| `transcription` | ~600 MB | transcribe-audio、auto-subtitles |

---

## 背景移除 {#background-removal}

**工具路由：**`remove-background`  
**模型：**rembg，搭配 BiRefNet（預設）或 U2-Net 變體

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `model` | string | - | 模型變體（選用覆寫） |
| `backgroundType` | string | `"transparent"` | 下列其中之一：`transparent`、`color`、`gradient`、`blur`、`image` |
| `backgroundColor` | string | - | 純色背景的十六進位色碼 |
| `gradientColor1` | string | - | 第一個漸層顏色 |
| `gradientColor2` | string | - | 第二個漸層顏色 |
| `gradientAngle` | number | - | 漸層角度（度） |
| `blurEnabled` | boolean | - | 啟用背景模糊效果 |
| `blurIntensity` | number (0-100) | - | 模糊強度 |
| `shadowEnabled` | boolean | - | 在主體上啟用陰影 |
| `shadowOpacity` | number (0-100) | - | 陰影不透明度 |
| `outputFormat` | string | - | 輸出格式：`png`、`webp` 或 `avif` |
| `edgeRefine` | integer (0-3) | - | 邊緣細化等級 |
| `decontaminate` | boolean | - | 移除邊緣的色彩滲色 |

## 背景替換 {#background-replace}

**工具路由：**`background-replace`  
**模型：**rembg / BiRefNet（與 remove-background 共用）

移除背景並以純色或漸層取代。

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | 背景模式 |
| `color` | string | `"#ffffff"` | 背景十六進位色碼（當 `backgroundType` 為 `color` 時） |
| `gradientColor1` | string | - | 第一個漸層十六進位色碼 |
| `gradientColor2` | string | - | 第二個漸層十六進位色碼 |
| `gradientAngle` | integer (0-360) | `180` | 漸層角度（度） |
| `feather` | integer (0-20) | `0` | 邊緣羽化半徑 |
| `format` | `"png"` \| `"webp"` | `"png"` | 輸出格式 |

## 模糊背景 {#blur-background}

**工具路由：**`blur-background`  
**模型：**rembg / BiRefNet（與 remove-background 共用）

模糊背景，同時保持主體清晰。

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | 模糊強度 |
| `feather` | integer (0-20) | `0` | 邊緣羽化半徑 |
| `format` | `"png"` \| `"webp"` | `"png"` | 輸出格式 |

## 影像放大 {#image-upscaling}

**工具路由：**`upscale`  
**模型：**RealESRGAN（不可用時以 Lanczos 備援）

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `scale` | number | `2` | 放大倍數 |
| `model` | string | `"auto"` | 模型變體 |
| `faceEnhance` | boolean | `false` | 套用 GFPGAN 人臉增強處理 |
| `denoise` | number | `0` | 降噪強度 |
| `format` | string | `"auto"` | 輸出格式覆寫 |
| `quality` | number | `95` | 輸出品質（1-100） |

## OCR / 文字擷取 {#ocr-text-extraction}

**工具路由：**`ocr`  
**模型：**Tesseract（快速）、PaddleOCR PP-OCRv5（平衡）、PaddleOCR-VL 1.5（最佳）

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | 處理層級 |
| `language` | string | `"auto"` | 語言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| `enhance` | boolean | `true` | 預先處理影像以提升 OCR 準確度 |
| `engine` | string | - | 已淘汰。將 `tesseract` 對應至 `fast`、`paddleocr` 對應至 `balanced` |

回傳含邊界框、信心分數與擷取文字區塊的結構化結果。

## PDF OCR {#pdf-ocr}

**工具路由：**`ocr-pdf`  
**模型：**與影像 OCR 相同的層級系統

使用 AI 驅動的 OCR，逐頁從掃描的 PDF 文件擷取文字。

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | 處理層級 |
| `language` | string | `"auto"` | 語言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| `pages` | string | `"all"` | 頁面選擇：`"all"`、`"1-3"`、`"1,3,5"` |

## 人臉 / PII 模糊 {#face-pii-blur}

**工具路由：**`blur-faces`  
**模型：**MediaPipe 人臉偵測

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | 高斯模糊半徑 |
| `sensitivity` | number (0-1) | `0.5` | 偵測信心門檻 |

## 人臉增強 {#face-enhancement}

**工具路由：**`enhance-faces`  
**模型：**GFPGAN、CodeFormer

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | 增強模型 |
| `strength` | number (0-1) | `0.8` | 增強強度 |
| `sensitivity` | number (0-1) | `0.5` | 人臉偵測門檻 |
| `onlyCenterFace` | boolean | `false` | 僅增強最中央的人臉 |

## AI 上色 {#ai-colorization}

**工具路由：**`colorize`  
**模型：**DDColor（以 OpenCV DNN 備援）

將黑白或灰階相片轉換為全彩。

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | 色彩飽和度強度 |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | 模型變體 |

## 雜訊移除 {#noise-removal}

**工具路由：**`noise-removal`  
**模型：**SCUNet（分層降噪流程）

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | 處理層級 |
| `strength` | number (0-100) | `50` | 降噪強度 |
| `detailPreservation` | number (0-100) | `50` | 保留多少細節；數值越高保留越多紋理 |
| `colorNoise` | number (0-100) | `30` | 色彩雜訊降低強度 |
| `format` | string | `"original"` | 輸出格式：`original`、`png`、`jpeg`、`webp`、`avif`、`jxl` |
| `quality` | number (1-100) | `90` | 輸出編碼品質 |

## 紅眼移除 {#red-eye-removal}

**工具路由：**`red-eye-removal`

偵測人臉特徵點、定位眼睛區域，並修正紅色通道過飽和。

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | 紅色像素偵測門檻 |
| `strength` | number (0-100) | `70` | 修正強度 |
| `format` | string | - | 輸出格式覆寫（選用） |
| `quality` | number (1-100) | `90` | 輸出品質 |

## 相片修復 {#photo-restoration}

**工具路由：**`restore-photo`

針對老舊或受損相片的多步驟流程：刮痕/撕裂偵測與修復、人臉增強、降噪，以及選用的上色。

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | 偵測並修復刮痕、撕裂 |
| `faceEnhancement` | boolean | `true` | 套用人臉增強處理 |
| `fidelity` | number (0-1) | `0.7` | 人臉增強強度（越高越保守） |
| `denoise` | boolean | `true` | 套用降噪處理 |
| `denoiseStrength` | number (0-100) | `25` | 降噪強度 |
| `colorize` | boolean | `false` | 修復後上色 |
| `colorizeStrength` | number (0-100) | `85` | 上色強度 |

## 護照相片 {#passport-photo}

**工具路由：**`passport-photo`  
**模型：**MediaPipe 人臉特徵點 + BiRefNet 背景移除

兩階段工作流程：分析（偵測人臉 + 移除背景）然後產生（裁切、調整大小、拼貼）。支援 6 個地區超過 37 個國家。

### 階段 1：分析 {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

接受影像檔案（multipart）。回傳人臉特徵點資料、base64 預覽與影像尺寸。

### 階段 2：產生 {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

接受包含階段 1 結果外加產生設定的 JSON 主體：

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `jobId` | string | （必填） | 階段 1 的工作 ID |
| `filename` | string | （必填） | 階段 1 的原始檔名 |
| `countryCode` | string | （必填） | ISO 國家代碼（例如 `US`、`GB`、`IN`） |
| `documentType` | string | `"passport"` | 文件類型 |
| `bgColor` | string | `"#FFFFFF"` | 背景顏色十六進位色碼 |
| `printLayout` | string | `"none"` | 列印版面：`none`、`4x6`、`a4`、`letter` |
| `maxFileSizeKb` | number | `0` | 最大檔案大小（KB，0 = 無限制） |
| `dpi` | number (72-1200) | `300` | 輸出 DPI |
| `customWidthMm` | number | - | 自訂寬度（mm，覆寫國家規格） |
| `customHeightMm` | number | - | 自訂高度（mm，覆寫國家規格） |
| `zoom` | number (0.5-3) | `1` | 縮放倍數 |
| `adjustX` | number | `0` | 水平位置調整 |
| `adjustY` | number | `0` | 垂直位置調整 |
| `landmarks` | object | （必填） | 階段 1 的特徵點 |
| `imageWidth` | number | （必填） | 階段 1 的影像寬度 |
| `imageHeight` | number | （必填） | 階段 1 的影像高度 |

## 物件擦除（修補） {#object-erasing-inpainting}

**工具路由：**`erase-object`  
**模型：**透過 ONNX Runtime 的 LaMa

遮罩會以**第二個檔案部分**（欄位名稱 `mask`）傳送，而非 base64。遮罩中的白色像素代表要擦除的區域。`format` 與 `quality` 設定以頂層表單欄位傳送。

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `file` | file | （必填） | 來源影像（multipart） |
| `mask` | file | （必填） | 遮罩影像（multipart，欄位名稱 `mask`，白色 = 擦除） |
| `format` | string | `"auto"` | 輸出格式：`auto`、`png`、`jpg`、`jpeg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| `quality` | integer (1-100) | `95` | 輸出品質 |

有可用的 NVIDIA GPU 時會使用 CUDA 加速。

## AI 畫布擴展 {#ai-canvas-expand}

**工具路由：**`ai-canvas-expand`  
**模型：**基於 LaMa 的外繪

往任意方向擴展影像畫布，並以與既有影像相符的 AI 生成內容填補新區域。

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | 頂部延伸的像素數 |
| `extendRight` | integer | `0` | 右側延伸的像素數 |
| `extendBottom` | integer | `0` | 底部延伸的像素數 |
| `extendLeft` | integer | `0` | 左側延伸的像素數 |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | 品質層級 |
| `format` | string | `"auto"` | 輸出格式：`auto`、`png`、`jpg`、`jpeg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| `quality` | integer (1-100) | `95` | 輸出品質 |

至少要有一個延伸方向大於 0。

## 智慧裁切 {#smart-crop}

**工具路由：**`smart-crop`  
**模型：**MediaPipe 人臉偵測（僅人臉模式）

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | 裁切策略：`subject`、`face`、`trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | 主體模式的策略 |
| `width` | integer | - | 輸出寬度 |
| `height` | integer | - | 輸出高度 |
| `padding` | integer (0-50) | `0` | 主體周圍的邊距百分比 |
| `facePreset` | string | `"head-shoulders"` | 當 `mode=face` 時的預設取景 |
| `sensitivity` | number (0-1) | `0.5` | 人臉偵測門檻 |
| `threshold` | integer (0-255) | `30` | 背景偵測門檻（修剪模式） |
| `padToSquare` | boolean | `false` | 將修剪後的結果填補為正方形 |
| `padColor` | string | `"#ffffff"` | 正方形填補的背景顏色 |
| `targetSize` | integer | - | 填補輸出的目標尺寸（像素） |
| `quality` | integer (1-100) | - | 輸出品質 |

舊版的 `mode` 值 `attention` 與 `content` 仍可接受，並分別對應至 `subject` 與 `trim`。

**人臉預設：**

| 預設 | 最適用於 |
|--------|---------|
| `closeup` | 大頭照 |
| `head-shoulders` | 個人檔案相片 |
| `upper-body` | LinkedIn / 正式 |
| `half-body` | 完整上半身 |

## 音訊轉錄 {#transcribe-audio}

**工具路由：**`transcribe-audio`  
**模型：**faster-whisper

將語音轉換為文字。支援純文字、SRT 與 VTT 輸出格式。

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | 語言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko`、`id`、`th`、`vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | 輸出格式 |

## 自動字幕 {#auto-subtitles}

**工具路由：**`auto-subtitles`  
**模型：**faster-whisper（從影片擷取音訊後轉錄）

從影片的音訊軌產生字幕檔。

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | 語言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko`、`id`、`th`、`vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | 輸出字幕格式 |

## PNG 透明度修正器 {#png-transparency-fixer}

**工具路由：**`transparency-fixer`  
**模型：**BiRefNet HR-matting（2048x2048 解析度）

修正「假透明」的 PNG，也就是背景已被移除但留下毛邊、光暈或半透明殘影的情形。使用 BiRefNet 的高解析度去背模型產生乾淨的 alpha 通道，接著套用可設定的去邊處理，以移除邊緣沿線的色彩污染。

**OOM 備援鏈：**若 BiRefNet HR-matting 超出可用記憶體，工具會自動回退至 `birefnet-general`，再退至 `u2net`。

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | 邊緣去邊強度，用於移除色彩污染 |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | 輸出影像格式 |
| `removeWatermark` | boolean | `false` | 套用浮水印移除前處理（中值濾波） |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## 具備選用 AI 功能的工具 {#tools-with-optional-ai-capabilities}

下列工具並非 Python sidecar 工具，但在啟用特定選項時會使用 AI 功能。

### 影像增強 {#image-enhancement}

**工具路由：**`image-enhancement`  
**引擎：**基於分析（Sharp 直方圖與統計）

分析影像並自動修正曝光、對比、白平衡、飽和度、銳利度與雜訊。支援場景專屬模式。

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | 用於調整修正的場景模式 |
| `intensity` | number (0-100) | `50` | 整體修正強度 |
| `corrections.exposure` | boolean | `true` | 套用曝光修正 |
| `corrections.contrast` | boolean | `true` | 套用對比修正 |
| `corrections.whiteBalance` | boolean | `true` | 套用白平衡修正 |
| `corrections.saturation` | boolean | `true` | 套用飽和度修正 |
| `corrections.sharpness` | boolean | `true` | 套用銳利度修正 |
| `corrections.denoise` | boolean | `true` | 套用降噪 |
| `deepEnhance` | boolean | `false` | 透過 SCUNet 啟用 AI 雜訊移除（需要 `upscale-enhance` 套件） |

另有一個分析端點位於 `POST /api/v1/tools/image/image-enhancement/analyze`，會回傳偵測到的修正而不實際套用。

### 內容感知調整大小（接縫裁減） {#content-aware-resize-seam-carving}

**工具路由：**`content-aware-resize`  
**引擎：**Go `caire` 二進位檔（非 Python，無 GPU 效益）

藉由移除低能量接縫來智慧地調整影像大小，同時保留重要內容。

| 參數 | 型別 | 預設 | 說明 |
|-----------|------|---------|-------------|
| `width` | number | - | 目標寬度 |
| `height` | number | - | 目標高度 |
| `protectFaces` | boolean | `false` | 保護偵測到的人臉區域（需要 `face-detection` 套件） |
| `blurRadius` | number (0-20) | `4` | 用於能量計算的預先模糊 |
| `sobelThreshold` | number (1-20) | `2` | 邊緣敏感度門檻 |
| `square` | boolean | `false` | 強制正方形輸出 |
