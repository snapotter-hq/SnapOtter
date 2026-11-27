---
description: "여러 이미지를 슬라이드쇼 비디오, 애니메이션 GIF 또는 애니메이션 WebP로 만듭니다."
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: 657cddaeb38b
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

이미지 세트를 이미지당 지속 시간, 해상도, 프레임 레이트를 구성할 수 있는 슬라이드쇼 비디오로 만들거나, 프레임당 시간과 반복 횟수를 지정한 애니메이션 GIF 또는 WebP로 만듭니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

이미지 파일 두 개 이상과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | 출력 형식: `mp4`, `gif`, `webp` |
| secondsPerImage | number | No | `2` | MP4 전용. 이미지당 표시 지속 시간(초, 0.5-10) |
| resolution | string | No | `"720p"` | MP4 전용. 출력 해상도: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | MP4 전용. 출력 프레임 레이트(10-60) |
| frameDelayMs | integer | No | `500` | GIF 및 WebP 전용. 각 이미지를 표시하는 시간(밀리초, 20-10000) |
| loop | integer | No | `0` | GIF 및 WebP 전용. 애니메이션을 재생하는 횟수. `0`이면 무한 반복(0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

각 이미지를 200ms 동안 표시하는 애니메이션 GIF를 만들려면:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- 요청당 이미지 파일 2-60개를 허용합니다. 이미지는 업로드 순서대로 비디오에 나타납니다.
- MP4의 경우 이미지는 종횡비를 유지하면서 목표 해상도에 맞게 크기가 조정되고 패딩됩니다.
- `square` 해상도 옵션은 소셜 미디어에 유용한 1080x1080 비디오를 생성합니다.
- MP4 출력은 H.264이며 이름은 `slideshow.mp4`입니다.
- GIF와 WebP 출력은 첫 번째 이미지의 크기를 사용합니다. 크기가 다른 이미지는 그 안에 들어가도록 축소되며, 남는 영역은 투명합니다. 파일 이름은 `slideshow.gif` 또는 `slideshow.webp`입니다.
- GIF는 프레임 시간을 100분의 1초 단위로 저장하므로 GIF에서는 `frameDelayMs`이 가장 가까운 10ms 단위로 반올림됩니다. WebP는 정확한 값을 유지합니다.
- 큰 애니메이션은 만들지 않고 거부됩니다. 프레임 크기에 이미지 수를 곱한 값이 GIF 도구와 같은 픽셀 제한 이내여야 합니다.
