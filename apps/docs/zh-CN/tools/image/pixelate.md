---
description: "对整张图片或特定区域应用像素化效果。"
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: e7dd5030b7ec
---

# 像素化 {#pixelate}

对整张图片或特定矩形区域应用像素化效果。可用于遮挡敏感内容，例如人脸、车牌或个人信息。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

接受包含一个图片文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| blockSize | integer | 否 | `12` | 像素块大小（2-128）；值越大，像素化越粗糙 |
| region | object | 否 | - | 将像素化限制在一个矩形区域内（见下文） |

### 区域对象 {#region-object}

| 字段 | 类型 | 是否必填 | 说明 |
|-------|------|----------|-------------|
| left | integer | 是 | 左偏移量（像素，>= 0） |
| top | integer | 是 | 上偏移量（像素，>= 0） |
| width | integer | 是 | 区域宽度（像素，>= 1） |
| height | integer | 是 | 区域高度（像素，>= 1） |

## 请求示例 {#example-request}

像素化整张图片：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

像素化特定区域：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## 说明 {#notes}

- 当省略 `region` 时，整张图片都会被像素化。
- 区域坐标以相对于图片左上角的像素为单位。区域必须落在图片边界之内。
- 输出格式与输入格式一致。HEIC、RAW、PSD 和 SVG 输入会在处理前自动解码。
