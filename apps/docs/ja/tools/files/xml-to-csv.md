---
description: "XML から繰り返し要素を抽出して CSV テーブルにします。"
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: a0112376720f
---

# XML to CSV {#xml-to-csv}

XML ファイルから繰り返し要素を抽出してフラットな CSV テーブルにします。このツールは XML ツリー内で最初のオブジェクト配列を自動的に見つけ、各要素を 1 行にマッピングします。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

XML ファイルを含むマルチパートフォームデータを受け付けます。設定フィールドは不要です。

## Parameters {#parameters}

このツールに設定可能なパラメータはありません。繰り返し要素は XML 構造から自動検出されます。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Notes {#notes}

- 入力として `.xml` ファイルのみを受け付けます。
- このツールは XML ツリーをスキャンして、最初に繰り返される兄弟要素のセットを見つけ、それらを行として使用します。
- 一意の各子要素名または属性名が CSV の列ヘッダーになります。
- これは一方向の変換です。双方向の JSON/XML 変換には [JSON to XML](/ja/tools/files/json-xml) ツールを使用してください。
