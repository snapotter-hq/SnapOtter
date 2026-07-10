---
description: "将多个文件打包成单个 ZIP 压缩包。"
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: ebd3678d3230
---

# Create ZIP {#create-zip}

将任意类型的多个文件打包成单个 ZIP 压缩包。重复的文件名会被自动去重。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

接受包含两个或更多文件的 multipart 表单数据。不需要 settings 字段。

## Parameters {#parameters}

此工具没有可配置的参数。上传 2 到 50 个任意类型的文件进行打包。

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

- 需要 2 到 50 个输入文件。
- 接受任意文件类型；对输入格式没有限制。
- 如果多个文件同名，会自动用数字后缀去重。
- 输出压缩包使用标准 ZIP 压缩（deflate）。
