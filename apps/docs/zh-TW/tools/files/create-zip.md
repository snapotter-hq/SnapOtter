---
description: "將多個檔案打包成單一 ZIP 壓縮檔。"
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: 73948f9e778b
---

# 建立 ZIP {#create-zip}

將任意類型的多個檔案打包成單一 ZIP 壓縮檔。重複的檔名會自動去除重複。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

接受包含兩個或以上檔案的 multipart form data。不需要 settings 欄位。

## Parameters {#parameters}

此工具沒有可設定的參數。上傳 2 至 50 個任意類型的檔案來打包。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- 需要 2 到 50 個輸入檔案。
- 接受任何檔案類型；對輸入格式沒有限制。
- 若多個檔案共用相同名稱，會以數字後綴自動去除重複。
- 輸出壓縮檔使用標準的 ZIP 壓縮（deflate）。
