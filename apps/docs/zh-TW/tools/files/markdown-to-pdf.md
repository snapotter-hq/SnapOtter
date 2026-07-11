---
description: "將 Markdown 檔案轉換為帶樣式的 PDF。"
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: 9949063284c6
---

# Markdown to PDF {#markdown-to-pdf}

將 Markdown 檔案轉換為帶樣式的 PDF 文件。基於隱私考量，遠端資源已停用。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

接受包含 Markdown 檔案的 multipart form data。

## Parameters {#parameters}

此工具沒有可設定的參數。上傳一個 Markdown 檔案，它就會被轉換為 PDF。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
```

## Example Response {#example-response}

回傳 `202 Accepted`。可透過 SSE 在 `/api/v1/jobs/{jobId}/progress` 追蹤進度。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 接受的輸入格式：`.md`、`.markdown`。
- 基於隱私與安全考量，不會抓取遠端資源（透過 URL 參照的圖片、樣式表）。
- Markdown 會先被算繪為 HTML，再透過 WeasyPrint 轉換為 PDF。
- 程式碼區塊、表格及其他 Markdown 元素會在 PDF 輸出中套用樣式。
