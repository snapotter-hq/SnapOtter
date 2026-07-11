---
description: "將簡報轉換為 PDF。"
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: 36860a37bf0c
---

# PowerPoint to PDF {#powerpoint-to-pdf}

將 PowerPoint 或 OpenDocument 簡報轉換為 PDF，每張投影片對應一頁。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

接受包含 PowerPoint/ODP 檔案的 multipart form data。

## Parameters {#parameters}

此工具沒有可設定的參數。上傳一個簡報，它就會被轉換為 PDF。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
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

- 接受的輸入格式：`.pptx`、`.ppt`、`.odp`。
- 每張投影片會成為 PDF 中的一頁。
- 轉換由伺服器上以無介面模式執行的 LibreOffice 處理。
- 動畫與轉場效果不會包含在 PDF 輸出中。
