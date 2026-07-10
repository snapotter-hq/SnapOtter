---
description: "一致する列を持つ複数の CSV または TSV ファイルを 1 つに結合します。"
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: fdaf2335d43a
---

# Merge CSVs {#merge-csvs}

一致する列を持つ複数の CSV または TSV ファイルを 1 つの結合ファイルにまとめます。すべての入力ファイルは同じ列ヘッダーを持っている必要があります。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

2 つ以上の CSV ファイルを含むマルチパートフォームデータを受け付けます。設定フィールドは不要です。

## Parameters {#parameters}

このツールに設定可能なパラメータはありません。一致する列ヘッダーを持つ 2 ～ 20 個の CSV または TSV ファイルをアップロードしてください。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Notes {#notes}

- 2 個以上 20 個以下の入力ファイルが必要です。
- すべてのファイルは同じ列ヘッダーを共有している必要があります。列が一致しない場合、結合は失敗します。
- ヘッダー行は出力に 1 回だけ含まれ、すべてのファイルのデータ行がアップロード順に連結されます。
- CSV と TSV の両方のファイルを受け付けますが、1 回のリクエスト内のすべてのファイルは同じ区切り文字を使用する必要があります。
