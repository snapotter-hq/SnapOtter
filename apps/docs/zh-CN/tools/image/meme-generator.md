---
description: "使用模板或自定义图片、带样式的文本框以及字体选项创建表情包。"
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: 8f47b4401894
---

# 表情包生成器 {#meme-generator}

使用内置模板或自定义图片创建表情包。添加带有经典表情包样式（粗体、描边文字）的文本、多种布局预设以及字体选择。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

接受以下任一形式：
- **Multipart 表单数据**，包含一个图片文件和一个 JSON `settings` 字段（自定义图片模式）
- **JSON 请求体**，包含一个 `templateId`（模板模式，无需上传文件）

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| templateId | string | 否 | - | 内置表情包模板 ID。若提供此项，则无需上传图片 |
| textLayout | string | 否 | `"top-bottom"` | 文本框布局：`top-bottom`、`top-only`、`bottom-only`、`center`、`side-by-side` |
| textBoxes | array | 否 | `[]` | 文本框对象数组，包含 `id` 和 `text` 字段 |
| fontFamily | string | 否 | `"anton"` | 字体：`anton`、`arial-black`、`comic-sans`、`montserrat`、`bebas-neue`、`permanent-marker`、`roboto` |
| fontSize | number | 否 | auto | 字号（像素，8 到 200）。若省略则自动计算 |
| textColor | string | 否 | `"#ffffff"` | 文字填充颜色 |
| strokeColor | string | 否 | `"#000000"` | 文字描边/轮廓颜色 |
| textAlign | string | 否 | `"center"` | 文字对齐方式：`left`、`center`、`right` |
| allCaps | boolean | 否 | `true` | 将文字转换为大写 |

### 文本框 {#text-boxes}

`textBoxes` 数组中的每个条目应包含：

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| id | string | 与布局匹配的文本框标识符（例如 `"top"`、`"bottom"`、`"left"`、`"right"`、`"center"`） |
| text | string | 要显示的表情包文字 |

### 文本布局的文本框 ID {#text-layout-box-ids}

| 布局 | 可用的文本框 ID |
|--------|-------------------|
| `top-bottom` | `top`、`bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`、`right` |

## 请求示例 {#example-request}

带有顶部和底部文字的自定义图片：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

使用内置模板（JSON 请求体，无需上传文件）：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## 说明 {#notes}

- 必须提供 `templateId` 或上传一个图片文件。若两者都提供，则使用模板。
- 模板会定义自己的文本框位置；使用模板时会忽略 `textLayout` 参数。
- 文字以带描边轮廓的 SVG 形式渲染，以实现经典的表情包外观。
- 若未显式设置字号，则会自动计算以适应文本框。
- 空文本框会被跳过（如果所有文本框都为空，则不进行任何渲染）。
- 使用模板时，输出文件名会包含模板 ID（例如 `meme-drake.png`）。
- HEIC、RAW、PSD 和 SVG 输入会在处理前自动解码。
