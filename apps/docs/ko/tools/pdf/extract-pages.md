---
description: "PDF에서 선택한 페이지를 뽑아 새 문서로 만듭니다."
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: ea4fa2d78331
---

# Extract Pages {#extract-pages}

PDF에서 선택한 페이지를 뽑아 더 작은 새 문서로 만듭니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

PDF 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| range | string | Yes | - | qpdf 문법의 페이지 범위, 예: `"1-5,8,10-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes {#notes}

- 페이지 범위는 qpdf 문법을 사용합니다: 1페이지부터 5페이지까지는 `1-5`, 마지막 페이지는 `z`, 그리고 쉼표로 범위를 결합합니다(예: `1-3,7,10-z`).
- 추출된 페이지는 원본 서식, 주석, 링크를 그대로 유지합니다.
