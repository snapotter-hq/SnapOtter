---
description: "개인정보 보호 및 GDPR 준수 익명화를 위해 AI 얼굴 감지로 이미지 속 얼굴을 자동 감지하고 흐리게 합니다."
i18n_source_hash: fb861c12aea5
i18n_provenance: human
i18n_output_hash: 8e812f7a6ae1
---

# Face / PII Blur {#face-pii-blur}

AI 기반 얼굴 감지(MediaPipe)를 사용하여 이미지 속 얼굴을 자동으로 감지하고 흐리게 합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**처리:** 비동기 (202를 반환하며, SSE를 통해 상태를 위해 `/api/v1/jobs/{jobId}/progress`을(를) 폴링)

**모델 번들:** `face-detection` (200-300 MB)

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| file | file | 예 | - | 이미지 파일 (multipart) |
| blurRadius | number | 아니요 | `30` | 감지된 얼굴에 적용되는 블러 반경 (1-100) |
| sensitivity | number | 아니요 | `0.5` | 얼굴 감지 민감도 (0-1). 값이 낮을수록 더 높은 신뢰도로 더 적은 얼굴을 감지 |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
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
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### 최종 결과 (SSE를 통해) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### 얼굴이 감지되지 않음 {#no-faces-detected}

얼굴이 발견되지 않으면 결과에 경고가 포함됩니다:

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## 참고 사항 {#notes}

- `face-detection` 모델 번들이 설치되어 있어야 합니다 (200-300 MB).
- 출력 형식은 입력 형식과 자동으로 일치합니다.
- `faces` 배열에는 감지된 각 얼굴의 경계 상자 좌표(x, y, width, height)가 포함됩니다.
- 부분적으로 가려진 얼굴을 포함하여 더 많은 얼굴을 감지하려면 `sensitivity`을(를) 높이세요(1.0에 가깝게).
- 자동 디코딩을 통해 HEIC/HEIF, RAW, TGA, PSD, EXR, HDR 입력 형식을 지원합니다.
