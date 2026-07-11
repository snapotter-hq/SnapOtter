---
description: "조절 가능한 강도, 색상, 위치로 비네트 효과를 추가합니다."
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: 670117aa7e1d
---

# Vignette {#vignette}

이미지 가장자리를 어둡게 하거나 색조를 입히는 비네트 효과를 추가합니다. 조절 가능한 강도, 색상, 반경, 부드러움, 둥글기, 중심 위치를 지원합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vignette`

이미지 파일과 JSON `settings` 필드를 담은 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strength | number | No | `0.5` | 비네트 불투명도 (0.1-1) |
| color | string | No | `"#000000"` | 비네트 hex 색상 |
| radius | integer | No | `70` | 반대각선 절반에 대한 백분율 외곽 반경 (0-100) |
| softness | integer | No | `50` | 페더 부드러움 (0-100); 값이 높을수록 더 점진적인 페이드가 생성됨 |
| roundness | integer | No | `100` | 형태: 100 = 원, 0 = 이미지 종횡비에 맞는 타원 |
| centerX | integer | No | `50` | 수평 중심 위치 백분율 (0-100) |
| centerY | integer | No | `50` | 수직 중심 위치 백분율 (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Notes {#notes}

- `radius`이 작을수록 이미지가 더 많이 어두워지고, 반경이 클수록 비네트가 극단적인 가장자리로 국한됩니다.
- 창의적인 비네트 효과를 위해 검정이 아닌 `color`(예: 흰색이나 세피아 톤)을 사용하세요.
- `centerX`와 `centerY`를 조절하면 선명한 영역을 중심에서 벗어나게 배치할 수 있어, 프레임 중앙에 있지 않은 피사체에 시선을 끌어들이는 데 유용합니다.
- 출력 형식은 입력 형식과 일치합니다. HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
