---
description: "按任意角度旋转图片，并进行水平或垂直翻转。"
i18n_source_hash: c4ed5f7e270b
i18n_provenance: human
i18n_output_hash: dcbaa2a45cbf
---

# 旋转和翻转图片 {#rotate-flip}

按任意角度旋转图片，和/或对其进行水平或垂直翻转。旋转和翻转操作可以在单次请求中组合使用。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/rotate`

接受包含一个图片文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| angle | number | 否 | `0` | 旋转角度（度，顺时针）。接受任意数值。 |
| horizontal | boolean | 否 | `false` | 水平翻转图片（镜像） |
| vertical | boolean | 否 | `false` | 垂直翻转图片 |

## 请求示例 {#example-request}

顺时针旋转 90 度：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

水平翻转：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

同时旋转和翻转：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## 说明 {#notes}

- 先应用旋转，再应用翻转操作。
- 非 90 度的旋转（例如 45 度）会扩大画布以容纳旋转后的图片，并根据输出格式使用透明或黑色填充。
- 常用值：90、180、270 用于四分之一圈旋转。
- 处理前会自动应用 EXIF 方向，因此旋转是相对于视觉方向的。
