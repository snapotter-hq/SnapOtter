---
description: "PDF를 Word 문서(DOCX)로 변환합니다."
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: ed86e083c9e3
---

# PDF to Word {#pdf-to-word}

텍스트 기반 PDF를 Word 문서(DOCX)로 변환합니다. 선택 가능한 텍스트가 있는 PDF에 가장 적합하며, 스캔된 페이지는 먼저 OCR이 필요합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

PDF 파일이 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

이 도구에는 구성 가능한 매개변수가 없습니다. PDF를 업로드하면 DOCX로 변환됩니다.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

`202 Accepted`을(를) 반환합니다. `/api/v1/jobs/{jobId}/progress`의 SSE로 진행 상황을 추적하세요.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 허용되는 입력 형식: `.pdf`.
- 텍스트 기반 PDF에서 가장 잘 작동합니다. 스캔되었거나 이미지만 있는 페이지는 빈 출력이나 최소한의 출력을 생성하므로, 먼저 [PDF OCR](./ocr-pdf)로 텍스트 레이어를 추가하세요.
- 변환은 서버에서 헤드리스로 실행되는 LibreOffice가 처리합니다.
- 복잡한 레이아웃(다중 열, 겹치는 요소)은 완벽하게 변환되지 않을 수 있습니다.
