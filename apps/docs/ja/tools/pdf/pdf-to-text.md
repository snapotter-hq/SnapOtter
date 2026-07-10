---
description: "PDF からプレーンテキストを抽出します。"
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: 2609ae7e9372
---

# PDF to Text {#pdf-to-text}

PDF ドキュメントから読み取り可能なプレーンテキストをすべて抽出してテキストファイルにします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

PDF ファイルを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

このツールに設定可能なパラメータはありません。PDF をアップロードすると、そのテキストコンテンツが抽出されます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes {#notes}

- 受け付ける入力形式: `.pdf`。
- これは結果を直接返す高速（同期）ツールです。
- レスポンスの `chars` フィールドは、抽出された文字数を示します。
- 抽出されるのはデジタルに埋め込まれたテキストのみです。スキャンされたドキュメントや画像ベースの PDF には、代わりに [PDF OCR](./ocr-pdf) ツールを使用してください。
