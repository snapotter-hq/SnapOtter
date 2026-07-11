---
description: "이미지를 분석하여 노출, 대비, 화이트 밸런스, 채도, 선명도를 보정하는 원클릭 자동 향상 기능입니다."
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: c08c1c6cd167
---

# 이미지 향상 {#image-enhancement}

스마트 분석을 통한 원클릭 자동 개선. 이미지를 분석하고 노출, 대비, 화이트 밸런스, 채도, 선명도, 노이즈 제거 보정을 적용합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**처리:** 동기(`createToolRoute` 팩토리 사용, 결과를 직접 반환)

**모델 번들:** 기본 향상에는 필요 없음. `upscale-enhance` 번들(5-6 GB)은 `deepEnhance`이 활성화된 경우에만(SCUNet을 통한 AI 노이즈 제거용) 사용됩니다.

## 파라미터 {#parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| file | file | 예 | - | 이미지 파일(multipart) |
| mode | string | 아니오 | `"auto"` | 향상 모드: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | 아니오 | `50` | 전체 향상 강도(0-100) |
| corrections | object | 아니오 | 모두 `true` | 적용할 선택적 보정(아래 참조) |
| deepEnhance | boolean | 아니오 | `false` | AI 기반 노이즈 제거 활성화(`noise-removal` 도구 설치 필요) |

### Corrections 객체 {#corrections-object}

| 필드 | 타입 | 기본값 | 설명 |
|-------|------|---------|-------------|
| exposure | boolean | `true` | 노출 자동 보정 |
| contrast | boolean | `true` | 대비 자동 보정 |
| whiteBalance | boolean | `true` | 화이트 밸런스 자동 보정 |
| saturation | boolean | `true` | 채도 자동 보정 |
| sharpness | boolean | `true` | 자동 선명화 |
| denoise | boolean | `true` | 가벼운 노이즈 제거 |

## 예제 요청 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## 응답(200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## 분석 엔드포인트 {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

이미지를 분석하여 보정을 적용하지 않고 보정 권장 사항을 반환합니다.

### 파라미터 {#parameters-1}

| 파라미터 | 타입 | 필수 | 설명 |
|-----------|------|----------|-------------|
| file | file | 예 | 이미지 파일(multipart) |

### 예제 요청 {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### 응답(200 OK) {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## 참고 {#notes}

- 이 도구는 동기 `createToolRoute` 팩토리를 사용하므로 표준 응답을 반환합니다(202 비동기 아님).
- `mode` 파라미터는 보정에 가중치를 부여하는 방식을 조정합니다(예: 인물 모드는 피부 톤에 더 부드럽게, 풍경 모드는 채도를 높임).
- `deepEnhance`이 활성화되고 `noise-removal` 도구(SCUNet)가 설치된 경우, 표준 보정 이후에 추가 AI 노이즈 제거 단계가 적용됩니다.
- 분석 엔드포인트는 커밋 전에 어떤 보정이 적용될지 미리 보는 데 유용합니다.
- 자동 디코딩을 통해 HEIC/HEIF, RAW, TGA, PSD, EXR, HDR 입력 형식을 지원합니다.
