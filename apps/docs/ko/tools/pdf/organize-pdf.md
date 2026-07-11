---
description: "명시적인 페이지 순서로 PDF의 페이지를 재정렬합니다."
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: 0452f122f360
---

# Organize PDF {#organize-pdf}

원하는 페이지 순서를 지정하여 PDF의 페이지를 재정렬합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

PDF 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| order | string | Yes | - | qpdf 문법의 원하는 페이지 순서, 예: `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
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

- 페이지 범위는 qpdf 문법을 사용합니다: `3,1,2`은(는) 처음 세 페이지를 재정렬하고, `5-z`은(는) 5페이지부터 마지막 페이지까지를 추가합니다.
- 페이지를 두 번 이상 나열하여 복제할 수 있습니다(예: `"1,1,2,3"`은(는) 1페이지를 복제합니다).
- 순서 문자열에 나열되지 않은 페이지는 출력에서 생략됩니다.
