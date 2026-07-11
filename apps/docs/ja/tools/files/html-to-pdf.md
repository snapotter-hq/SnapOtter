---
description: "HTML ファイルを PDF に変換します。"
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: 73feebb7571f
---

# HTML to PDF {#html-to-pdf}

HTML ファイルをスタイル付きの PDF ドキュメントに変換します。リモートリソース（外部の画像、スタイルシート、スクリプト）はプライバシーのため無効化されています。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

HTML ファイルを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

このツールには設定可能なパラメータはありません。HTML ファイルをアップロードすると PDF に変換されます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
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

- 受け付ける入力形式: `.html`、`.htm`。
- リモートリソース（URL で参照される画像、スタイルシート、スクリプト）は、プライバシーとセキュリティのため取得されません。
- インラインスタイルと埋め込み画像（data URI）は保持されます。
- 変換はサーバー上の WeasyPrint によって処理されます。
