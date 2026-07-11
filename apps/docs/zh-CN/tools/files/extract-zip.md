---
description: "安全地从 ZIP 压缩包中提取文件，并防范压缩炸弹。"
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: 5098f0bdd631
---

# Extract ZIP {#extract-zip}

安全地从 ZIP 压缩包中提取文件。单文件压缩包直接返回其中包含的文件；多文件压缩包返回一个包含所提取内容的扁平 ZIP。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

接受包含 ZIP 文件的 multipart 表单数据。不需要 settings 字段。

## Parameters {#parameters}

此工具没有可配置的参数。上传要提取的 `.zip` 文件。

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

- 只接受 `.zip` 文件作为输入。
- 如果压缩包只包含一个文件，则直接返回该文件（不再包裹在 ZIP 中）。
- 如果压缩包包含多个文件，则返回一个扁平 ZIP，所有文件都提取到根级别（嵌套目录结构会被扁平化）。
- 内置的压缩炸弹防护会拒绝压缩率过高或文件数量过多的压缩包，以防止资源耗尽。
