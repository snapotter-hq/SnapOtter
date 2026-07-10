---
description: "여러 PDF를 하나의 문서로 결합합니다."
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: 78944ca5af9e
---

# Merge PDFs {#merge-pdfs}

두 개 이상의 PDF 파일을 하나의 문서로 결합하며, 각 입력 파일의 페이지 순서를 보존합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

두 개 이상의 PDF 파일이 포함된 multipart form data를 받습니다. `settings` 필드는 필요하지 않습니다.

## Parameters {#parameters}

이 도구에는 설정 매개변수가 없습니다. 두 개 이상의 PDF 파일을 업로드하기만 하면 됩니다.

| Constraint | Value |
|------------|-------|
| 최소 파일 수 | 2 |
| 최대 파일 수 | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- 파일은 업로드된 순서대로 병합됩니다.
- 최소 두 개의 PDF 파일이 필요하며, 그보다 적게 제공하면 요청이 400 오류로 실패합니다.
- 입력 파일의 최대 개수는 20개입니다.
- 암호화된 PDF는 병합하기 전에 잠금을 해제해야 합니다.
