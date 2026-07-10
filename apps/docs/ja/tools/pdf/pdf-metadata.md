---
description: "PDF ドキュメントのメタデータを読み書きします。"
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: bf803fc8eb1c
---

# PDF Metadata {#pdf-metadata}

タイトル、作成者、サブジェクト、キーワードなどの PDF ドキュメントのメタデータフィールドを読み取り・更新します。設定が指定されない場合、既存のメタデータが変更されずに返されます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

PDF ファイルと、任意の JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | ドキュメントのタイトル（最大 500 文字） |
| author | string | No | - | ドキュメントの作成者（最大 500 文字） |
| subject | string | No | - | ドキュメントのサブジェクト（最大 500 文字） |
| keywords | string | No | - | ドキュメントのキーワード（最大 500 文字） |

すべてのパラメータは任意です。省略したフィールドは変更されません。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- 受け付ける入力形式: `.pdf`。
- これは結果を直接返す高速（同期）ツールです。
- レスポンスの `metadata` フィールドには、更新後の結果メタデータが含まれます。
- メタデータを変更せずに読み取るには、`settings` フィールドを省略するか空のオブジェクトを送信してください。
- 各メタデータフィールドは 500 文字までに制限されています。
