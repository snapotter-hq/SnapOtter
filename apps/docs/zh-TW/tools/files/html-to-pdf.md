---
description: "將 HTML 檔案轉換為 PDF。"
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: 35aea922dbe5
---

# HTML 轉 PDF {#html-to-pdf}

將 HTML 檔案轉換為帶樣式的 PDF 文件。為了保護隱私，遠端資源（外部影像、樣式表、指令碼）會被停用。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

接受包含一個 HTML 檔案的 multipart form data。

## Parameters {#parameters}

此工具沒有可設定的參數。上傳 HTML 檔案，它就會被轉換為 PDF。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
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

- 接受的輸入格式：`.html`、`.htm`。
- 為了保護隱私與安全，遠端資源（透過 URL 引用的影像、樣式表、指令碼）不會被抓取。
- 內嵌樣式與內嵌影像（data URI）會被保留。
- 轉換由伺服器上的 WeasyPrint 處理。
