---
description: "PDF의 모든 색상을 회색조로 변환합니다."
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: 725c4af2ac57
---

# Grayscale PDF {#grayscale-pdf}

PDF의 모든 색상을 회색조로 변환하여 문서의 흑백 버전을 생성합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

PDF 파일이 포함된 multipart form data를 받습니다. `settings` 필드는 필요하지 않습니다.

## Parameters {#parameters}

이 도구에는 설정 매개변수가 없습니다. PDF 파일을 직접 업로드하세요.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- 모든 색 공간(RGB, CMYK)이 회색조로 변환되며, 여기에는 내장된 이미지, 벡터 그래픽, 텍스트가 포함됩니다.
- 회색조 데이터는 픽셀당 더 적은 바이트를 필요로 하므로 출력 파일은 원본보다 작은 경우가 많습니다.
