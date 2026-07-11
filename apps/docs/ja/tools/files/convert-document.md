---
description: "Word、OpenDocument、RTF、プレーンテキストの各形式間で変換します。"
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: 2826c28b6daa
---

# Convert Document {#convert-document}

LibreOffice を使用して、ドキュメントを Word（DOCX）、OpenDocument（ODT）、RTF、プレーンテキストの各形式間で変換します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

Word／ODT／RTF／TXT ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | 出力形式: `docx`、`odt`、`rtf`、`txt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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

- 受け付ける入力形式: `.docx`、`.doc`、`.odt`、`.rtf`、`.txt`。
- 変換はサーバー上でヘッドレスで動作する LibreOffice によって処理されます。
- 複雑な書式（マクロ、埋め込みオブジェクト）は形式間の変換で保持されないことがあります。
- 出力形式は入力形式と異なる必要があります。
