---
description: "내장된 Tesseract 또는 선택적인 고정밀 RapidOCR 런타임을 사용하여 스캔한 PDF에서 로컬로 텍스트를 추출합니다."
i18n_output_hash: 9cb7a87663a9
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# PDF OCR {#pdf-ocr}

스캔한 내용에서 텍스트 추출 PDF 문서를 보내지 않고 페이지별로 PDF 외부 서비스에. 내장 `fast` 계층 용도 Tesseract. 선택 사항 `balanced` 그리고 `best` 계층 사용 RapidOCR 고정된 PP-OCR ONNX 모델.


<!-- korean-ocr-contract:start -->
::: info 한국어 OCR 호환성
빠른 OCR은 `auto`, `en`, `de`, `es`, `fr`, `zh`, `ja`를 지원하지만 한국어(`ko`)는 지원하지 않습니다. 한국어에는 정확한 OCR 팩과 `balanced` 또는 `best`가 필요합니다. 이 팩은 공식 Linux amd64 및 arm64 컨테이너에서 작동하며 NVIDIA 호스트에서도 OCR은 CPU에서 실행됩니다. 지원되지 않는 시스템은 명시적인 호환성 오류를 반환하며 조용히 `fast`로 대체하지 않습니다. 한국어에 `fast` 또는 이전 `tesseract` 별칭을 지정하면 큐에 넣기 전에 `FEATURE_INCOMPATIBLE` 및 `fast-korean-unsupported`로 거부됩니다.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

PDF 파일과 선택적 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | 예 | - | PDF 파일(다중 부분), 최대 512 MiB 인코딩; 더 낮은 운영자 업로드 제한이 여전히 적용됩니다. |
| quality | string | 아니요 | 동적 | OCR 품질 등급: `fast`, `balanced` 또는 `best` |
| language | string | No | `"auto"` | 문서 언어: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | 페이지 선택, 예: `"all"`, `"1-3"`, `"1,3,5"` |
| enhance | boolean | 아니요 | 계층에 따라 다름 | 인식 전 로컬 대비를 향상시킵니다. 빠르게 직접 적용합니다. 균형 및 최상은 보정된 점수로 결과가 향상되는 경우에만 변형을 유지합니다. `best`의 경우 기본값은 `true`이고 `fast`/`balanced`의 경우 `false`입니다. |
| engine | string | 아니요 | - | 더 이상 사용되지 않는 호환성 별칭입니다. 대신 `quality`를 사용하세요. `tesseract`는 `fast`에 매핑됩니다. 레거시 `paddleocr` 값은 `balanced`에 매핑되지만 PaddlePaddle 를 로드하지 않습니다. |

`quality`와 `engine`을 생략하면 SnapOtter는 `best`, `balanced`, `fast` 순으로 사용 가능한 최상위 등급을 선택합니다. 한국어에서는 `fast`를 선택하지 않으며 `best`, 그다음 `balanced`를 사용하고, 둘 다 없으면 정확한 런타임의 설치 또는 호환성 오류를 반환합니다.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
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
- `fast`가 내장되어 있으며 공식 이미지에 약 25개의 MiB 를 추가합니다. `balanced` 및 `best`에는 선택 사항인 정확한 OCR 팩(대상에 따라 약 208-234 MiB 다운로드 및 409-488 MiB 설치)이 필요합니다.
- 정확한 팩은 Linux amd64 및 arm64 를 지원하고 NVIDIA 호스트를 포함하여 CPU 에서 ONNX Runtime 를 사용합니다.
- 명시적으로 요청된 계층은 자동으로 다운그레이드되지 않습니다. `balanced` 또는 `best`를 사용할 수 없는 경우 API 는 `FEATURE_NOT_INSTALLED` 또는 `FEATURE_INCOMPATIBLE`와 함께 `501`를 반환합니다.
- PDF 페이지는 이전에 고해상도로 래스터화됩니다. OCR. `best` 더 높은 정확도의 매체를 실행합니다. PP-OCRv6 모델 및 점수 방향 및 향상 변형, 속도를 희생하면서 인식을 향상시킵니다.
- `auto` 언어 설정을 사용하면 지원되는 스크립트 세트 전체에서 인식이 가능합니다. 명시적인 힌트는 알려진 문서 언어에 대한 결과를 향상시킬 수 있습니다.
- 범위(`"1-3"`), 쉼표로 구분된 목록(`"1,3,5"`), 또는 모든 페이지를 뜻하는 `"all"`을(를) 사용하여 특정 페이지를 지정할 수 있습니다.
- 요청은 최대 50페이지까지 처리할 수 있습니다. 래스터화된 스크래치 데이터는 512 MiB 로 제한되고 총 UTF-8 OCR 응답은 1,000,000바이트로 제한됩니다. 부분 텍스트를 반환하지 않고 제한 초과 작업이 실패합니다.
- 이미 선택 가능한 텍스트가 포함된 PDF의 경우, 더 빠른 [PDF to Text](./pdf-to-text) 도구를 대신 사용하는 것을 고려하세요.
