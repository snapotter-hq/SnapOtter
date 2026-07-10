---
description: "Markdown ファイルを Word ドキュメント（DOCX）に変換します。"
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: e2676e8a04df
---

# Markdown to Word {#markdown-to-word}

Markdown ファイルを Word ドキュメント（DOCX）に変換し、見出し、リスト、コードブロック、その他の書式を保持します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Markdown ファイルを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

このツールには設定可能なパラメータはありません。Markdown ファイルをアップロードすると DOCX に変換されます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Notes {#notes}

- 受け付ける入力形式: `.md`、`.markdown`。
- これは結果を直接返す高速（同期）ツールです。
- 見出し、太字、斜体、リンク、コードブロック、リストは Word のスタイルにマッピングされます。
- 変換はサーバー上の Pandoc によって処理されます。
