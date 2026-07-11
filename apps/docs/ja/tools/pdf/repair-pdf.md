---
description: "破損した PDF の修復を試みます。"
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: 53e16551ecdb
---

# Repair PDF {#repair-pdf}

内部構造を再構築することで、破損した PDF の修復を試みます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

PDF ファイルを含む multipart フォームデータを受け付けます。`settings` フィールドは不要です。

## Parameters {#parameters}

このツールに設定パラメータはありません。破損した PDF ファイルをそのままアップロードしてください。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- 不正な形式のファイルを通すため、入力時の構造検証はスキップされます。
- 修復はベストエフォートです。深刻に破損したファイルは完全には復元できない場合があります。
- 相互参照テーブルが再構築されるため、修復後の PDF はサイズが元とわずかに異なる場合があります。
