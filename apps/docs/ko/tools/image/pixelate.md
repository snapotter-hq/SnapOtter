---
description: "전체 이미지 또는 특정 영역에 픽셀화 효과를 적용합니다."
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: f201196db198
---

# Pixelate {#pixelate}

전체 이미지 또는 특정 직사각형 영역에 픽셀화 효과를 적용합니다. 얼굴, 번호판, 개인 정보 같은 민감한 콘텐츠를 가리는 데 유용합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

이미지 파일과 JSON `settings` 필드가 포함된 multipart form data를 허용합니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| blockSize | integer | No | `12` | 픽셀 블록 크기(2~128). 값이 클수록 픽셀화가 더 거칠어집니다 |
| region | object | No | - | 픽셀화를 직사각형으로 제한(아래 참조) |

### Region Object {#region-object}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| left | integer | Yes | 왼쪽 오프셋(픽셀, >= 0) |
| top | integer | Yes | 위쪽 오프셋(픽셀, >= 0) |
| width | integer | Yes | 영역 너비(픽셀, >= 1) |
| height | integer | Yes | 영역 높이(픽셀, >= 1) |

## Example Request {#example-request}

전체 이미지 픽셀화:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

특정 영역 픽셀화:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notes {#notes}

- `region`이 생략되면 전체 이미지가 픽셀화됩니다.
- 영역 좌표는 이미지의 왼쪽 상단 모서리를 기준으로 한 픽셀 단위입니다. 영역은 이미지 경계 내에 있어야 합니다.
- 출력 형식은 입력 형식과 일치합니다. HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
