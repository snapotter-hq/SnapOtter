---
description: "적응형, 언샤프 마스크 또는 하이패스 방식으로 이미지를 선명하게 하며, 선택적 노이즈 감소를 지원합니다."
i18n_source_hash: ccb60af9faae
i18n_provenance: human
i18n_output_hash: 8f49728a6c6f
---

# Sharpening {#sharpening}

세 가지 방식을 제공하는 고급 선명화 도구입니다: 적응형(스마트 에지 인식), 언샤프 마스크(고전적인 반경/강도), 하이패스(질감 강조). 선명화 아티팩트를 방지하기 위한 내장 노이즈 감소 기능을 포함합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

이미지 파일과 JSON `settings` 필드를 담은 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| method | string | No | `"adaptive"` | 선명화 알고리즘: `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | No | `1.0` | 적응형: Gaussian 시그마 (0.5 ~ 10) |
| m1 | number | No | `1.0` | 적응형: 평탄 영역 선명화 (0 ~ 10) |
| m2 | number | No | `3.0` | 적응형: 들쭉날쭉한 영역 선명화 (0 ~ 20) |
| x1 | number | No | `2.0` | 적응형: 평탄/들쭉날쭉 임계값 (0 ~ 10) |
| y2 | number | No | `12` | 적응형: 최대 평탄 선명화 (0 ~ 50) |
| y3 | number | No | `20` | 적응형: 최대 들쭉날쭉 선명화 (0 ~ 50) |
| amount | number | No | `100` | 언샤프 마스크: 선명화 강도 (0 ~ 1000) |
| radius | number | No | `1.0` | 언샤프 마스크: 픽셀 단위 블러 반경 (0.1 ~ 5) |
| threshold | number | No | `0` | 언샤프 마스크: 선명화를 적용할 최소 밝기 차이 (0 ~ 255) |
| strength | number | No | `50` | 하이패스: 필터 강도 (0 ~ 100) |
| kernelSize | number | No | `3` | 하이패스: 컨볼루션 커널 크기 (3 또는 5) |
| denoise | string | No | `"off"` | 선명화 전 노이즈 감소: `off`, `light`, `medium`, `strong` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

매끄러운 영역을 보호하기 위한 임계값이 적용된 언샤프 마스크:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Notes {#notes}

- 선택한 방식에 관련된 파라미터만 사용됩니다. 예를 들어 `method`가 `adaptive`일 때는 `amount`, `radius`, `threshold`이 무시됩니다.
- 적응형 방식은 구성 가능한 평탄/들쭉날쭉 영역 동작을 갖춘 Sharp의 내장 적응형 선명화를 사용합니다.
- `denoise` 옵션은 선명화 전에 노이즈 감소를 적용하여 노이즈/입자의 증폭을 방지합니다.
- 하이패스 선명화는 원본에서 블러 처리된 버전을 빼서 미세한 디테일을 추출한 다음 다시 블렌딩합니다.
- 출력 형식은 입력 형식과 일치합니다. HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
