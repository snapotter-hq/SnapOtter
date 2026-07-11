---
description: "복원, 얼굴 향상, 색상 처리를 위한 AI 파이프라인으로 오래된 사진의 스크래치, 찢김, 손상을 복구합니다."
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: 8e501fe1c3d2
---

# Photo Restoration {#photo-restoration}

다단계 AI 파이프라인을 사용해 오래된 사진의 스크래치, 찢김, 손상을 복구합니다. 스크래치 복구, 얼굴 향상, 노이즈 제거, 선택적 색상 처리를 결합합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**Processing:** 비동기(202를 반환하며, SSE를 통해 `/api/v1/jobs/{jobId}/progress`에서 상태를 폴링)

**Model bundle:** `photo-restoration` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | 이미지 파일(multipart) |
| scratchRemoval | boolean | No | `true` | 스크래치와 표면 손상 제거 |
| faceEnhancement | boolean | No | `true` | 복원된 사진의 얼굴 향상 |
| fidelity | number | No | `0.7` | 얼굴 향상 충실도(0~1). 값이 높을수록 원본 특징을 더 많이 보존합니다 |
| denoise | boolean | No | `true` | 복원된 결과에 노이즈 제거 적용 |
| denoiseStrength | number | No | `25` | 노이즈 제거 강도(0~100) |
| colorize | boolean | No | `false` | 복원된 사진 색상화(그레이스케일 이미지용) |
| colorizeStrength | number | No | `85` | 색상화 강도(0~100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
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
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Notes {#notes}

- `photo-restoration` 모델 번들이 설치되어 있어야 합니다(4-5 GB).
- 파이프라인은 여러 AI 단계를 순차적으로 실행합니다: 스크래치 복구, 얼굴 향상(GFPGAN), 노이즈 제거, 그리고 선택적으로 색상화.
- 결과의 `steps` 배열은 실제로 실행된 처리 단계를 보여줍니다.
- `scratchCoverage`는 스크래치 손상이 있던 이미지 영역의 추정 백분율입니다.
- `fidelity`는 원래 모습을 보존하는 것 대비 얼굴을 얼마나 강하게 향상시킬지 제어합니다. 값이 낮을수록 더 적극적인 향상이, 값이 높을수록 더 보수적인 결과가 나옵니다.
- `colorize` 옵션은 이미지가 그레이스케일인지 자동으로 감지합니다. 결과의 `isGrayscale` 플래그가 이 감지를 확인합니다.
- 출력 형식은 자동으로 입력 형식과 일치합니다.
- HEIC/HEIF, RAW, TGA, PSD, EXR, HDR, AVIF 입력 형식을 자동 디코딩으로 지원합니다.
