---
description: "在 PowerPoint 與 OpenDocument 簡報格式之間轉換。"
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: e7611e1add96
---

# 轉換簡報 {#convert-presentation}

在 PowerPoint（PPTX）與 OpenDocument 簡報（ODP）格式之間轉換簡報。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

接受包含一個 PowerPoint/ODP 檔案以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | 輸出格式：`pptx`、`odp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
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

- 接受的輸入格式：`.pptx`、`.ppt`、`.odp`。
- 轉換由在伺服器上以無介面模式執行的 LibreOffice 處理。
- 動畫與轉場效果在不同格式之間可能無法保留。
- 輸出格式必須與輸入格式不同。
