---
description: "빠른 웹 뷰잉(점진적 다운로드)을 위해 PDF를 선형화합니다."
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 75591ae85017
---

# Web-Optimize PDF {#web-optimize-pdf}

PDF를 선형화하여 전체 파일을 기다리지 않고도 웹 브라우저에서 점진적으로 다운로드하고 표시할 수 있게 합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

PDF 파일이 포함된 multipart form data를 받습니다. `settings` 필드는 필요하지 않습니다.

## Parameters {#parameters}

이 도구에는 설정 매개변수가 없습니다. PDF 파일을 직접 업로드하세요.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- 선형화는 PDF의 내부 구조를 재배치하여 전체 파일이 다운로드되기 전에 첫 페이지가 렌더링될 수 있게 합니다.
- 추가된 선형화 데이터로 인해 출력 파일이 입력보다 약간 커질 수 있습니다.
- 이미 선형화된 PDF도 문제없이 다시 선형화됩니다.
