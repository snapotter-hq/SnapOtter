---
description: "정렬, 간격, 테두리, 리사이즈 모드를 제어하며 이미지를 나란히, 세로로 쌓거나 격자로 결합합니다."
i18n_source_hash: 670c5cc944b1
i18n_provenance: human
i18n_output_hash: d0910de94ddb
---

# 이미지 결합 {#stitch-combine}

여러 이미지를 나란히, 세로로 쌓거나 격자로 배열해 결합합니다. 정렬, 간격, 테두리, 모서리 반경, 여러 리사이즈 모드를 지원합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| direction | string | No | `"horizontal"` | 레이아웃 방향: `horizontal`, `vertical`, `grid` |
| gridColumns | integer | No | 2 | 방향이 `grid`일 때의 열 개수 (2 ~ 100) |
| resizeMode | string | No | `"fit"` | 이미지 리사이즈 방식: `fit`, `original`, `stretch`, `crop` |
| alignment | string | No | `"center"` | 교차축 정렬: `start`, `center`, `end` |
| gap | number | No | 0 | 이미지 사이 간격(픽셀) (0 ~ 1000) |
| border | number | No | 0 | 외곽 테두리 너비(픽셀) (0 ~ 500) |
| cornerRadius | number | No | 0 | 최종 출력에 적용되는 모서리 반경 (0 ~ 500) |
| backgroundColor | string | No | `"#FFFFFF"` | 배경/테두리 색상(hex, 예: `#FF0000`) |
| format | string | No | `"png"` | 출력 형식: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | 출력 품질 (1 ~ 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Notes {#notes}

- 최소 2개의 이미지가 필요합니다. multipart 요청에 여러 이미지 파일을 업로드하세요.
- HEIC, RAW, PSD, SVG 입력 형식을 지원합니다(자동으로 디코딩됨).
- 리사이즈 모드:
  - `fit` - 결합 축을 따라 가장 작은 치수에 맞게 이미지를 스케일링합니다.
  - `original` - 원본 크기를 유지합니다(가장자리가 고르지 않을 수 있음).
  - `stretch` - 종횡비를 유지하지 않고 가장 작은 치수에 강제로 맞춥니다.
  - `crop` - 가장 작은 치수에 맞게 이미지를 커버-크롭합니다.
- `grid` 모드에서 셀은 모든 이미지의 중앙값 치수로 크기가 정해집니다.
- `cornerRadius`은 개별 이미지가 아닌 전체 최종 출력에 적용됩니다.
- 캔버스 크기는 메모리 고갈을 방지하기 위해 `MAX_CANVAS_PIXELS` 서버 구성으로 제한됩니다.
