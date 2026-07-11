---
description: "비디오 클립을 애니메이션 WebP 이미지로 변환합니다."
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: a1f43308fed5
---

# Video to WebP {#video-to-webp}

비디오 클립을 프레임 레이트, 너비, 품질을 구성할 수 있는 애니메이션 WebP 이미지로 변환합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | 출력 프레임 레이트(1-30) |
| width | integer | No | `480` | 출력 너비(픽셀, 16-1920). 높이는 비례하여 스케일됨 |
| quality | integer | No | `75` | WebP 압축 품질(1-100) |
| loop | boolean | No | `true` | 애니메이션 반복 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- 애니메이션 WebP는 GIF보다 작은 파일을 생성하면서 더 나은 색상 지원을 제공합니다(8비트 팔레트 대비 24비트).
- `quality` 값이 낮을수록 시각적 충실도를 희생하면서 더 작은 파일을 생성합니다.
- 한 번 재생 후 멈춰야 하는 애니메이션은 `loop`를 `false`으로 설정하세요.
