---
description: "AES-256 暗号化によるパスワード保護を PDF に追加します。"
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: a8f0cb674661
---

# Protect PDF {#protect-pdf}

AES-256 暗号化を使って PDF にパスワード保護を追加します。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

PDF ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| userPassword | string | Yes | - | PDF を開くのに必要なパスワード（1〜256 文字） |
| ownerPassword | string | No | `userPassword` と同じ | 権限用のオーナーパスワード（1〜256 文字） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- 暗号化には AES-256 を使用します。
- `ownerPassword` を省略した場合、`userPassword` と同じ値がデフォルトになります。
- パスワードは監査ログから伏せられます。
- 暗号化された PDF は、開くのにユーザーパスワードが、（異なる場合は）完全な権限にオーナーパスワードが必要です。
