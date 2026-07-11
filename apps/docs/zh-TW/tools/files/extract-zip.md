---
description: "安全地從 ZIP 壓縮檔中解壓縮檔案，並具備壓縮炸彈防護。"
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: e43d9bbdf846
---

# 解壓縮 ZIP {#extract-zip}

安全地從 ZIP 壓縮檔中解壓縮檔案。單一檔案的壓縮檔會直接回傳所含的檔案；多檔案的壓縮檔則會回傳一個包含解壓縮內容的扁平 ZIP。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

接受包含一個 ZIP 檔案的 multipart form data。不需要 settings 欄位。

## Parameters {#parameters}

此工具沒有可設定的參數。上傳一個 `.zip` 檔案來解壓縮。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## Notes {#notes}

- 只接受 `.zip` 檔案作為輸入。
- 若壓縮檔只含有單一檔案，該檔案會被直接回傳（不會包在 ZIP 中）。
- 若壓縮檔含有多個檔案，會回傳一個扁平 ZIP，所有檔案都解壓縮至根層級（巢狀的目錄結構會被展平）。
- 內建的壓縮炸彈防護會拒絕壓縮比或檔案數量過高的壓縮檔，以防止資源耗盡。
