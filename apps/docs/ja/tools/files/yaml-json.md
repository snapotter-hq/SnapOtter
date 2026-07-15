---
description: "YAML と JSON を双方向で変換します。"
i18n_source_hash: ef0c9b633797
i18n_provenance: human
i18n_output_hash: e39453464e79
---

# YAML / JSON 変換 {#yaml-json}

YAML と JSON 形式を双方向で変換します。YAML ファイルをアップロードすると JSON が得られ、JSON ファイルをアップロードすると YAML が得られます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

YAML または JSON ファイルを含むマルチパートフォームデータを受け付けます。設定フィールドは不要です。

## Parameters {#parameters}

このツールに設定可能なパラメータはありません。変換方向は入力ファイルの拡張子によって決定されます。

## Example Request {#example-request}

YAML から JSON へ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON から YAML へ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Notes {#notes}

- 変換方向は入力ファイルの拡張子から自動検出されます。`.yaml` または `.yml` は `.json` を生成し、`.json` は `.yaml` を生成します。
- `.yaml` と `.yml` の両方の拡張子を受け付けます。
- 複数ドキュメントの YAML ファイルでは最初のドキュメントのみが変換されます。`---` で区切られた追加のドキュメントは無視されます。
