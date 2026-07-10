---
description: "AI 기반 OCR을 사용하여 PDF 문서에서 텍스트를 추출합니다."
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: 2ada53399131
---

# PDF OCR {#pdf-ocr}

AI 기반 광학 문자 인식을 사용하여 PDF 문서에서 텍스트를 추출합니다. 여러 품질 등급과 언어를 지원합니다. OCR 기능 번들이 설치되어 있어야 합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

PDF 파일과 선택적 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | OCR 품질 등급: `fast`, `balanced`, `best` |
| language | string | No | `"auto"` | 문서 언어: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | 페이지 선택, 예: `"all"`, `"1-3"`, `"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
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
- 이 도구는 **OCR 기능 번들**이 설치되어 있어야 하는 AI 도구입니다. 번들이 설치되어 있지 않으면 API가 `501 Not Implemented`을(를) 반환합니다.
- `fast` 품질 등급은 더 가벼운 모델을 사용하여 빠르게 처리하고, `best`은(는) 속도를 희생하는 대신 더 정확한 모델을 사용합니다.
- `auto` 언어 설정은 문서 언어를 자동으로 감지하려고 시도합니다.
- 범위(`"1-3"`), 쉼표로 구분된 목록(`"1,3,5"`), 또는 모든 페이지를 뜻하는 `"all"`을(를) 사용하여 특정 페이지를 지정할 수 있습니다.
- 이미 선택 가능한 텍스트가 포함된 PDF의 경우, 더 빠른 [PDF to Text](./pdf-to-text) 도구를 대신 사용하는 것을 고려하세요.
