---
description: "여러 이미지를 슬라이드쇼 비디오로 만듭니다."
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: 03b8662b3522
---

# Images to Video {#images-to-video}

이미지 세트를 이미지당 지속 시간, 해상도, 프레임 레이트를 구성할 수 있는 슬라이드쇼 비디오로 만듭니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

이미지 파일 두 개 이상과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | 이미지당 표시 지속 시간(초, 0.5-10) |
| resolution | string | No | `"720p"` | 출력 해상도: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | 출력 프레임 레이트(10-60) |

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
- 이미지는 종횡비를 유지하면서 목표 해상도에 맞게 크기가 조정되고 패딩됩니다.
- `square` 해상도 옵션은 소셜 미디어에 유용한 1080x1080 비디오를 생성합니다.
- 출력 형식은 항상 MP4(H.264)입니다.
