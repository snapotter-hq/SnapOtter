---
description: "複数のファイルを 1 つの ZIP アーカイブにまとめます。"
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: a465f59b0912
---

# Create ZIP {#create-zip}

任意の種類の複数ファイルを 1 つの ZIP アーカイブにまとめます。重複するファイル名は自動的に重複が解消されます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

2 つ以上のファイルを含む multipart フォームデータを受け付けます。settings フィールドは不要です。

## Parameters {#parameters}

このツールには設定可能なパラメータはありません。まとめる任意の種類のファイルを 2〜50 個アップロードします。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- 2〜50 個の入力ファイルが必要です。
- 任意のファイル形式を受け付けます。入力形式に制限はありません。
- 複数のファイルが同じ名前を共有する場合、数値のサフィックスを付けて自動的に重複が解消されます。
- 出力アーカイブは標準の ZIP 圧縮（deflate）を使用します。
