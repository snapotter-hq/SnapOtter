---
description: "使用 svgo 压缩 SVG 文件，并将结果保留为矢量 SVG，可控制精度、多遍处理、元数据和格式化。"
i18n_source_hash: c2601cc2cdd8
i18n_provenance: machine
i18n_output_hash: 9b7a1d65734e
i18n_hash_version: 2
---

# SVG 优化 {#optimize-svg}

通过移除编辑器残留、冗余属性和多余的小数位来缩小 SVG 文件，并将结果下载为 SVG。与“网页优化”不同，输出永远不会被栅格化。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

接受包含 `.svg` 或 `.svgz` 文件以及 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| precision | number | 否 | `3` | 路径数据和数字中保留的小数位数（0 到 8）。数值越低，文件越小，曲线略粗糙。 |
| multipass | boolean | 否 | `true` | 反复运行优化器，直到输出不再变小 |
| removeMetadata | boolean | 否 | `true` | 移除注释、`<metadata>`、`<desc>` 和编辑器专用数据。关闭后会保留它们。 |
| pretty | boolean | 否 | `false` | 为便于阅读而缩进输出，而不是压缩成几行 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## 说明 {#notes}

- 输入必须是 SVG 或 SVGZ 文件。栅格图像会被拒绝，返回 `400`，错误代码为 `IMAGE_UNDECODABLE`。
- `.svgz` 输入会先被解压，输出始终是普通的 `.svg`。
- SVG 解压后限制为 2 MB。更大的文件会被拒绝，返回 `400`，错误代码为 `SVG_TOO_LARGE`。
- `viewBox` 和 `<title>` 始终会保留，因此图形仍可缩放并保留其无障碍名称。
- 输入和输出都会经过 SVG 清理器，它会移除脚本和其他活动内容。
- 对于路径密集的图稿，降低 `precision` 最能节省体积。请在 0 到 2 时目视检查结果。
