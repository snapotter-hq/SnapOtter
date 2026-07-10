---
description: "PowerPoint と OpenDocument プレゼンテーション形式間で変換します。"
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: 042e80a39e0b
---

# Convert Presentation {#convert-presentation}

プレゼンテーションを PowerPoint（PPTX）と OpenDocument Presentation（ODP）形式間で変換します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

PowerPoint／ODP ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | 出力形式: `pptx`、`odp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
```

## Example Response {#example-response}

`202 Accepted` を返します。`/api/v1/jobs/{jobId}/progress` の SSE で進捗を追跡します。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 受け付ける入力形式: `.pptx`、`.ppt`、`.odp`。
- 変換はサーバー上でヘッドレスで動作する LibreOffice によって処理されます。
- アニメーションや切り替え効果は形式間で保持されないことがあります。
- 出力形式は入力形式と異なる必要があります。
