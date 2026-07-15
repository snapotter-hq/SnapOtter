---
description: "將 EPUB 轉換為 PDF、DOCX、HTML 或 Markdown。"
i18n_source_hash: cb39f254ff2f
i18n_provenance: human
i18n_output_hash: bd20a836a10a
---

# 從 EPUB 轉換 {#convert-epub}

將 EPUB 電子書轉換為 PDF、Word（DOCX）、HTML 或 Markdown。書中的遠端資源不會被抓取。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

接受包含一個 EPUB 檔案以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | 輸出格式：`pdf`、`docx`、`html`、`md` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
```

## Example Response {#example-response}

回傳 `202 Accepted`。透過 `/api/v1/jobs/{jobId}/progress` 的 SSE 追蹤進度。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 接受的輸入格式：`.epub`。
- EPUB 中內嵌的遠端資源（外部影像、字型）基於安全考量不會被抓取。
- 轉換後輸出的影像品質可能會因 EPUB 結構而有所不同。
- 轉換由伺服器上的 Pandoc 處理。
