---
description: "通过指定位置和尺寸的区域裁剪图片。"
i18n_source_hash: aab38ccd7c53
i18n_provenance: human
i18n_output_hash: 6d45b3b09301
---

# 裁剪 {#crop}

通过位置和尺寸定义一个矩形区域来裁剪图片。支持像素和百分比两种单位。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/crop`

接受 multipart 表单数据，包含一个图片文件和一个 JSON `settings` 字段。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| left | number | 是 | - | 裁剪区域的 X 偏移（从左边缘起） |
| top | number | 是 | - | 裁剪区域的 Y 偏移（从上边缘起） |
| width | number | 是 | - | 裁剪区域的宽度 |
| height | number | 是 | - | 裁剪区域的高度 |
| unit | string | 否 | `"px"` | 这些值的单位：`px` 或 `percent` |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

使用百分比值裁剪：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## 注意事项 {#notes}

- 裁剪区域必须位于图片边界之内。如果区域超出图片范围，请求将失败。
- 使用 `percent` 单位时，这些值表示图片尺寸的百分比（例如 `left: 10` 表示从左边缘起 10%）。
- 输出格式与输入格式一致。
- 裁剪前会自动应用 EXIF 方向，因此坐标对应于视觉上正确的方向。
