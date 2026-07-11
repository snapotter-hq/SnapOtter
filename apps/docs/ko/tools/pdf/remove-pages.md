---
description: "PDF에서 특정 페이지를 삭제합니다."
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: 8b5ab6daa1a0
---

# Remove Pages {#remove-pages}

PDF에서 특정 페이지를 삭제하고 나머지 모든 페이지는 그대로 유지합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

PDF 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pages | string | Yes | - | qpdf 문법으로 제거할 페이지 범위, 예: `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- 문서의 모든 페이지를 제거할 수는 없습니다. 최소 한 페이지는 남아 있어야 합니다.
- 페이지 범위는 qpdf 문법을 사용합니다: 단일 페이지는 `3`, 범위는 `5-7`, 그리고 쉼표로 결합합니다(예: `1,3,5-7`).
