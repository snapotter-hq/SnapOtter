---
description: "从图像生成带有各通道统计信息的 RGB 直方图图表。"
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: 58229d59986f
---

# 直方图 {#histogram}

从图像生成 RGB 直方图图表。返回一张 PNG 直方图图像，并在响应 JSON 中附带各通道统计信息和原始的 256 桶直方图数据。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/histogram`

接受包含一个图像文件的 multipart 表单数据，以及一个 JSON `settings` 字段。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| scale | string | 否 | `"linear"` | Y 轴刻度：`linear` 或 `log` |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## 说明 {#notes}

- `downloadUrl` 指向渲染后的 PNG 直方图图表，展示 R、G、B 和亮度分布。
- `bins` 包含每个通道（红、绿、蓝、亮度）的原始 256 值数组，适用于渲染自定义可视化。
- `stats` 提供每个通道的平均值、中位数和标准差。
- `mean` 和 `max` 是向后兼容的简写字段。
- 当直方图由少数几个峰值主导，而你想看清较低桶中的细节时，使用 `log` 刻度。
- HEIC、RAW、PSD 和 SVG 输入会在分析前被自动解码。
