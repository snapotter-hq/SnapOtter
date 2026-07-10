---
description: "应用双色调效果，可自定义阴影色和高光色。"
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: 26094fc96843
---

# 双色调 {#duotone}

为图片应用双色调效果。图片先被转换为灰度，然后映射到阴影色（暗部色调）与高光色（亮部色调）之间的渐变。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/duotone`

接受 multipart 表单数据，包含一个图片文件和一个 JSON `settings` 字段。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| shadow | string | 否 | `"#1e3a8a"` | 阴影十六进制颜色（应用于暗部色调） |
| highlight | string | 否 | `"#fbbf24"` | 高光十六进制颜色（应用于亮部色调） |
| intensity | integer | 否 | `100` | 效果强度（0-100）；0 返回原图，100 应用完整双色调 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## 注意事项 {#notes}

- 输出格式与输入格式一致。HEIC、RAW、PSD 和 SVG 输入在处理前会自动解码。
- `intensity` 小于 100 时会将双色调结果与原始图片混合，从而获得更柔和的效果。
- 常见的双色调搭配包括藏青/金、青绿/珊瑚，以及紫色/粉色。
