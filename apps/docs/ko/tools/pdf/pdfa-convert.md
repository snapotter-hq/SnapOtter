---
description: "장기 보존을 위해 PDF를 아카이브용 PDF/A-2 형식으로 변환합니다."
i18n_source_hash: 4c6bf7a12e84
i18n_provenance: human
i18n_output_hash: 09cd8068f7f5
---

# PDF/A Convert {#pdf-a-convert}

PDF를 PDF/A-2 아카이브 형식으로 변환하며, 이는 장기 보존과 규정 준수에 적합합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

PDF 파일이 포함된 multipart form data를 받습니다. `settings` 필드는 필요하지 않습니다.

## Parameters {#parameters}

이 도구에는 설정 매개변수가 없습니다. PDF 파일을 직접 업로드하세요.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes {#notes}

- 출력은 PDF/A-2 표준을 준수합니다.
- PDF/A는 모든 글꼴을 내장하고 외부 참조를 금지하므로, 출력 파일이 원본보다 클 수 있습니다.
- 암호화와 JavaScript는 PDF/A 표준에서 허용되지 않으므로 변환 과정에서 제거됩니다.
