---
description: "PDF のすべてのページにテキスト透かしを追加します。"
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: 66d33a80de5a
---

# Watermark PDF {#watermark-pdf}

位置、サイズ、不透明度、回転を設定できるテキスト透かしを PDF のすべてのページにスタンプします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

PDF ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | 透かしのテキスト（1〜200 文字） |
| position | string | No | `"c"` | ページ上の配置: `tl`、`tc`、`tr`、`l`、`c`、`r`、`bl`、`bc`、`br` |
| fontSize | integer | No | `48` | フォントサイズ（ポイント単位、6〜72） |
| opacity | number | No | `0.3` | 透かしの不透明度（0.05〜1） |
| rotation | number | No | `45` | 回転角度（度単位、-180〜180） |

### Position Values {#position-values}

- `tl` 左上、`tc` 中央上、`tr` 右上
- `l` 左中央、`c` 中央、`r` 右中央
- `bl` 左下、`bc` 中央下、`br` 右下

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- 透かしは各ページ上のテキストオーバーレイとしてレンダリングされます。
- 同じ透かしテキスト、位置、スタイルがすべてのページに一様に適用されます。
- コンテンツを隠さない控えめな透かしには、低い不透明度の値（0.1〜0.3）を使用してください。
