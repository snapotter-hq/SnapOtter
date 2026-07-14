---
description: "使用內建 Tesseract 或可選的高精度 RapidOCR 運行時從本機圖像中提取文字。"
i18n_output_hash: 8e9c0c578a2d
i18n_source_hash: 0d453b49db02
i18n_provenance: human
---

# OCR／文字擷取 {#ocr-text-extraction}

從圖像中提取文本，而不將圖像發送到外部服務。內建 `fast` 層使用 Tesseract。選購的 `balanced` 和 `best` 層使用 RapidOCR 和固定的 PP-OCR ONNX 機型。


<!-- korean-ocr-contract:start -->
::: info 韓語 OCR 相容性
快速 OCR 支援 `auto`、`en`、`de`、`es`、`fr`、`zh` 和 `ja`，但不支援韓語 (`ko`)。韓語需要精確 OCR 套件以及 `balanced` 或 `best`。此套件可在官方 Linux amd64 和 arm64 容器上執行；即使是 NVIDIA 主機，OCR 仍使用 CPU。不受支援的系統會傳回明確的相容性錯誤，絕不會靜默回退至 `fast`。韓語搭配 `fast` 或舊版 `tesseract` 別名時，會在排入佇列前以 `FEATURE_INCOMPATIBLE` 和 `fast-korean-unsupported` 拒絕。
:::
<!-- korean-ocr-contract:end -->
## API 端點 {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**處理：** OCR 一律以非同步方式執行。驗證並加入佇列後，端點會立即傳回帶有 `jobId` 的 `202 Accepted`。請透過作業的 SSE 進度串流追蹤至最終的 `complete` 或 `failed` 事件；成功事件的 `result` 包含 OCR 欄位。

**準確的 OCR 套件：** 選購的 `ocr` 執行時間（大約下載 208-234 MiB 並安裝 409-488 MiB，視目標而定）。 `fast` 不需要此套件；安裝程式會驗證簽章索引所限制的確切大小。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是的 | - | 圖像檔案（多部分），最多 512 MiB 編碼和 4000 萬像素解碼；較低的運營商上傳限制仍然適用 |
| quality | string | 不 | 動態的 | 品質等級：`fast` (Tesseract)、`balanced`（具有小型 PP-OCRv6 模型的 RapidOCR）或 `best`（具有校準變數評分的更高精度中型 PP-OCRv6 模型） |
| language | string | 否 | `"auto"` | 語言提示：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| enhance | boolean | 不 | 取決於層級 | 提高辨識前的局部對比。快速直接應用；僅當校準評分改善結果時，平衡和最佳才會保留變異。對於 `best` 預設為 `true`，對於 `fast`/`balanced` 預設為 `false` |
| engine | string | 不 | - | 已棄用的兼容性別名。請改用 `quality`。 `tesseract` 對應到 `fast`；舊版 `paddleocr` 值對應到 `balanced` 但不載入 PaddlePaddle |

省略 `quality` 和 `engine` 時，SnapOtter 會依 `best`、`balanced`、`fast` 的順序選擇可用的最高品質層。韓語絕不會選擇 `fast`；它會使用 `best`，其次是 `balanced`，否則傳回精確執行階段的安裝或相容性錯誤。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## 已接受的回應（202） {#accepted-response-202}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 進度和結果（SSE） {#progress-sse-optional}

使用 `202` 回應傳回的 `jobId`（或已提供的 `clientJobId`）連線至 `GET /api/v1/jobs/{jobId}/progress`。請保持串流連線，直到收到最終的 `complete` 或 `failed` 事件。成功的最終框架會在 `result` 中包含 OCR 輸出：

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type": "single",
  "phase": "complete",
  "stage": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_ocr.txt",
    "originalSize": 12345,
    "processedSize": 47,
    "text": "Extracted text content from the image...",
    "engine": "rapidocr-onnx",
    "requestedQuality": "best",
    "actualQuality": "best",
    "device": "cpu",
    "provider": "CPUExecutionProvider",
    "degraded": false,
    "warnings": [],
    "runtimeVersion": "2.1.0",
    "modelVersion": "PP-OCRv6-best-v1-medium"
  }
}
```

處理失敗會透過最終 `failed` 事件的 `error` 欄位傳遞；加入佇列後不會以 HTTP `422` 回應傳回。

## 注意事項 {#notes}

- `fast` 在支援的 SnapOtter 映像中始終可用。 `balanced` 和 `best` 需要選購的精確 OCR 套件。
- 內建 Tesseract 在官方鏡像上增加了約25個 MiB。準確的套件儲存在 `/data/ai` 中，而不是烘焙到映像中。
- 官方 Linux amd64 和 arm64 容器的準確包裝已發布。 它特意使用 ONNX Runtime 的 CPU 提供者（包括在 NVIDIA 主機上），因此它不依賴 CUDA 庫或 GPU 相容性。 來源和預先建置的 bare-metal 安裝使用 Fast OCR，除非它們提供自己的相容運行時間。
- 成功的最終 `result` 同時包含 `text` 中的擷取文字和 `downloadUrl` 中可下載的 `.txt` 成品。
- SnapOtter 遵循明確要求的等級。如果`balanced`或`best`不可用，則 API 傳回`501`和`FEATURE_NOT_INSTALLED`或`FEATURE_INCOMPATIBLE`；它永遠不會默默地將請求降級到另一層。
- 成功的空結果仍然是空結果。運行時失敗會傳回錯誤，而不是使用較低品質的引擎重試。
- 成功的最終 `result` 會報告 `requestedQuality` 和 `actualQuality`，以及引擎、設備、提供者、執行時間和模型版本及所有警告。
- 透過自動解碼支援 HEIC/HEIF、RAW、TGA、PSD、EXR 與 HDR 輸入格式。
- 超大編碼輸入返回 `413`。超過 4000 萬像素的圖像和超過其有限輸出限制的 OCR 回應將被拒絕，而不是部分處理。
