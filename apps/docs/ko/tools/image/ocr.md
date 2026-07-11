---
description: "AI 기반 광학 문자 인식으로 이미지에서 텍스트를 추출합니다."
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: 44612e44c198
---

# OCR / Text Extraction {#ocr-text-extraction}

AI 기반 광학 문자 인식으로 이미지에서 텍스트를 추출합니다. 여러 언어와 품질 등급을 지원합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Processing:** 동기식 JSON 응답. `clientJobId`가 제공되면 진행 상황이 SSE를 통해서도 보고됩니다.

**Model bundle:** `ocr` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 이미지 파일(multipart) |
| quality | string | No | `"balanced"` | 품질 등급: `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | No | `"auto"` | 언어 힌트: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | No | `true` | 더 나은 OCR 정확도를 위해 이미지를 사전 처리 |
| engine | string | No | - | 더 이상 사용되지 않음. 대신 `quality`를 사용하세요. `tesseract`를 `fast`로, `paddleocr`를 `balanced`로 매핑합니다 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### Progress (SSE, optional) {#progress-sse-optional}

`clientJobId` 폼 필드가 제공되면 진행 이벤트가 스트리밍됩니다:

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notes {#notes}

- `ocr` 모델 번들이 설치되어 있어야 합니다(5-6 GB).
- OCR은 이미지 다운로드 URL이 아니라 추출된 텍스트를 직접 반환합니다.
- 폴백 체인을 사용합니다. 더 높은 품질 등급이 충돌하면(예: PaddleOCR segfault) 자동으로 다음 하위 등급으로 재시도합니다.
- 등급이 충돌 없이 빈 텍스트를 반환하는 경우에도 다음 등급으로 폴백합니다.
- 품질 등급은 엔진에 매핑됩니다: `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- HEIC/HEIF, RAW, TGA, PSD, EXR, HDR 입력 형식을 자동 디코딩으로 지원합니다.
