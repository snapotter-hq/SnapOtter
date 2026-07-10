---
description: "AES-256 암호화로 PDF에 비밀번호 보호를 추가합니다."
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 8cc839d9b3ee
---

# Protect PDF {#protect-pdf}

AES-256 암호화를 사용하여 PDF에 비밀번호 보호를 추가합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

PDF 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| userPassword | string | Yes | - | PDF를 열 때 필요한 비밀번호 (1-256자) |
| ownerPassword | string | No | `userPassword`과(와) 동일 | 권한을 위한 소유자 비밀번호 (1-256자) |

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

- 암호화는 AES-256을 사용합니다.
- `ownerPassword`을(를) 생략하면 `userPassword`과(와) 동일한 값으로 기본 설정됩니다.
- 비밀번호는 감사 로그에서 마스킹됩니다.
- 암호화된 PDF를 열려면 사용자 비밀번호가 필요하며, 전체 권한을 위해서는 소유자 비밀번호(다를 경우)가 필요합니다.
