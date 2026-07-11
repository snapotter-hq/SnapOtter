---
description: "PDF에서 일반 텍스트를 추출합니다."
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: dc89125fead0
---

# PDF to Text {#pdf-to-text}

PDF 문서에서 읽을 수 있는 모든 일반 텍스트를 추출하여 텍스트 파일로 만듭니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

PDF 파일이 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

이 도구에는 구성 가능한 매개변수가 없습니다. PDF를 업로드하면 텍스트 콘텐츠가 추출됩니다.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes {#notes}

- 허용되는 입력 형식: `.pdf`.
- 이 도구는 결과를 직접 반환하는 빠른(동기) 도구입니다.
- 응답의 `chars` 필드는 추출된 문자 수를 나타냅니다.
- 디지털로 내장된 텍스트만 추출됩니다. 스캔된 문서나 이미지 기반 PDF의 경우 [PDF OCR](./ocr-pdf) 도구를 대신 사용하세요.
