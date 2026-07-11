---
description: "使用 AI 驅動的 OCR 從 PDF 文件中擷取文字。"
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: afab5ee963b5
---

# PDF OCR {#pdf-ocr}

使用 AI 驅動的光學字元辨識從 PDF 文件中擷取文字。支援多種品質層級與語言。需要安裝 OCR 功能套件包。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

接受包含 PDF 檔案與選填 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| quality | string | 否 | `"balanced"` | OCR 品質層級：`fast`、`balanced`、`best` |
| language | string | 否 | `"auto"` | 文件語言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| pages | string | 否 | `"all"` | 頁面選擇，例如 `"all"`、`"1-3"`、`"1,3,5"` |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
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
- 這是一個需要安裝 **OCR 功能套件包** 的 AI 工具。若未安裝該套件包，API 會回傳 `501 Not Implemented`。
- `fast` 品質層級使用較輕量的模型以加快處理速度；`best` 則以速度為代價使用更準確的模型。
- `auto` 語言設定會嘗試自動偵測文件語言。
- 你可以使用範圍（`"1-3"`）、逗號分隔的清單（`"1,3,5"`）或 `"all"` 來鎖定特定頁面（代表每一頁）。
- 對於已包含可選取文字的 PDF，建議改用速度更快的 [PDF 轉文字](./pdf-to-text) 工具。
