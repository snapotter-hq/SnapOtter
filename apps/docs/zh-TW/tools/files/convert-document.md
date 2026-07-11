---
description: "在 Word、OpenDocument、RTF 與純文字格式之間轉換。"
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: 0d64247d89d1
---

# 轉換文件 {#convert-document}

使用 LibreOffice 在 Word（DOCX）、OpenDocument（ODT）、RTF 與純文字格式之間轉換文件。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

接受包含一個 Word/ODT/RTF/TXT 檔案以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | 輸出格式：`docx`、`odt`、`rtf`、`txt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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

- 接受的輸入格式：`.docx`、`.doc`、`.odt`、`.rtf`、`.txt`。
- 轉換由在伺服器上以無介面模式執行的 LibreOffice 處理。
- 複雜的格式（巨集、內嵌物件）在不同格式之間轉換時可能無法保留。
- 輸出格式必須與輸入格式不同。
