---
description: "從 PDF 擷取頁面或將其分割成多個部分。"
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: b4cf4866e8aa
---

# 分割 PDF {#split-pdf}

將一段頁面範圍擷取成新的 PDF，或將文件分割成每 N 頁一份的區塊。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

接受包含 PDF 檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| mode | string | 否 | `"range"` | 分割模式：`range` 或 `every` |
| range | string | 當 mode 為 `range` 時 | - | 以 qpdf 語法表示的頁面範圍，例如 `"1-5,8,10-z"` |
| everyN | integer | 當 mode 為 `every` 時 | - | 分割成每 N 頁一份的區塊（1-500） |

## 範例請求 {#example-request}

擷取特定頁面：

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

分割成每 10 頁一份的區塊：

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## 注意事項 {#notes}

- 在 `range` 模式下，會回傳一份包含選定頁面的單一 PDF。
- 在 `every` 模式下，結果會是一個包含各個部分的 ZIP 封存檔。
- 頁面範圍使用 qpdf 語法：`1-5` 代表第 1 到第 5 頁，`z` 代表最後一頁，並可用逗號組合多個範圍（例如 `1-3,7,10-z`）。
