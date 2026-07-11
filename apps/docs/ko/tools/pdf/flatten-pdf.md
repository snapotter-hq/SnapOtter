---
description: "양식과 주석을 페이지 콘텐츠에 굽습니다."
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: f063390c8496
---

# Flatten PDF {#flatten-pdf}

대화형 양식 필드와 주석을 페이지 콘텐츠에 구워 넣어, 어디서나 동일하게 보이는 정적 PDF를 생성합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

PDF 파일이 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

이 도구에는 구성 가능한 매개변수가 없습니다. PDF를 업로드하면 모든 양식과 주석이 평탄화됩니다.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notes {#notes}

- 허용되는 입력 형식: `.pdf`.
- 이 도구는 결과를 직접 반환하는 빠른(동기) 도구입니다.
- 양식 필드 값은 출력에서 정적 텍스트로 보존됩니다.
- 주석(댓글, 강조 표시, 스티커 메모)은 페이지 콘텐츠의 일부가 되어 더 이상 편집할 수 없습니다.
