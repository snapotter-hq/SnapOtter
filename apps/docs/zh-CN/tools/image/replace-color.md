---
description: "将图片中的某个特定颜色替换为另一种颜色，或将其变为透明。"
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: e0faf0cb736f
---

# 替换与反转颜色 {#replace-invert-color}

将匹配某个源颜色的像素替换为目标颜色，或将其变为透明。使用 RGB 空间中的欧氏距离，并可配置容差，以在颜色边界处实现平滑过渡。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

接受包含一个图片文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| sourceColor | string | 否 | `"#FF0000"` | 要查找的十六进制颜色（格式：`#RRGGBB`） |
| targetColor | string | 否 | `"#00FF00"` | 要替换成的十六进制颜色（格式：`#RRGGBB`） |
| makeTransparent | boolean | 否 | `false` | 将匹配的像素变为透明，而不是替换为目标颜色 |
| tolerance | number | 否 | `30` | 颜色匹配容差（0 到 255）。值越高，匹配的相似颜色范围越广 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

将绿色背景变为透明：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## 说明 {#notes}

- 颜色匹配使用 RGB 空间中的欧氏距离，并按 `tolerance * sqrt(3)` 缩放。
- 替换混合与颜色距离成正比：越接近源颜色的像素会获得越多的目标颜色，从而形成平滑过渡。
- 当 `makeTransparent` 为 `true` 时，如果输入格式不支持 alpha 通道（例如 JPEG），输出会被强制为 PNG（或 WebP/AVIF）。
- 容差为 0 时仅匹配完全一致的源颜色。较高的值（50 以上）会匹配更广范围的相似色调。
- 输出格式与输入格式一致，除非需要透明度而输入格式不支持 alpha。
