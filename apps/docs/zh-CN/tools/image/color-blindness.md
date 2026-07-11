---
description: "模拟不同类型色觉障碍者眼中图片的呈现效果。"
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: 20d2cb319160
---

# 色盲模拟 {#color-blindness-simulation}

模拟色觉障碍（CVD），预览各类色盲人群眼中图片的呈现效果。适用于设计、图表和 UI 的无障碍测试。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

接受 multipart 表单数据，包含一个图片文件和一个 JSON `settings` 字段。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| simulationType | string | 否 | `"deuteranomaly"` | 要模拟的色觉障碍类型 |

### 模拟类型 {#simulation-types}

| 值 | 状况 | 说明 |
|-------|-----------|-------------|
| `protanopia` | 红色盲 | 完全缺失红色视锥细胞 |
| `deuteranopia` | 绿色盲 | 完全缺失绿色视锥细胞 |
| `tritanopia` | 蓝色盲 | 完全缺失蓝色视锥细胞 |
| `protanomaly` | 红色弱 | 红色视锥细胞敏感度降低 |
| `deuteranomaly` | 绿色弱 | 绿色视锥细胞敏感度降低（最常见） |
| `tritanomaly` | 蓝色弱 | 蓝色视锥细胞敏感度降低 |
| `achromatopsia` | 全色盲 | 完全缺失色觉 |
| `blueConeMonochromacy` | 仅蓝色视锥 | 仅蓝色视锥细胞有功能 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## 注意事项 {#notes}

- 绿色弱（deuteranomaly）是默认选项，因为它是最常见的色觉障碍形式，约影响 6% 的男性。
- 该模拟使用颜色变换矩阵，建模视锥感光细胞减弱或缺失如何改变所感知的颜色。
- 此工具是非破坏性的，仅生成预览。它不会为了无障碍目的而修改原始图片。
- 输出格式与输入格式一致。HEIC、RAW、PSD 和 SVG 输入在处理前会自动解码。
