---
description: "使用纯色、透明或模糊背景将图像填充到目标宽高比。"
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: 63814b238de5
---

# 图像填充 {#image-pad}

通过在图像周围添加纯色、透明或模糊背景，将其填充到目标宽高比。适用于在不裁剪的情况下，将图像适配到社交媒体或印刷所需的固定宽高比。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

接受包含一个图像文件的 multipart 表单数据，以及一个 JSON `settings` 字段。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| target | string | 否 | `"1:1"` | 目标宽高比：`16:9`、`9:16`、`1:1`、`4:3`、`3:4` 或 `custom` |
| ratioW | integer | 否 | `1` | 自定义比例宽度（1-100，当 target 为 `custom` 时使用） |
| ratioH | integer | 否 | `1` | 自定义比例高度（1-100，当 target 为 `custom` 时使用） |
| background | string | 否 | `"color"` | 背景模式：`color`、`transparent` 或 `blur` |
| color | string | 否 | `"#ffffff"` | 背景十六进制颜色（当 background 为 `color` 时） |
| padding | integer | 否 | `0` | 额外内边距，占画布的百分比（0-50） |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## 说明 {#notes}

- `blur` 背景模式会创建原始图像的模糊副本作为填充，产生视觉上协调的效果。
- 使用 `transparent` 背景时，输出会转换为 PNG 以保留 alpha 通道。
- 除非涉及透明度，输出格式与输入格式一致。HEIC、RAW、PSD 和 SVG 输入会在处理前被自动解码。
- 将 `target` 设为 `custom` 并提供 `ratioW` 和 `ratioH` 即可使用任意宽高比（例如 `ratioW: 3, ratioH: 2` 对应 3:2）。
