---
description: "PDF からパスワード保護を解除します。"
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: 2432be5c41e9
---

# Unlock PDF {#unlock-pdf}

正しいパスワードを指定することで、暗号化された PDF からパスワード保護を解除します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

PDF ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| password | string | Yes | - | PDF を復号するためのパスワード（1〜256 文字） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- 正しいパスワードを指定する必要があります。誤ったパスワードは 400 エラーを返します。
- 復号にはユーザーパスワードとオーナーパスワードのどちらでも機能します。
- パスワードは監査ログから伏せられます。
