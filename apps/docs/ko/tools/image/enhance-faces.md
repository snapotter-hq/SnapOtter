---
description: "GFPGAN 및 CodeFormer AI 모델로 이미지에서 흐리거나 저품질인 얼굴을 복원하고 선명하게 합니다."
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: 04fb3590b879
---

# 얼굴 향상 {#face-enhancement}

AI 모델(GFPGAN/CodeFormer)을 사용하여 이미지의 얼굴을 복원하고 향상합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**처리 방식:** 비동기(202를 반환하고 SSE를 통해 상태를 확인하려면 `/api/v1/jobs/{jobId}/progress`을(를) 폴링)

**모델 번들:** `upscale-enhance` (5~6 GB) 및 `face-detection` (200~300 MB)

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| file | file | 예 | - | 이미지 파일(multipart) |
| model | string | 아니요 | `"auto"` | 사용할 모델: `auto`, `gfpgan`, `codeformer` |
| strength | number | 아니요 | `0.8` | 향상 강도(0~1). 값이 높을수록 더 강한 향상 |
| onlyCenterFace | boolean | 아니요 | `false` | 가장 중앙에 있는/두드러진 얼굴만 향상 |
| sensitivity | number | 아니요 | `0.5` | 얼굴 감지 민감도(0~1) |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
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
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### 최종 결과 (SSE를 통해) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## 참고 사항 {#notes}

- `upscale-enhance` 모델 번들(5~6 GB)과 `face-detection` 모델 번들(200~300 MB)이 모두 필요합니다.
- GFPGAN은 더 공격적인 향상을 생성하고, CodeFormer는 정체성을 더 잘 보존합니다. `auto`은(는) 입력에 가장 적합한 모델을 선택합니다.
- 출력은 최대 품질을 위해 항상 PNG 형식입니다.
- 더 빠른 프런트엔드 표시를 위해 전체 해상도 출력과 함께 WebP 미리 보기가 생성됩니다.
- `strength` 매개변수는 향상된 얼굴을 원본과 혼합합니다. 은은한 개선을 원하면 낮은 값(0.3~0.5)을, 더 강한 복원을 원하면 높은 값(0.7~1.0)을 사용하세요.
- HEIC/HEIF, RAW, TGA, PSD, EXR, HDR 입력 형식을 자동 디코딩으로 지원합니다.
