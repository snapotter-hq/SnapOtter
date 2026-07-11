---
description: "通过压缩嵌入的图像来缩减 PDF 文件大小。"
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: c96018e728d8
---

# Compress PDF {#compress-pdf}

通过对嵌入的图像进行降采样来缩减 PDF 文件大小。可在质量滑块和目标文件大小之间选择。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

接受包含一个 PDF 文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | 压缩模式：`quality` 或 `targetSize` |
| quality | integer | No | `75` | 压缩质量，1-100（值越高压缩越少）。在 `quality` 模式下使用 |
| targetSizeKb | number | No | - | 以千字节为单位的目标文件大小。在 `targetSize` 模式下使用 |

## Example Request {#example-request}

按质量压缩：

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

压缩到目标大小：

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- 在 `quality` 模式下，值越低生成的文件越小，但图像退化越严重。
- 在 `targetSize` 模式下，二分查找会找到能够容纳所请求大小的最高 DPI。
- 如果压缩会使文件变大，则原始字节将原样返回。
- 文本和矢量内容不受影响；只有嵌入的栅格图像会被降采样。
