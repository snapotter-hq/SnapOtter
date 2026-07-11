---
description: "소책자로 접을 수 있도록 PDF 페이지를 배열합니다."
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: 27ce846398cb
---

# Booklet PDF {#booklet-pdf}

인쇄된 용지를 접어 소책자로 만들 수 있도록 양면 인쇄용으로 페이지를 배치합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

PDF 파일과 JSON `settings` 필드를 담은 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | 용지당 페이지 수: `2`, `4`, `6`, 또는 `8` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- 기본값 `perSheet: 2`는 각 용지에 두 페이지를 나란히 배치하며, 이는 양면 인쇄를 위한 표준 소책자 레이아웃입니다.
- 총 페이지 수가 용지 크기의 배수가 아니면 빈 페이지가 자동으로 추가됩니다.
- 출력을 단변 제본으로 양면 인쇄한 다음 접고 스테이플러로 고정하세요.
