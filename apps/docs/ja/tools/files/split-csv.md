---
description: "CSV を行数で分割して小さなファイルにします。"
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: 097ab6d5414b
---

# Split CSV {#split-csv}

大きな CSV または TSV ファイルを行数で小さなファイルに分割します。分割されたパートを含む ZIP アーカイブを返します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

CSV ファイルと JSON の `settings` フィールドを含むマルチパートフォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | No | `1000` | 出力ファイルごとのデータ行数 (1 ～ 1,000,000) |
| keepHeader | boolean | No | `true` | 各出力ファイルにヘッダー行を繰り返すかどうか |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Notes {#notes}

- 出力は常に、分割された CSV パートを含む ZIP アーカイブで、連番で命名されます (例: `part-1.csv`、`part-2.csv`)。
- `keepHeader` が `true` の場合、各パートに元のヘッダー行が含まれるため、各ファイルを個別に使用できます。
- 入力として CSV と TSV の両方のファイルを受け付けます。
- 行数はデータ行のみを指します。ヘッダー行はカウントされません。
