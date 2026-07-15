---
description: "EPUB を PDF、DOCX、HTML、または Markdown に変換します。"
i18n_source_hash: cb39f254ff2f
i18n_provenance: human
i18n_output_hash: daf3628358aa
---

# EPUB から変換 {#convert-epub}

EPUB 電子書籍を PDF、Word（DOCX）、HTML、または Markdown に変換します。書籍内のリモートリソースは取得されません。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

EPUB ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | 出力形式: `pdf`、`docx`、`html`、`md` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
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

- 受け付ける入力形式: `.epub`。
- EPUB に埋め込まれたリモートリソース（外部の画像、フォント）は、セキュリティのため取得されません。
- 変換後の出力における画像の忠実度は、EPUB の構造によって異なる場合があります。
- 変換はサーバー上の Pandoc によって処理されます。
