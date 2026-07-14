---
description: "내장된 Tesseract 또는 선택적인 고정밀 RapidOCR 런타임을 사용하여 이미지에서 로컬로 텍스트를 추출합니다."
i18n_output_hash: 8320ed5125e7
i18n_source_hash: 01c6fa6aebe7
i18n_provenance: human
---

# OCR / Text Extraction {#ocr-text-extraction}

이미지를 외부 서비스로 보내지 않고 이미지에서 텍스트를 추출합니다. 기본 제공 `fast` 계층은 Tesseract 를 사용합니다. 선택적 `balanced` 및 `best` 계층은 고정된 PP-OCR ONNX 모델과 함께 RapidOCR 를 사용합니다.


<!-- korean-ocr-contract:start -->
::: info 한국어 OCR 호환성
빠른 OCR은 `auto`, `en`, `de`, `es`, `fr`, `zh`, `ja`를 지원하지만 한국어(`ko`)는 지원하지 않습니다. 한국어에는 정확한 OCR 팩과 `balanced` 또는 `best`가 필요합니다. 이 팩은 공식 Linux amd64 및 arm64 컨테이너에서 작동하며 NVIDIA 호스트에서도 OCR은 CPU에서 실행됩니다. 지원되지 않는 시스템은 명시적인 호환성 오류를 반환하며 조용히 `fast`로 대체하지 않습니다. 한국어에 `fast` 또는 이전 `tesseract` 별칭을 지정하면 큐에 넣기 전에 `FEATURE_INCOMPATIBLE` 및 `fast-korean-unsupported`로 거부됩니다.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**처리 중:** 반품 `200` ~와 함께 JSON 언제 OCR 동기 창 내에서 완료됩니다. 더 긴 일자리 반환 `202`; 직업을 따르다 SSE 터미널 이벤트로의 진행 스트림, `result`에는 동일한 OCR 필드가 포함되어 있습니다.

**정확한 OCR 팩:** 선택적 `ocr` 런타임(대상에 따라 약 208-234 MiB 다운로드 및 409-488 MiB 설치). `fast`에는 이 팩이 필요하지 않습니다. 설치 프로그램은 서명된 인덱스에 의해 제한되는 정확한 크기를 확인합니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | 예 | - | 이미지 파일(멀티파트), 최대 512 MiB 인코딩 및 40 메가픽셀 디코딩; 더 낮은 운영자 업로드 제한이 여전히 적용됩니다. |
| quality | string | 아니요 | 동적 | 품질 등급: `fast`(Tesseract), `balanced`(소형 PP-OCRv6 모델이 포함된 RapidOCR) 또는 `best`(보정된 변형 스코어링이 포함된 정확도가 높은 중간 PP-OCRv6 모델) |
| language | string | No | `"auto"` | 언어 힌트: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | 아니요 | 계층에 따라 다름 | 인식 전 로컬 대비를 향상시킵니다. 빠르게 직접 적용합니다. 균형 및 최상은 보정된 점수로 결과가 향상되는 경우에만 변형을 유지합니다. `best`의 경우 기본값은 `true`이고 `fast`/`balanced`의 경우 `false`입니다. |
| engine | string | 아니요 | - | 더 이상 사용되지 않는 호환성 별칭입니다. 대신 `quality`를 사용하세요. `tesseract`는 `fast`에 매핑됩니다. 레거시 `paddleocr` 값은 `balanced`에 매핑되지만 PaddlePaddle 를 로드하지 않습니다. |

`quality`와 `engine`을 생략하면 SnapOtter는 `best`, `balanced`, `fast` 순으로 사용 가능한 최상위 등급을 선택합니다. 한국어에서는 `fast`를 선택하지 않으며 `best`, 그다음 `balanced`를 사용하고, 둘 다 없으면 정확한 런타임의 설치 또는 호환성 오류를 반환합니다.

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
  "engine": "rapidocr-onnx",
  "requestedQuality": "best",
  "actualQuality": "best",
  "device": "cpu",
  "provider": "CPUExecutionProvider",
  "degraded": false,
  "warnings": [],
  "runtimeVersion": "2.1.0",
  "modelVersion": "PP-OCRv6-best-v1-medium"
}
```

### Progress (SSE, optional) {#progress-sse-optional}

`clientJobId` 양식 필드가 제공되면 진행 이벤트가 스트리밍됩니다. `202` 응답은 클라이언트가 터미널 `complete` 또는 `failed` 이벤트가 발생할 때까지 스트림을 열어 두어야 함을 의미합니다.

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Notes {#notes}

- 지원되는 SnapOtter 이미지에서는 `fast`를 항상 사용할 수 있습니다. `balanced`와 `best`에는 선택 사항인 고정확도 OCR 팩이 필요합니다.
- 내장 Tesseract는 공식 이미지에 약 25 MiB를 추가합니다. 고정확도 팩은 이미지에 포함되지 않고 `/data/ai`에 저장됩니다.
- 고정확도 팩은 공식 Linux amd64 및 arm64 컨테이너용으로 배포됩니다. NVIDIA 호스트에서도 ONNX Runtime의 CPU 공급자를 사용하므로 CUDA 라이브러리나 GPU 호환성에 의존하지 않습니다. 소스 및 사전 빌드된 bare-metal 설치에서는 자체 호환 런타임을 제공하지 않는 한 Fast OCR를 사용합니다.
- OCR은 이미지 다운로드 URL이 아니라 추출된 텍스트를 직접 반환합니다.
- SnapOtter 는 명시적으로 요청된 계층을 존중합니다. `balanced` 또는 `best`를 사용할 수 없는 경우 API 는 `FEATURE_NOT_INSTALLED` 또는 `FEATURE_INCOMPATIBLE`와 함께 `501`를 반환합니다. 요청을 다른 계층으로 자동으로 다운그레이드하지 않습니다.
- 성공적인 빈 결과는 빈 결과로 유지됩니다. 런타임 실패는 낮은 품질의 엔진으로 다시 시도하는 대신 오류를 반환합니다.
- 응답은 `requestedQuality` 및 `actualQuality`와 엔진, 장치, 공급자, 런타임 및 모델 버전과 모든 경고를 보고합니다.
- HEIC/HEIF, RAW, TGA, PSD, EXR, HDR 입력 형식을 자동 디코딩으로 지원합니다.
- 대형 인코딩 입력은 `413`를 반환합니다. 40 메가픽셀이 넘는 이미지와 제한된 출력 제한을 초과하는 OCR 응답은 부분적으로 처리되는 대신 거부됩니다.
