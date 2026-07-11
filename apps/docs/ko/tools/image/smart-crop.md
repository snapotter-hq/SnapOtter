---
description: "Sharp와 AI 얼굴 인식을 사용해 이미지를 지능적으로 구성하는 피사체, 얼굴, 엔트로피 인식 자르기입니다."
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: e879f88e0fda
---

# Smart Crop {#smart-crop}

피사체 인식, 얼굴 인식 또는 트림 기반 스마트 자르기입니다. Sharp의 attention/entropy 전략과 AI 얼굴 인식을 사용해 지능적으로 구도를 잡습니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**Processing:** 비동기 (202를 반환하며 SSE를 통해 상태를 확인하려면 `/api/v1/jobs/{jobId}/progress`을 폴링)

**Model bundle:** `face-detection` (200-300 MB) - `face` 모드에서만 필요

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 이미지 파일 (multipart) |
| mode | string | No | `"subject"` | 자르기 모드: `subject`, `face`, `trim`. (레거시 값 `attention`와 `content`은 `subject`와 `trim`에 매핑됨) |
| strategy | string | No | `"attention"` | 피사체 모드 전략: `attention` 또는 `entropy` |
| width | integer | No | - | 목표 너비(픽셀) |
| height | integer | No | - | 목표 높이(픽셀) |
| padding | integer | No | `0` | 피사체 주위 여백 백분율 (0-50) |
| facePreset | string | No | `"head-shoulders"` | 얼굴 구도 프리셋: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | No | `0.5` | 얼굴 인식 감도 (0-1) |
| threshold | integer | No | `30` | 배경 인식을 위한 트림 모드 임계값 (0-255) |
| padToSquare | boolean | No | `false` | 트림된 결과를 정사각형으로 패딩 |
| padColor | string | No | `"#ffffff"` | 패딩용 배경색 |
| targetSize | integer | No | - | 패딩된 출력의 목표 크기(픽셀) |
| quality | integer | No | - | 출력 품질 (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Modes {#modes}

### Subject Mode {#subject-mode}
Sharp의 attention 또는 entropy 전략을 사용해 시각적으로 가장 흥미로운 영역을 찾아 그 주위를 자릅니다.

### Face Mode {#face-mode}
AI로 얼굴을 인식한 다음 지정된 `facePreset`를 사용해 인식된 얼굴 주위로 구도를 잡습니다. 얼굴이 인식되지 않으면 피사체 모드(attention 전략)로 폴백합니다.

### Trim Mode {#trim-mode}
이미지에서 균일한 테두리/배경을 제거합니다. 선택적으로 지정된 배경색과 목표 크기로 결과를 정사각형으로 패딩합니다.

## Notes {#notes}

- 이 도구는 `executionHint: "long"`가 적용된 `createToolRoute` 팩토리를 사용하므로 SSE 진행 상황과 함께 202를 반환합니다.
- 얼굴 모드에는 `face-detection` 모델 번들(200-300 MB)이 필요합니다.
- 피사체 및 트림 모드는 AI 모델 번들 없이 작동합니다.
- `facePreset`는 인식된 얼굴을 자르기가 얼마나 타이트하게 담는지 결정합니다: `closeup`가 가장 타이트하고 `half-body`가 가장 넓습니다.
- 너비/높이가 지정되지 않으면 기본값은 1080x1080입니다.
