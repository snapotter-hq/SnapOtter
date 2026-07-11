---
description: "使用模式模板重命名多个文件并以 ZIP 下载。"
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: 4b35a9b3af6b
---

# Bulk Rename {#bulk-rename}

使用带有索引、补零索引和原始文件名占位符的模式模板重命名多个文件。返回一个包含所有重命名文件的 ZIP 归档。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

接受包含多个文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pattern | string | 否 | `"image-{{index}}"` | 带占位符的命名模式（最多 1000 个字符） |
| startIndex | number | 否 | `1` | 起始索引编号 |

### Pattern Placeholders {#pattern-placeholders}

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{index}}` | 从 `startIndex` 开始的顺序编号 | `1`、`2`、`3` |
| `{{padded}}` | 补零的顺序编号 | `01`、`02`、`03` |
| `{{original}}` | 不含扩展名的原始文件名 | `photo`、`IMG_001` |

原始文件扩展名始终会被保留。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

这会产生：`vacation-1.jpg`、`vacation-2.jpg`、`vacation-3.jpg`

使用原始文件名：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

这会产生：`2024-trip-IMG_001-1.jpg`、`2024-trip-IMG_002-2.jpg`

## Example Response {#example-response}

响应是直接流式传输的 ZIP 文件（不是 JSON 响应）。响应标头为：

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Notes {#notes}

- 此工具不处理图像。它只重命名文件并将其打包成 ZIP 归档。
- `{{padded}}` 的补零宽度会根据文件总数自动确定（例如 100 个文件会使用 3 位补零：`001`、`002` 等）。
- 文件扩展名会从原始文件名中保留。
- 文件名会被清理以移除不安全字符。
- 至少必须提供一个文件。
