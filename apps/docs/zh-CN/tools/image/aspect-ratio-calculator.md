---
description: "计算保持宽高比所缺的宽度或高度，并化简比例。"
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: bd85f4dcd495
i18n_hash_version: 2
---

# 宽高比计算器 {#aspect-ratio-calculator}

输入原始宽度和高度，再输入新的宽度或新的高度，即可得到另一边的值，使比例保持不变。比例会以最简形式返回，因此 1920 × 1080 即 16:9。在网页应用中，你可以从常用比例（16:9、4:3、3:2、1:1、21:9、9:16、4:5）开始，并在横向和纵向之间切换。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

接受 JSON 请求体而非 multipart 表单数据，返回的是数字而不是可下载的文件。

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `width` | number | （必填） | 原始宽度。 |
| `height` | number | （必填） | 原始高度。 |
| `newWidth` | number | - | 目标宽度。响应据此求解 `newHeight`。 |
| `newHeight` | number | - | 目标高度。响应据此求解 `newWidth`。 |
| `round` | boolean | `true` | 将求得的边取整。当 `false` 时，保留两位小数。 |

每个尺寸都必须介于 `0.0001` 和 `1000000` 之间。请发送 `newWidth` 或 `newHeight`，不要同时发送。两者都省略时，只返回化简后的比例。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## Example Response {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

当请求两者都未发送时，`newWidth` 和 `newHeight` 为 `null`。

## Notes {#notes}

- 小数尺寸会按最多四位小数化为整数比例，因此 `8.5` × `11` 返回为 `17:22`。
- `ratioDecimal` 是宽度除以高度，四舍五入到四位小数。
- 求得的边不会返回 `0`。开启取整时至少为 `1`，关闭取整时至少为 `0.01`。
- 同时发送 `newWidth` 和 `newHeight`，或发送超出允许范围的尺寸，会返回 400。
- 计算器不会读取或写入任何文件。要应用这些数值，请使用[调整图片尺寸](/zh-CN/tools/image/resize)或[裁剪图片](/zh-CN/tools/image/crop)。
