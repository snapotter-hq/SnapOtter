---
description: "지울 영역을 나타내는 마스크로 안내되는 AI 인페인팅(LaMa)으로 이미지에서 원치 않는 물체를 제거합니다."
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: 6231f77b4f78
---

# 물체 지우개 {#object-eraser}

AI 인페인팅(LaMa 모델)을 사용하여 이미지에서 원치 않는 물체를 제거합니다. 이미지와 지울 영역을 나타내는 마스크를 받습니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**처리 방식:** 비동기(202를 반환하고 SSE를 통해 상태를 확인하려면 `/api/v1/jobs/{jobId}/progress`을(를) 폴링)

**모델 번들:** `object-eraser-colorize` (1~2 GB)

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| file | file | 예 | - | 원본 이미지 파일(multipart) |
| mask | file | 예 | - | 마스크 이미지(흰색 = 지울 영역, 검은색 = 유지). 필드 이름 `mask`(으)로 업로드해야 함 |
| format | string | 아니요 | `"auto"` | 출력 형식: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | 아니요 | `95` | 출력 품질(1~100) |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### 최종 결과 (SSE를 통해) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## 참고 사항 {#notes}

- `object-eraser-colorize` 모델 번들이 설치되어 있어야 합니다(1~2 GB).
- 마스크는 원본 이미지와 동일한 치수여야 합니다. 흰색 픽셀은 지울 영역을 나타내며, AI가 그럴듯한 콘텐츠로 채웁니다.
- 고품질 물체 제거를 위해 LaMa(Large Mask Inpainting)를 사용합니다.
- 브라우저에서 미리 볼 수 없는 출력 형식의 경우, 주 출력과 함께 WebP 미리 보기가 생성됩니다.
- HEIC/HEIF, RAW, TGA, PSD, EXR, HDR 입력 형식을 자동 디코딩으로 지원합니다.
