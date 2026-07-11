---
description: "Markdown ファイルをスタンドアロンの HTML ページに変換します。"
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: 87daa2f75bab
---

# Markdown to HTML {#markdown-to-html}

Markdown ファイルをスタンドアロンの HTML ページに変換します。ソースで参照されているリモート画像は、出力内でそのまま残されます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

Markdown ファイルを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

このツールには設定可能なパラメータはありません。Markdown ファイルをアップロードすると HTML に変換されます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Notes {#notes}

- 受け付ける入力形式: `.md`、`.markdown`。
- これは結果を直接返す高速（同期）ツールです。
- 出力はインラインスタイルを含む自己完結型の HTML ページです。
- Markdown ソース内のリモート画像 URL はそのまま保持され、取得されません。
