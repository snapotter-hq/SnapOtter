---
description: "在 Excel、OpenDocument 與 CSV 格式之間轉換。"
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: 22aa356329b5
---

# 轉換試算表 {#convert-spreadsheet}

在 Excel（XLSX）、OpenDocument 試算表（ODS）與 CSV 格式之間轉換試算表。多工作表的活頁簿在轉換為 CSV 時會匯出第一個工作表。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

接受包含一個 Excel/ODS/CSV 檔案以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | 輸出格式：`xlsx`、`ods`、`csv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
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

- 接受的輸入格式：`.xlsx`、`.xls`、`.ods`、`.csv`。
- 將多工作表的活頁簿轉換為 CSV 時，只會匯出第一個工作表。
- 公式會被計算，並在 CSV 輸出中以靜態值匯出。
- 輸出格式必須與輸入格式不同。
