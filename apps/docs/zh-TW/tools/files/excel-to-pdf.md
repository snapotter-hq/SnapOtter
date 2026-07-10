---
description: "將試算表轉換為 PDF。"
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: 1a36cc850d4b
---

# Excel 轉 PDF {#excel-to-pdf}

將 Excel、OpenDocument 或 CSV 試算表轉換為 PDF。過寬的工作表可能會跨多頁分頁。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

接受包含一個 Excel/ODS/CSV 檔案的 multipart form data。

## Parameters {#parameters}

此工具沒有可設定的參數。上傳試算表，它就會被轉換為 PDF。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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
- 過寬的工作表在產生的 PDF 中可能會跨多頁分割。
- 圖表與設定格式化條件會在 PDF 輸出中呈現。
- 轉換由在伺服器上以無介面模式執行的 LibreOffice 處理。
