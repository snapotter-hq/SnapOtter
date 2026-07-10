---
description: "複数の PDF を 1 つのドキュメントに結合します。"
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: de798f2aafbe
---

# Merge PDFs {#merge-pdfs}

2 つ以上の PDF ファイルを 1 つのドキュメントに結合し、各入力ファイルのページ順を保持します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

2 つ以上の PDF ファイルを含む multipart フォームデータを受け付けます。`settings` フィールドは不要です。

## Parameters {#parameters}

このツールに設定パラメータはありません。2 つ以上の PDF ファイルをアップロードするだけです。

| Constraint | Value |
|------------|-------|
| 最小ファイル数 | 2 |
| 最大ファイル数 | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- ファイルはアップロードされた順に結合されます。
- PDF ファイルは最低 2 つ必要です。それより少ない場合、リクエストは 400 エラーで失敗します。
- 入力ファイルの最大数は 20 です。
- 暗号化された PDF は結合前にロックを解除する必要があります。
