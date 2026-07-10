---
description: "PDF의 페이지를 90, 180, 또는 270도 회전합니다."
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: 965c1f42a400
---

# Rotate PDF {#rotate-pdf}

지정한 각도로 PDF의 전체 또는 선택한 페이지를 회전합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

PDF 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | integer | No | `90` | 회전 각도: `90`, `180`, 또는 `270` |
| range | string | No | `"1-z"` | qpdf 문법의 페이지 범위, 예: `"1-5,8"` (`"1-z"` = 모든 페이지) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- 회전은 시계 방향입니다.
- 페이지 범위는 qpdf 문법을 사용합니다: 1페이지부터 5페이지까지는 `1-5`, 마지막 페이지는 `z`, 그리고 쉼표로 범위를 결합합니다.
- 기본 범위 `"1-z"`은(는) 모든 페이지를 회전합니다.
