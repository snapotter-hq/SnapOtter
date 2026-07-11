---
description: "JSON と XML を双方向に変換します。"
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: 356a33468b17
---

# JSON to XML {#json-to-xml}

JSON と XML 形式を双方向に変換します。JSON ファイルをアップロードすると XML が得られ、XML ファイルをアップロードすると JSON が得られます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

JSON または XML ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | 出力をインデント付きで整形して表示します |

## Example Request {#example-request}

JSON から XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML から JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Notes {#notes}

- 変換方向は入力ファイルの拡張子から自動検出されます。`.json` は `.xml` を生成し、`.xml` は `.json` を生成します。
- `pretty` パラメータは両方向に適用されます。`false` の場合、出力はインデントなしのコンパクトな形式になります。
- XML の属性やネストされた構造は、可能な限り往復変換で保持されます。
