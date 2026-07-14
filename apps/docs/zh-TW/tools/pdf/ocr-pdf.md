---
description: "使用內建 Tesseract 或可選的高精度 RapidOCR 運行時從本地掃描的 PDF 中提取文字。"
i18n_output_hash: 01d4565a7e86
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# PDF OCR {#pdf-ocr}

從掃描的 PDF 文件中逐頁提取文本，無需將 PDF 傳送到外部服務。內建 `fast` 層使用 Tesseract。選購的 `balanced` 和 `best` 層使用 RapidOCR 和固定的 PP-OCR ONNX 機型。


<!-- korean-ocr-contract:start -->
::: info 韓語 OCR 相容性
快速 OCR 支援 `auto`、`en`、`de`、`es`、`fr`、`zh` 和 `ja`，但不支援韓語 (`ko`)。韓語需要精確 OCR 套件以及 `balanced` 或 `best`。此套件可在官方 Linux amd64 和 arm64 容器上執行；即使是 NVIDIA 主機，OCR 仍使用 CPU。不受支援的系統會傳回明確的相容性錯誤，絕不會靜默回退至 `fast`。韓語搭配 `fast` 或舊版 `tesseract` 別名時，會在排入佇列前以 `FEATURE_INCOMPATIBLE` 和 `fast-korean-unsupported` 拒絕。
:::
<!-- korean-ocr-contract:end -->
## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

接受包含 PDF 檔案與選填 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| file | file | 是的 | - | PDF 檔案（多部分），最多 512 個 MiB 編碼；較低的運營商上傳限制仍然適用 |
| quality | string | 不 | 動態的 | OCR 品質等級：`fast`、`balanced` 或 `best` |
| language | string | 否 | `"auto"` | 文件語言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| pages | string | 否 | `"all"` | 頁面選擇，例如 `"all"`、`"1-3"`、`"1,3,5"` |
| enhance | boolean | 不 | 取決於層級 | 提高辨識前的局部對比。快速直接應用；僅當校準評分改善結果時，平衡和最佳才會保留變異。對於 `best` 預設為 `true`，對於 `fast`/`balanced` 預設為 `false` |
| engine | string | 不 | - | 已棄用的兼容性別名。請改用 `quality`。 `tesseract` 對應到 `fast`；舊版 `paddleocr` 值對應到 `balanced` 但不載入 PaddlePaddle |

省略 `quality` 和 `engine` 時，SnapOtter 會依 `best`、`balanced`、`fast` 的順序選擇可用的最高品質層。韓語絕不會選擇 `fast`；它會使用 `best`，其次是 `balanced`，否則傳回精確執行階段的安裝或相容性錯誤。

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## 範例回應 {#example-response}

回傳 `202 Accepted`。透過 SSE 於 `/api/v1/jobs/{jobId}/progress` 追蹤進度。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## 注意事項 {#notes}

- 接受的輸入格式：`.pdf`。
- 內建`fast`，並在官方鏡像中添加了約25個 MiB。 `balanced` 和 `best` 需要選購的精確 OCR 套件（大約下載 208-234 MiB 並安裝 409-488 MiB，取決於目標）。
- 準確套件支援 Linux amd64 和 arm64，並在 CPU（包括 NVIDIA 主機）上使用 ONNX Runtime。
- 明確請求的等級絕不會默默降級。如果 `balanced` 或 `best` 不可用，則 API 傳回 `501` 和 `FEATURE_NOT_INSTALLED` 或 `FEATURE_INCOMPATIBLE`。
- PDF 頁面在 OCR 之前以高解析度進行光柵化。 `best` 運行更精確的中型 PP-OCRv6 模型，並對方向和增強變體進行評分，以速度為代價提高識別能力。
- `auto` 語言設定可以跨支援的腳本集進行識別；明確的提示可以改善已知文件語言的結果。
- 你可以使用範圍（`"1-3"`）、逗號分隔的清單（`"1,3,5"`）或 `"all"` 來鎖定特定頁面（代表每一頁）。
- 一個請求最多可以處理 50 個頁面。光柵化暫存資料的上限為 512 MiB，聚合 UTF-8 OCR 回應的上限為 1,000,000 位元組；超出限制的作業失敗而不是傳回部分文字。
- 對於已包含可選取文字的 PDF，建議改用速度更快的 [PDF 轉文字](./pdf-to-text) 工具。
