---
description: "生成带有自定义颜色和纠错级别的二维码。"
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: 84f7e9af1df8
---

# 二维码生成器 {#qr-code-generator}

从文本或 URL 生成二维码图片，可配置尺寸、纠错级别以及自定义的前景/背景颜色。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

接受 **JSON 请求体**（而非 multipart）。无需上传文件。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| text | string | 是 | - | 要编码进二维码的内容（1 到 2000 个字符） |
| size | number | 否 | `400` | 输出图片的宽度/高度（像素，100 到 10000） |
| errorCorrection | string | 否 | `"M"` | 纠错级别：`L`（7%）、`M`（15%）、`Q`（25%）、`H`（30%） |
| foreground | string | 否 | `"#000000"` | 二维码前景/模块颜色的十六进制值（`#RRGGBB`） |
| background | string | 否 | `"#FFFFFF"` | 二维码背景颜色的十六进制值（`#RRGGBB`） |
| logoDataUri | string | 否 | - | 作为 data URI 的 logo 图片（`data:image/png;base64,...` 或 `data:image/jpeg;base64,...`，最大 700 KB）。以二维码尺寸的 22% 居中放置。会强制将纠错级别设为 `H` |

### 纠错级别 {#error-correction-levels}

| 级别 | 恢复能力 | 使用场景 |
|-------|----------|----------|
| `L` | ~7% | 最大数据密度 |
| `M` | ~15% | 均衡（默认） |
| `Q` | ~25% | 适合印刷的二维码 |
| `H` | ~30% | 最适合叠加 logo 的二维码 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

带自定义颜色的品牌二维码：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## 说明 {#notes}

- 由于无需上传图片，该端点接受 JSON，而非 multipart 表单数据。
- 输出始终为 PNG 图片。
- 输出文件名始终为 `qrcode.png`。
- `originalSize` 始终为 0，因为该工具从零开始生成图片。
- 二维码周围会包含一个 2 模块宽的静默区（边距）。
- 文本最大长度为 2000 个字符。实际容量取决于纠错级别和字符编码。
- 较高的纠错级别可让二维码即使部分被遮挡也能扫描，但会降低数据容量。
- 提供 `logoDataUri` 时，纠错级别会自动强制设为 `H`（30%），以便即使 logo 遮挡了中心区域，二维码仍可扫描。
