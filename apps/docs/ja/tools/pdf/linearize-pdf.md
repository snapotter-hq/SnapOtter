---
description: "高速な Web 表示（プログレッシブダウンロード）のために PDF をリニアライズします。"
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 8bffef670f80
---

# Web-Optimize PDF {#web-optimize-pdf}

PDF をリニアライズし、ファイル全体を待たずに Web ブラウザでプログレッシブにダウンロード・表示できるようにします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

PDF ファイルを含む multipart フォームデータを受け付けます。`settings` フィールドは不要です。

## Parameters {#parameters}

このツールに設定パラメータはありません。PDF ファイルをそのままアップロードしてください。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- リニアライズは PDF の内部構造を再配置し、ファイル全体のダウンロードが完了する前に最初のページをレンダリングできるようにします。
- リニアライズ用データが追加されるため、出力ファイルは入力よりわずかに大きくなる場合があります。
- すでにリニアライズ済みの PDF も問題なく再リニアライズされます。
