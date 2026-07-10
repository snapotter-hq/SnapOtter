---
description: "한 장에 여러 PDF 페이지를 배열합니다(2-up, 4-up 등)."
i18n_source_hash: 9dd82737cb72
i18n_provenance: human
i18n_output_hash: e2bb8d16e545
---

# N-up PDF {#n-up-pdf}

2-up 또는 4-up 레이아웃처럼 한 장에 여러 페이지를 배열하여 인쇄 시 종이를 절약합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

PDF 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | 장당 페이지 수: `2`, `3`, `4`, `8`, `9`, `12` 또는 `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- 페이지는 읽기 순서(왼쪽에서 오른쪽, 위에서 아래)로 배열됩니다.
- 출력 페이지 크기는 원본과 동일하며, 개별 페이지가 그리드에 맞게 축소됩니다.
- `perSheet: 4`로 설정한 20페이지 문서는 5페이지 출력을 생성합니다.
