---
description: "PDF から特定のテキストを完全に削除します（検証済みの真の墨消し）。"
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: de420eb1a9da
---

# Redact PDF {#redact-pdf}

検証済みの真の墨消しを使って、指定したテキストの出現箇所を PDF から完全に削除します。墨消しされたテキストは黒い四角で覆われるだけでなく、ファイルから完全に削除されます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

PDF ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| terms | string[] | Yes | - | 墨消しするテキスト文字列（1〜50 個、各最大 200 文字） |
| caseSensitive | boolean | No | `false` | マッチングで大文字・小文字を区別するかどうか |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- 受け付ける入力形式: `.pdf`。
- これは結果を直接返す高速（同期）ツールです。
- これは真の墨消しを実行します。マッチしたテキストは視覚的に隠されるだけでなく、PDF コンテンツストリームから削除されます。
- レスポンスの `found` フィールドは、墨消しされた出現箇所の数を示します。
- 1 回のリクエストで最大 50 個の語句を墨消しできます。
