---
description: "균일한 여백으로 PDF의 모든 페이지를 자릅니다."
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: 2360cf702fff
---

# Crop PDF {#crop-pdf}

균일한 여백을 적용하여 각 가장자리에서 콘텐츠를 동일하게 잘라내는 방식으로 PDF의 모든 페이지를 자릅니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

PDF 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| margin | number | No | `20` | 균일한 자르기 여백(포인트 단위, 0-2000) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- 여백 값은 PDF 포인트 단위입니다(1포인트 = 1/72인치).
- 동일한 여백이 모든 페이지의 네 가장자리 전부에 적용됩니다.
- `0` 여백은 기존의 모든 자르기 여백을 제거하여 전체 media box를 표시합니다.
