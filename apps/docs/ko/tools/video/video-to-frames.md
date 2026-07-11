---
description: "비디오에서 프레임을 이미지 ZIP으로 추출합니다."
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: 72525fc332fc
---

# Video to Frames {#video-to-frames}

비디오에서 개별 프레임을 추출하여 PNG 또는 JPG 이미지의 ZIP 아카이브로 다운로드합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | 추출 모드: `all`, `nth`, `timestamps` |
| n | integer | No | `10` | N번째 프레임마다 추출(2-1000). mode가 `"nth"`일 때만 사용됨 |
| timestamps | string | No | `""` | 쉼표로 구분된 타임스탬프(초). mode가 `"timestamps"`일 때 필수 |
| format | string | No | `"png"` | 추출된 프레임의 이미지 형식: `png`, `jpg` |

## Example Request {#example-request}

30번째 프레임마다 JPG로 추출:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

특정 타임스탬프에서 프레임 추출:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- `all` 모드는 모든 프레임을 추출하며 긴 비디오의 경우 매우 큰 ZIP 파일을 생성할 수 있습니다. 선택적 추출에는 `nth` 또는 `timestamps` 모드를 사용하세요.
- PNG는 전체 품질을 유지하지만 파일이 더 큽니다. JPG는 더 작지만 손실 형식입니다.
- 응답은 순차적으로 번호가 매겨진 이미지 파일이 담긴 ZIP 아카이브로 다운로드됩니다.
