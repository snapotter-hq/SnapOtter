---
description: "DDColor AI 모델로 흑백 또는 회색조 사진을 자동으로 컬러화합니다."
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: 53ad783cbfe3
---

# AI 컬러화 {#ai-colorization}

AI(OpenCV DNN 대체 기능이 있는 DDColor 모델)를 사용하여 흑백 또는 회색조 사진을 완전한 컬러로 변환합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**처리 방식:** 비동기(202를 반환하고 SSE를 통해 상태를 확인하려면 `/api/v1/jobs/{jobId}/progress`을(를) 폴링)

**모델 번들:** `object-eraser-colorize` (1~2 GB)

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| file | file | 예 | - | 이미지 파일(multipart) |
| intensity | number | 아니요 | `1.0` | 색상 강도(0~1). 값이 낮을수록 더 은은한 컬러화가 됩니다 |
| model | string | 아니요 | `"auto"` | 사용할 모델: `auto`, `ddcolor`, `opencv` |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
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
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### 최종 결과 (SSE를 통해) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## 참고 사항 {#notes}

- `object-eraser-colorize` 모델 번들이 설치되어 있어야 합니다(1~2 GB).
- DDColor는 더 높은 품질의 결과를 생성하지만 속도가 느리고, OpenCV DNN은 더 빠르지만 품질이 약간 낮습니다. `auto`은(는) 가능한 경우 DDColor를 사용하고 OpenCV로 대체합니다.
- `intensity` 매개변수는 원본 회색조와 AI 컬러화 결과 사이를 혼합합니다. 완전한 컬러를 원하면 1.0을, 부분적으로 탈채도된 빈티지 느낌을 원하면 더 낮은 값을 사용하세요.
- 출력 형식은 입력 형식과 자동으로 일치합니다.
- 브라우저에서 미리 볼 수 없는 출력 형식의 경우, 주 출력과 함께 WebP 미리 보기가 생성됩니다.
- HEIC/HEIF, RAW, TGA, PSD, EXR, HDR 입력 형식을 자동 디코딩으로 지원합니다.
