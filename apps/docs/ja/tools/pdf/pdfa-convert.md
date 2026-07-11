---
description: "長期保存のために PDF をアーカイブ用 PDF/A-2 形式に変換します。"
i18n_source_hash: 4c6bf7a12e84
i18n_provenance: human
i18n_output_hash: 706a11edc6f1
---

# PDF/A Convert {#pdf-a-convert}

PDF を PDF/A-2 アーカイブ形式に変換します。長期保存や規制対応に適しています。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

PDF ファイルを含む multipart フォームデータを受け付けます。`settings` フィールドは不要です。

## Parameters {#parameters}

このツールに設定パラメータはありません。PDF ファイルをそのままアップロードしてください。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes {#notes}

- 出力は PDF/A-2 標準に準拠します。
- PDF/A はすべてのフォントを埋め込み、外部参照を禁止するため、出力ファイルは元より大きくなる場合があります。
- 暗号化と JavaScript は PDF/A 標準で許可されていないため、変換時に取り除かれます。
