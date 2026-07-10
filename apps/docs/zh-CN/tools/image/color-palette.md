---
description: "从图片中提取主色，作为调色板输出。"
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: 6fbe48cf4d59
---

# 调色板 {#color-palette}

从图片中提取主色，并以十六进制颜色值返回。使用量化频率分析来识别最突出且视觉上最具区分度的颜色。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

接受 multipart 表单数据，包含一个图片文件和一个可选的 JSON `settings` 字段。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| count | integer | 否 | `8` | 要提取的颜色数量（2-16） |
| format | string | 否 | `"hex"` | 颜色格式：`hex`、`rgb`、`hsl` |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## 响应示例 {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## 响应字段 {#response-fields}

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| filename | string | 净化后的文件名 |
| colors | array | 按请求格式返回的颜色字符串数组，按主导程度排序（出现最频繁的在前） |
| hex | array | 十六进制颜色字符串数组（无论 `format` 设置如何，始终为十六进制） |
| count | number | 提取到的颜色数量 |

## 注意事项 {#notes}

- 最多返回 `count` 种主色（默认 8，范围 2-16），按频率排序（最常见的在前）。
- 图片在分析时会在内部缩放为 100x100 像素，因此调色板反映的是整体颜色分布，而非细小的细节。
- 颜色使用中位切分量化提取，该方法沿取值范围最宽的通道递归拆分像素群。
- 分析前会移除 alpha 通道，因此透明区域不会被纳入考虑。
- 这是一个只读端点。它不会生成可下载的输出文件或 `jobId`。
- HEIC、RAW、PSD 和 SVG 输入在分析前会自动解码。
