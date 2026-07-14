---
description: "AI 引擎參考，涵蓋所有本機 ML 工具。去背、放大、OCR、人臉偵測、相片修復等。"
i18n_output_hash: 4e37d784676e
i18n_source_hash: aa9a56cdddc7
i18n_provenance: human
---

# AI 引擎參考 {#ai-engine-reference}

`@snapotter/ai` 套件協調本機工具和 Python 運行時以進行本機 ML 操作。 大多數 ML 工具使用持久的 Python sidecar 來實現快速熱啟動。 OCR 是故意分開的： `fast` 呼叫本機 Tesseract 二進位文件， 儘管 `balanced` 和 `best` 使用專用的持久化 JSONL  dispatcher 固定到活動的不可變的 RapidOCR 新一代 `/data/ai/v3`。 每個請求都包含一個 generation lease。 在升級期間，SnapOtter 在啟動之前在候選者上運行 smoke test，自動切換到新的 dispatcher，然後在 garbage collection 之前耗盡舊代。

NVIDIA CUDA 由支援它的運行時自動檢測和使用。 OCR 在每個主機上使用 CPU，包括具有 NVIDIA GPU 的系統，避免 CUDA 和該工具的驅動程式耦合。

目前不支援透過 VA-API、Quick Sync 或 OpenCL 進行 Intel/AMD iGPU 的 AI 推論加速。除非有支援 CUDA 的 NVIDIA GPU 可用，否則將 `/dev/dri` 對映進容器並不會加速這些 Python sidecar 工具。

19 個 Python sidecar AI 工具，橫跨四種模態（image、audio、video、document），另有 2 個具備選用 AI 功能的工具。所有模型都在本機執行，初次下載模型後即不需要網際網路。


<!-- korean-ocr-contract:start -->
::: info 韓語 OCR 相容性
快速 OCR 支援 `auto`、`en`、`de`、`es`、`fr`、`zh` 和 `ja`，但不支援韓語 (`ko`)。韓語需要精確 OCR 套件以及 `balanced` 或 `best`。此套件可在官方 Linux amd64 和 arm64 容器上執行；即使是 NVIDIA 主機，OCR 仍使用 CPU。不受支援的系統會傳回明確的相容性錯誤，絕不會靜默回退至 `fast`。韓語搭配 `fast` 或舊版 `tesseract` 別名時，會在排入佇列前以 `FEATURE_INCOMPATIBLE` 和 `fast-korean-unsupported` 拒絕。
:::
<!-- korean-ocr-contract:end -->
## 架構 {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 +-- Native Tesseract + Ghostscript (fast image/PDF OCR)
 |
 +-- Isolated OCR runtime (persistent JSONL dispatcher)
 |     `-- RapidOCR + ONNX Runtime CPU + pinned PP-OCR models
 |
 `-- Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
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

另有一個獨立的「docs」dispatcher 設定檔，以文件處理指令碼（`doc_pagecount`、`doc_health`、`doc_flatten`、`doc_redact`、`doc_text`、`doc_to_word`、`doc_metadata`、`doc_html_pdf`）取代 AI 允許清單，並略過大型 ML 匯入。

**逾時：** 預設 300 秒；OCR 與 BiRefNet 去背則為 600 秒。

## 功能套件包 {#feature-bundles}

AI 模型是依共用相依堆疊來封裝，而非每個工具一個封存檔。當多個工具使用相同的模型家族、Python wheel 或原生函式庫時，一個功能套件包可同時啟用這些工具。這讓發行的 Docker 映像更小，並避免重複儲存相同的背景去背、人臉偵測、OCR、修復與語音模型。

Docker 映像隨附應用程式加上共用執行環境。大型模型封存檔會在需要時下載到常駐的 `/data/ai` 磁碟區，之後由所有需要它的工具重複使用。如果某個套件包已因另一個工具的需要而安裝，啟用一個新的相依工具並不會再次下載該套件包。

大多數人工智慧工具都需要一個或多個功能包才能運作。 管理 UI 透過 `POST /api/v1/admin/tools/:toolId/features/install` 工具安裝這些包，它解析完整的捆綁包列表，跳過已安裝的捆綁包，並僅對缺少的下載進行排隊。 例如，在新實例佇列 `background-removal` 和 `face-detection` 上啟用 Passport Photo； 在已安裝背景刪除後啟用它僅排隊 `face-detection`。 OCR 是例外，因為 `fast` 不需要包裝； 透過 UI 或 `POST /api/v1/admin/features/ocr/install` 安裝其選購的精確執行時間。

| 套件包 | 大小 | 共用相依群組 | 使用它的工具 |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | rembg / BiRefNet 背景去背 | remove-background、passport-photo、transparency-fixer、background-replace、blur-background |
| `face-detection` | 200-300 MB | MediaPipe 人臉偵測與特徵點 | blur-faces、red-eye-removal、smart-crop |
| `object-eraser-colorize` | 1-2 GB | LaMa 影像修補/外延與 DDColor | erase-object、colorize、ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN、GFPGAN / CodeFormer、去雜訊 | upscale、enhance-faces、noise-removal |
| `photo-restoration` | 4-5 GB | 刮痕修復與修復流程 | restore-photo |
| `ocr` | ~208-234 MiB 下載 / ~409-488 MiB 安裝 | 選配 RapidOCR 3.9.1、ONNX Runtime 1.20.1 和固定 PP-OCR 型號 | ocr、ocr-pdf（僅限 `balanced` 和 `best`） |
| `transcription` | ~600 MB | faster-whisper 語音轉文字模型 | transcribe-audio、auto-subtitles |

具有跨套件包相依性的工具：

| 工具 | 必要套件包 | 原因 |
|------|------------------|-----|
| `passport-photo` | `background-removal`、`face-detection` | 先移除背景，再用人臉特徵點依護照與身分證照片規則框住裁切範圍。 |
| `enhance-faces` | `upscale-enhance`、`face-detection` | 在對選定的人臉區域執行 GFPGAN 或 CodeFormer 增強之前，先偵測人臉。 |

只有在安裝了工具所需的所有捆綁包（OCR 除外）後，工具才可用：其內建 `fast` 層在沒有選購 OCR 包的情況下仍然可用。 部分安裝是有效的，並且是增量處理的：已安裝的捆綁包被重用，丟失的捆綁包顯示為下載，排隊安裝一次運行一個，因此共享的 Python 環境不會同時修改。

### 準確的 OCR 運行時安裝{#accurate-ocr-runtime-installation}

準確的 OCR 套件是官方 Linux amd64 或 Linux arm64 容器的特定於平台的運行時。 amd64 建置使用 Python 3.12； arm64 版本使用 Python 3.11。 兩個版本都透過 ONNX Runtime 的 `CPUExecutionProvider` 運行 RapidOCR， 因此，相同的套件適用於僅 CPU 和 NVIDIA Docker 主機。 準確的運行時需要至少 4 GiB 的有效記憶體：配置的容器 cgroup 限制，否則為主機記憶體。 低於該簽章相容性最低值的系統在下載前會被拒絕。 此要求不適用於內建 Fast OCR。 Bare-metal 建置被拒絕，因為它們的 libc 和 Python ABI 無法安全推斷； 當主機提供 Tesseract 和 Ghostscript 時，快速 OCR 保持可用。

選用工件大約壓縮 208-234 MiB 並提取 409-488 MiB，具體取決於架構。 簽章索引綁定安裝程式強制執行的精確壓縮和提取位元組計數。 內建 Tesseract 在官方鏡像上增加了約25個 MiB，並且不需要`/data/ai`中的檔案。

線上安裝會取得已簽署的版本索引以及目前平台的精確內容尋址工件。 SnapOtter 在原子啟動新世代之前驗證 Ed25519 索引簽章、工件大小、SHA-256 摘要、模型摘要、路徑、檔案模式和暫存 smoke test。 失敗的安裝會使先前的健康生成保持活動狀態。

對於氣隙安裝，請使用名為 `index` 和 `archive` 的多部分欄位將版本的 `ocr-runtime-index.json` 和相符的 OCR 執行時間存檔上傳到 `POST /api/v1/admin/features/import`。 離線導入應用與線上安裝相同的簽名、哈希、提取、相容性和冒煙測試檢查； 沒有可信任簽名索引的檔案將被拒絕。

---

## 去背 {#background-removal}

**工具路由：** `remove-background`  
**模型：** rembg 搭配 BiRefNet（預設）或 U2-Net 變體

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `model` | string | - | 模型變體（選用覆寫） |
| `backgroundType` | string | `"transparent"` | 其一：`transparent`、`color`、`gradient`、`blur`、`image` |
| `backgroundColor` | string | - | 純色背景的十六進位色碼 |
| `gradientColor1` | string | - | 第一個漸層顏色 |
| `gradientColor2` | string | - | 第二個漸層顏色 |
| `gradientAngle` | number | - | 漸層角度（以度為單位） |
| `blurEnabled` | boolean | - | 啟用背景模糊效果 |
| `blurIntensity` | number (0-100) | - | 模糊強度 |
| `shadowEnabled` | boolean | - | 為主體啟用陰影 |
| `shadowOpacity` | number (0-100) | - | 陰影不透明度 |
| `outputFormat` | string | - | 輸出格式：`png`、`webp` 或 `avif` |
| `edgeRefine` | integer (0-3) | - | 邊緣細化等級 |
| `decontaminate` | boolean | - | 移除邊緣的顏色滲色 |

## 背景替換 {#background-replace}

**工具路由：** `background-replace`  
**模型：** rembg / BiRefNet（與 remove-background 共用）

移除背景並以純色或漸層取代。

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | 背景模式 |
| `color` | string | `"#ffffff"` | 背景十六進位色碼（當 `backgroundType` 為 `color` 時） |
| `gradientColor1` | string | - | 第一個漸層十六進位色碼 |
| `gradientColor2` | string | - | 第二個漸層十六進位色碼 |
| `gradientAngle` | integer (0-360) | `180` | 漸層角度（以度為單位） |
| `feather` | integer (0-20) | `0` | 邊緣羽化半徑 |
| `format` | `"png"` \| `"webp"` | `"png"` | 輸出格式 |

## 模糊背景 {#blur-background}

**工具路由：** `blur-background`  
**模型：** rembg / BiRefNet（與 remove-background 共用）

在保持主體清晰的同時模糊背景。

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | 模糊強度 |
| `feather` | integer (0-20) | `0` | 邊緣羽化半徑 |
| `format` | `"png"` \| `"webp"` | `"png"` | 輸出格式 |

## 影像放大 {#image-upscaling}

**工具路由：** `upscale`  
**模型：** RealESRGAN（不可用時以 Lanczos 備援）

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `scale` | number | `2` | 放大倍率 |
| `model` | string | `"auto"` | 模型變體 |
| `faceEnhance` | boolean | `false` | 套用 GFPGAN 人臉增強處理 |
| `denoise` | number | `0` | 去雜訊強度 |
| `format` | string | `"auto"` | 輸出格式覆寫 |
| `quality` | number | `95` | 輸出品質（1-100） |

## OCR / 文字擷取 {#ocr-text-extraction}

**工具路由：** `ocr`  
**型號：** Tesseract （`fast`）； RapidOCR 和 PP-OCRv6 小型型號（`balanced`）； PP-OCRv6 具有校準變數評分的中等模型（`best`）

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | 動態的 | 省略 `quality` 和 `engine` 時，SnapOtter 會依 `best`、`balanced`、`fast` 的順序選擇可用的最高品質層。韓語絕不會選擇 `fast`；它會使用 `best`，其次是 `balanced`，否則傳回精確執行階段的安裝或相容性錯誤。 |
| `language` | string | `"auto"` | 語言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| `enhance` | 布林值 | 取決於層級 | 提高局部對比。快速直接應用；僅當校準得分提高 OCR 時，準確的等級才會保留變體。預設為“最佳” |
| `engine` | 細繩 | - | 已棄用的兼容性別名。將 `tesseract` 對應到 `fast`，並將舊版 `paddleocr` 值對應到 `balanced`；它不載入 PaddlePaddle |

傳回提取的文字以及來源元資料：引擎、請求的和實際的品質、設備、提供者、降級狀態、警告和準確的運行時/模型版本（如果適用）。 明確的品質要求永遠不會退回到另一層。 如果 `balanced` 或 `best` 不可用，則 API 傳回 `FEATURE_NOT_INSTALLED` 或 `FEATURE_INCOMPATIBLE`，而不是靜默執行 `fast`。

## PDF OCR {#pdf-ocr}

**工具路由：** `ocr-pdf`  
**模型：** 與影像 OCR 相同的層級系統

使用 AI 驅動的 OCR，逐頁從掃描的 PDF 文件擷取文字。

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | 動態的 | 省略 `quality` 和 `engine` 時，SnapOtter 會依 `best`、`balanced`、`fast` 的順序選擇可用的最高品質層。韓語絕不會選擇 `fast`；它會使用 `best`，其次是 `balanced`，否則傳回精確執行階段的安裝或相容性錯誤。 |
| `language` | string | `"auto"` | 語言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| `pages` | string | `"all"` | 頁面選取：`"all"`、`"1-3"`、`"1,3,5"` |
| `enhance` | 布林值 | 取決於層級 | 提高局部對比。快速直接應用；僅當校準得分提高 OCR 時，準確的等級才會保留變體。預設為“最佳” |
| `engine` | 細繩 | - | 已棄用的兼容性別名。將 `tesseract` 對應到 `fast`，並將舊版 `paddleocr` 值對應到 `balanced`；它不載入 PaddlePaddle |

同樣的不降級規則適用於 PDF OCR。 PDF 頁面在辨識前會進行光柵化處理，一次要求最多可以選擇50個頁面。

## 人臉 / PII 模糊 {#face-pii-blur}

**工具路由：** `blur-faces`  
**模型：** MediaPipe 人臉偵測

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | 高斯模糊半徑 |
| `sensitivity` | number (0-1) | `0.5` | 偵測信賴度門檻 |

## 人臉增強 {#face-enhancement}

**工具路由：** `enhance-faces`  
**模型：** GFPGAN、CodeFormer

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | 增強模型 |
| `strength` | number (0-1) | `0.8` | 增強強度 |
| `sensitivity` | number (0-1) | `0.5` | 人臉偵測門檻 |
| `onlyCenterFace` | boolean | `false` | 只增強最靠近中央的人臉 |

## AI 上色 {#ai-colorization}

**工具路由：** `colorize`  
**模型：** DDColor（以 OpenCV DNN 備援）

將黑白或灰階相片轉換為全彩。

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | 色彩飽和度強度 |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | 模型變體 |

## 去雜訊 {#noise-removal}

**工具路由：** `noise-removal`  
**模型：** SCUNet（分層去雜訊流程）

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | 處理層級 |
| `strength` | number (0-100) | `50` | 去雜訊強度 |
| `detailPreservation` | number (0-100) | `50` | 要保留多少細節；數值越高保留越多紋理 |
| `colorNoise` | number (0-100) | `30` | 色彩雜訊降低強度 |
| `format` | string | `"original"` | 輸出格式：`original`、`png`、`jpeg`、`webp`、`avif`、`jxl` |
| `quality` | number (1-100) | `90` | 輸出編碼品質 |

## 紅眼移除 {#red-eye-removal}

**工具路由：** `red-eye-removal`

偵測人臉特徵點、定位眼睛區域，並修正紅色通道的過飽和。

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | 紅色像素偵測門檻 |
| `strength` | number (0-100) | `70` | 修正強度 |
| `format` | string | - | 輸出格式覆寫（選用） |
| `quality` | number (1-100) | `90` | 輸出品質 |

## 相片修復 {#photo-restoration}

**工具路由：** `restore-photo`

針對老舊或受損相片的多步驟流程：刮痕/撕裂偵測與修復、人臉增強、去雜訊，以及選用的上色。

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | 偵測並修復刮痕、撕裂 |
| `faceEnhancement` | boolean | `true` | 套用人臉增強處理 |
| `fidelity` | number (0-1) | `0.7` | 人臉增強強度（越高越保守） |
| `denoise` | boolean | `true` | 套用去雜訊處理 |
| `denoiseStrength` | number (0-100) | `25` | 去雜訊強度 |
| `colorize` | boolean | `false` | 修復後進行上色 |
| `colorizeStrength` | number (0-100) | `85` | 上色強度 |

## 證件照 {#passport-photo}

**工具路由：** `passport-photo`  
**模型：** MediaPipe 人臉特徵點 + BiRefNet 去背

兩階段工作流程：分析（偵測人臉 + 移除背景），接著產生（裁切、調整大小、平舖）。支援橫跨 6 個地區的 37+ 個國家。

### 階段 1：分析 {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

接受一個影像檔（multipart）。傳回人臉特徵點資料、一張 base64 預覽，以及影像尺寸。

### 階段 2：產生 {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

接受一個 JSON 主體，內含階段 1 的結果加上產生設定：

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `jobId` | string | （必填） | 來自階段 1 的 Job ID |
| `filename` | string | （必填） | 來自階段 1 的原始檔名 |
| `countryCode` | string | （必填） | ISO 國家代碼（例如 `US`、`GB`、`IN`） |
| `documentType` | string | `"passport"` | 文件類型 |
| `bgColor` | string | `"#FFFFFF"` | 背景顏色十六進位色碼 |
| `printLayout` | string | `"none"` | 列印版面配置：`none`、`4x6`、`a4`、`letter` |
| `maxFileSizeKb` | number | `0` | 檔案大小上限（KB）（0 = 無限制） |
| `dpi` | number (72-1200) | `300` | 輸出 DPI |
| `customWidthMm` | number | - | 自訂寬度（mm）（覆寫國家規格） |
| `customHeightMm` | number | - | 自訂高度（mm）（覆寫國家規格） |
| `zoom` | number (0.5-3) | `1` | 縮放倍率 |
| `adjustX` | number | `0` | 水平位置調整 |
| `adjustY` | number | `0` | 垂直位置調整 |
| `landmarks` | object | （必填） | 來自階段 1 的特徵點 |
| `imageWidth` | number | （必填） | 來自階段 1 的影像寬度 |
| `imageHeight` | number | （必填） | 來自階段 1 的影像高度 |

## 物件擦除（影像修補） {#object-erasing-inpainting}

**工具路由：** `erase-object`  
**模型：** 透過 ONNX Runtime 的 LaMa

遮罩會以**第二個檔案部分**（欄位名稱 `mask`）傳送，而非以 base64。遮罩中的白色像素表示要擦除的區域。`format` 與 `quality` 設定會以頂層表單欄位傳送。

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `file` | file | （必填） | 來源影像（multipart） |
| `mask` | file | （必填） | 遮罩影像（multipart，欄位名稱 `mask`，白色 = 擦除） |
| `format` | string | `"auto"` | 輸出格式：`auto`、`png`、`jpg`、`jpeg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| `quality` | integer (1-100) | `95` | 輸出品質 |

當有 NVIDIA GPU 可用時以 CUDA 加速。

## AI 畫布擴展 {#ai-canvas-expand}

**工具路由：** `ai-canvas-expand`  
**模型：** 以 LaMa 為基礎的外延

朝任何方向擴展影像的畫布，並以與現有影像相符的 AI 生成內容填滿新增區域。

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | 上方要延伸的像素數 |
| `extendRight` | integer | `0` | 右方要延伸的像素數 |
| `extendBottom` | integer | `0` | 下方要延伸的像素數 |
| `extendLeft` | integer | `0` | 左方要延伸的像素數 |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | 品質層級 |
| `format` | string | `"auto"` | 輸出格式：`auto`、`png`、`jpg`、`jpeg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| `quality` | integer (1-100) | `95` | 輸出品質 |

至少要有一個延伸方向大於 0。

## 智慧裁切 {#smart-crop}

**工具路由：** `smart-crop`  
**模型：** MediaPipe 人臉偵測（僅 face 模式）

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | 裁切策略：`subject`、`face`、`trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | subject 模式的策略 |
| `width` | integer | - | 輸出寬度 |
| `height` | integer | - | 輸出高度 |
| `padding` | integer (0-50) | `0` | 主體周圍的留白百分比 |
| `facePreset` | string | `"head-shoulders"` | 當 `mode=face` 時的預設框取 |
| `sensitivity` | number (0-1) | `0.5` | 人臉偵測門檻 |
| `threshold` | integer (0-255) | `30` | 背景偵測門檻（trim 模式） |
| `padToSquare` | boolean | `false` | 將修剪後的結果補齊為正方形 |
| `padColor` | string | `"#ffffff"` | 正方形補齊的背景顏色 |
| `targetSize` | integer | - | 補齊輸出的目標尺寸（像素） |
| `quality` | integer (1-100) | - | 輸出品質 |

舊版 `mode` 值 `attention` 與 `content` 仍被接受，並分別對映為 `subject` 與 `trim`。

**人臉預設：**

| 預設 | 最適用於 |
|--------|---------|
| `closeup` | 大頭照 |
| `head-shoulders` | 個人檔案相片 |
| `upper-body` | LinkedIn / 正式 |
| `half-body` | 完整上半身 |

## 音訊轉錄 {#transcribe-audio}

**工具路由：** `transcribe-audio`  
**模型：** faster-whisper

將語音轉換為文字。支援純文字、SRT 與 VTT 輸出格式。

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | 語言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko`、`id`、`th`、`vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | 輸出格式 |

## 自動字幕 {#auto-subtitles}

**工具路由：** `auto-subtitles`  
**模型：** faster-whisper（先從影片擷取音訊，再進行轉錄）

從影片的音軌產生字幕檔。

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | 語言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko`、`id`、`th`、`vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | 輸出字幕格式 |

## PNG 透明度修復 {#png-transparency-fixer}

**工具路由：** `transparency-fixer`  
**模型：** BiRefNet HR-matting（2048x2048 解析度）

修復「假透明」的 PNG，也就是背景已被移除但留下毛邊、光暈或半透明瑕疵的情況。使用 BiRefNet 的高解析度去背模型產生乾淨的 alpha 通道，接著套用可設定的去毛邊處理，以移除邊緣沿線的顏色汙染。

**OOM 備援鏈：** 若 BiRefNet HR-matting 超出可用記憶體，工具會自動退回 `birefnet-general`，然後退回 `u2net`。

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | 用於移除顏色汙染的邊緣去毛邊強度 |
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

以下工具並非 Python sidecar 工具，但在啟用特定選項時會使用 AI 功能。

### 影像增強 {#image-enhancement}

**工具路由：** `image-enhancement`  
**引擎：** 以分析為基礎（Sharp 直方圖與統計）

分析影像並自動修正曝光、對比、白平衡、飽和度、銳利度與雜訊。支援特定場景模式。

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | 用於調校修正的場景模式 |
| `intensity` | number (0-100) | `50` | 整體修正強度 |
| `corrections.exposure` | boolean | `true` | 套用曝光修正 |
| `corrections.contrast` | boolean | `true` | 套用對比修正 |
| `corrections.whiteBalance` | boolean | `true` | 套用白平衡修正 |
| `corrections.saturation` | boolean | `true` | 套用飽和度修正 |
| `corrections.sharpness` | boolean | `true` | 套用銳利度修正 |
| `corrections.denoise` | boolean | `true` | 套用去雜訊 |
| `deepEnhance` | boolean | `false` | 透過 SCUNet 啟用 AI 去雜訊（需要 `upscale-enhance` 套件包） |

另有一個分析端點位於 `POST /api/v1/tools/image/image-enhancement/analyze`，它會傳回偵測到的修正而不加以套用。

### 內容感知調整大小（接縫裁減） {#content-aware-resize-seam-carving}

**工具路由：** `content-aware-resize`  
**引擎：** Go `caire` 二進位檔（非 Python，無 GPU 效益）

透過移除低能量接縫來智慧調整影像大小，保留重要內容。

| 參數 | 型別 | 預設值 | 說明 |
|-----------|------|---------|-------------|
| `width` | number | - | 目標寬度 |
| `height` | number | - | 目標高度 |
| `protectFaces` | boolean | `false` | 保護偵測到的人臉區域（需要 `face-detection` 套件包） |
| `blurRadius` | number (0-20) | `4` | 能量計算的預先模糊 |
| `sobelThreshold` | number (1-20) | `2` | 邊緣敏感度門檻 |
| `square` | boolean | `false` | 強制正方形輸出 |
