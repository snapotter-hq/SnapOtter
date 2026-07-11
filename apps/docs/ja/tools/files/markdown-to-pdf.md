---
description: "Markdown ファイルをスタイル付きの PDF に変換します。"
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: e6d142ee6e12
---

# Markdown to PDF {#markdown-to-pdf}

Markdown ファイルをスタイル付きの PDF ドキュメントに変換します。プライバシー保護のため、リモートリソースは無効化されています。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

Markdown ファイルを含むマルチパートフォームデータを受け付けます。

## Parameters {#parameters}

このツールに設定可能なパラメータはありません。Markdown ファイルをアップロードすると PDF に変換されます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
```

## Example Response {#example-response}

`202 Accepted` を返します。進捗は `/api/v1/jobs/{jobId}/progress` の SSE で追跡できます。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 受け付ける入力形式: `.md`、`.markdown`。
- プライバシーとセキュリティ保護のため、リモートリソース (URL 経由で参照される画像やスタイルシート) は取得されません。
- Markdown はまず HTML にレンダリングされ、その後 WeasyPrint によって PDF に変換されます。
- コードブロック、テーブル、その他の Markdown 要素は PDF 出力でスタイル付けされます。
