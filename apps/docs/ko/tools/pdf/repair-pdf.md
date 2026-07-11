---
description: "손상되거나 깨진 PDF의 복구를 시도합니다."
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: 2217c6d5bf5a
---

# Repair PDF {#repair-pdf}

내부 구조를 재구성하여 손상되거나 깨진 PDF의 복구를 시도합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

PDF 파일이 포함된 multipart form data를 받습니다. `settings` 필드는 필요하지 않습니다.

## Parameters {#parameters}

이 도구에는 설정 매개변수가 없습니다. 손상된 PDF 파일을 직접 업로드하세요.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- 잘못된 형식의 파일을 통과시키기 위해 입력 시 구조 검증을 건너뜁니다.
- 복구는 최선 노력 방식입니다. 심하게 손상된 파일은 완전히 복구되지 않을 수 있습니다.
- 재구성된 상호 참조 테이블로 인해 복구된 PDF의 크기가 원본과 약간 다를 수 있습니다.
