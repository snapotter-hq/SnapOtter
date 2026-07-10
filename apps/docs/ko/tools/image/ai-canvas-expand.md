---
description: "AI 아웃페인팅으로 이미지 캔버스를 확장하여 어느 방향으로든 늘리고 새 영역을 원본과 어울리게 채웁니다."
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: ef9af902ccbc
---

# AI Canvas Expand {#ai-canvas-expand}

AI 기반 채우기(아웃페인팅)로 이미지 캔버스를 확장합니다. 이미지를 어느 방향으로든 늘리고 기존 이미지와 어울리는 AI 생성 콘텐츠로 새 영역을 채웁니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**처리:** 비동기 (202를 반환하며, SSE를 통해 상태를 위해 `/api/v1/jobs/{jobId}/progress`을(를) 폴링)

**모델 번들:** `object-eraser-colorize` (1-2 GB)

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| file | file | 예 | - | 이미지 파일 (multipart) |
| extendTop | integer | 아니요 | `0` | 위쪽으로 확장할 픽셀 수 |
| extendRight | integer | 아니요 | `0` | 오른쪽으로 확장할 픽셀 수 |
| extendBottom | integer | 아니요 | `0` | 아래쪽으로 확장할 픽셀 수 |
| extendLeft | integer | 아니요 | `0` | 왼쪽으로 확장할 픽셀 수 |
| tier | string | 아니요 | `"balanced"` | 품질 등급: `fast`, `balanced`, `high` |
| format | string | 아니요 | `"auto"` | 출력 형식: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | 아니요 | `95` | 출력 품질 (1-100) |

확장 방향 중 하나 이상이 0보다 커야 합니다.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
```

## 응답 {#response}

### 초기 응답 (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### 진행 상황 (`/api/v1/jobs/{jobId}/progress`의 SSE) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### 최종 결과 (SSE를 통해) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## 참고 사항 {#notes}

- `object-eraser-colorize` 모델 번들이 설치되어 있어야 합니다 (1-2 GB).
- LaMa 기반 아웃페인팅을 사용하여 확장된 영역의 콘텐츠를 생성합니다.
- `tier` 매개변수는 속도와 품질을 절충합니다. `fast`은(는) 잠재적 아티팩트와 함께 빠르게 결과를 생성하고, `high`은(는) 더 오래 걸리지만 더 매끄럽고 일관된 채우기를 생성합니다.
- 확장 값은 픽셀 단위입니다. 최종 이미지 크기는 다음과 같습니다: 원본 너비 + extendLeft + extendRight, 원본 높이 + extendTop + extendBottom.
- 브라우저에서 미리 볼 수 없는 출력 형식(HEIC, JXL, TIFF)의 경우, 메인 출력과 함께 WebP 미리보기가 생성됩니다.
- 자동 디코딩을 통해 HEIC/HEIF, RAW, TGA, PSD, EXR, HDR 입력 형식을 지원합니다.
