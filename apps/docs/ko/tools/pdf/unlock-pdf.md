---
description: "PDF에서 비밀번호 보호를 제거합니다."
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: 715a972e920b
---

# Unlock PDF {#unlock-pdf}

올바른 비밀번호를 제공하여 암호화된 PDF에서 비밀번호 보호를 제거합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

PDF 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| password | string | Yes | - | PDF를 복호화할 비밀번호 (1-256자) |

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

- 올바른 비밀번호를 제공해야 하며, 잘못된 비밀번호는 400 오류를 반환합니다.
- 사용자 비밀번호 또는 소유자 비밀번호 중 어느 것이든 복호화에 사용할 수 있습니다.
- 비밀번호는 감사 로그에서 마스킹됩니다.
