---
description: "CSV と JSON を双方向に変換します。"
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: cf405d7e54d1
---

# CSV to JSON {#csv-to-json}

CSV と JSON 形式を双方向に変換します。CSV または TSV ファイルをアップロードするとオブジェクトの JSON 配列が得られ、JSON 配列をアップロードすると CSV ファイルが得られます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

CSV、TSV、または JSON ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | JSON 出力をインデント付きで整形して表示します |

## Example Request {#example-request}

CSV から JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON から CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## Notes {#notes}

- 変換方向は入力ファイルの拡張子から自動検出されます。`.csv` または `.tsv` は `.json` を生成し、`.json` は `.csv` を生成します。
- `pretty` パラメータは JSON 出力にのみ影響します。`false` に設定すると、出力はコンパクトな 1 行の JSON 文字列になります。
- JSON 入力は、一貫したキーを持つオブジェクトの配列である必要があります。各オブジェクトが 1 行になり、各キーが列ヘッダーになります。
- TSV（タブ区切り値）ファイルは CSV とともにサポートされます。
