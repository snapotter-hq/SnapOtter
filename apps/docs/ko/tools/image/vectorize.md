---
description: "흑백(potrace) 및 풀컬러 다중 레이어 벡터화로 래스터 이미지를 SVG로 변환합니다."
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: f7908a58b9bc
---

# Image to SVG {#image-to-svg}

트레이싱 알고리즘을 사용해 래스터 이미지를 SVG로 벡터화합니다. 흑백 트레이싱(potrace)과 풀컬러 다중 레이어 벡터화를 지원합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| colorMode | string | No | `"bw"` | 트레이싱 모드: `bw`(흑백) 또는 `color`(다중 색상 레이어) |
| threshold | number | No | 128 | 흑백 모드의 밝기 임계값 (0 ~ 255). 이 값 아래의 픽셀은 검정이 됩니다. |
| colorPrecision | number | No | 6 | 컬러 모드의 색상 양자화 정밀도 (1 ~ 16). 값이 높을수록 더 뚜렷한 색상 레이어가 생성됩니다. |
| layerDifference | number | No | 6 | 컬러 모드에서 레이어 간 최소 색상 차이 (1 ~ 128) |
| filterSpeckle | number | No | 4 | 트레이싱된 도형의 최소 면적(픽셀) (1 ~ 256). 노이즈/얼룩을 제거합니다. |
| pathMode | string | No | `"spline"` | 경로 스무딩: `none`(들쭉날쭉), `polygon`(직선 세그먼트), `spline`(부드러운 곡선) |
| cornerThreshold | number | No | 60 | 컬러 모드의 모서리 감지 각도 임계값 (0 ~ 180도) |
| invert | boolean | No | `false` | 트레이싱 전에 이미지 반전(흑백 교환) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Color Vectorization {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Notes {#notes}

- 입력 형식에 관계없이 출력은 항상 SVG 파일입니다.
- HEIC, RAW, PSD, SVG 입력 형식을 지원합니다(트레이싱 전에 자동으로 래스터로 디코딩됨).
- 흑백 모드는 potrace 알고리즘을 사용합니다. 이미지는 먼저 그레이스케일로 변환된 다음 트레이싱 전에 순수 흑백으로 임계값 처리됩니다.
- 컬러 모드는 다중 레이어 접근 방식을 사용합니다: 이미지가 색상 레이어로 양자화되고, 각 레이어가 개별적으로 트레이싱되어 SVG 출력에 쌓입니다.
- `filterSpeckle` 값이 낮을수록 더 많은 디테일을 보존하지만 경로가 더 많은 큰 SVG 파일이 생성됩니다.
- `pathMode` 설정은 파일 크기에 큰 영향을 미칩니다: `none`는 가장 많은 경로를, `spline`는 가장 부드러운(그리고 대개 가장 작은) 출력을 생성합니다.
- 로고와 아이콘에 최적의 결과를 얻으려면 깨끗한 고대비 입력으로 흑백 모드를 사용하세요. 사진이나 일러스트레이션에는 더 높은 `colorPrecision`와 함께 컬러 모드를 사용하세요.
