---
description: "按行列数或像素尺寸将一张图像分割为网格图块，以 ZIP 压缩包形式返回。"
i18n_source_hash: 57a2e11e7cce
i18n_provenance: human
i18n_output_hash: 49ea1a52dd18
---

# 图像分割 {#image-splitting}

按列/行数或指定的像素尺寸将单张图像分割为网格图块。返回包含所有图块的 ZIP 压缩包。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/split`

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| columns | integer | 否 | 3 | 分割的列数（1 到 100） |
| rows | integer | 否 | 3 | 分割的行数（1 到 100） |
| tileWidth | integer | 否 | - | 图块宽度（像素，最小 10）。当同时设置 `tileWidth` 和 `tileHeight` 时，覆盖 `columns`。 |
| tileHeight | integer | 否 | - | 图块高度（像素，最小 10）。当同时设置 `tileWidth` 和 `tileHeight` 时，覆盖 `rows`。 |
| outputFormat | string | 否 | `"original"` | 图块的输出格式：`original`、`png`、`jpg`、`webp`、`avif`、`jxl` |
| quality | number | 否 | 90 | 有损格式的输出质量（1 到 100） |

## 示例请求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## 示例响应 {#example-response}

响应以 ZIP 文件形式直接流式返回，附带 `Content-Type: application/zip`。文件名遵循 `split-<jobId>.zip` 的模式。

ZIP 内的每个图块命名为 `<originalBaseName>_r<row>_c<col>.<ext>`（例如 `photo_r1_c1.png`、`photo_r2_c3.webp`）。

## 说明 {#notes}

- 接受单个图像文件。
- 支持 HEIC、RAW、PSD 和 SVG 输入格式（自动解码）。
- 当同时提供 `tileWidth` 和 `tileHeight` 时，它们优先于 `columns`/`rows`。网格尺寸按 `ceil(imageWidth / tileWidth)` 和 `ceil(imageHeight / tileHeight)` 计算。
- 如果图像尺寸无法被整除，边缘图块（最右列、最底行）可能小于指定的图块尺寸。
- 网格尺寸最大限制为 100x100（10,000 个图块）。
- 响应直接流式返回 ZIP，因此没有 JSON 响应体。搭配 curl 使用 `--output` 来保存文件。
