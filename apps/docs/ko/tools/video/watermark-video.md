---
description: "비디오 프레임에 텍스트 워터마크를 구워 넣습니다."
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: 793d92e6f6f7
---

# Watermark Video {#watermark-video}

구성 가능한 위치, 크기, 불투명도, 색상으로 비디오의 모든 프레임에 텍스트 워터마크를 구워 넣습니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | 워터마크 텍스트(1-200자) |
| position | string | No | `"br"` | 프레임 상 위치: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `36` | 글꼴 크기(픽셀, 8-120) |
| opacity | number | No | `0.5` | 워터마크 불투명도(0.05-1) |
| color | string | No | `"#ffffff"` | 텍스트의 Hex 색상(예: `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - 왼쪽 위, **tc** - 가운데 위, **tr** - 오른쪽 위
- **l** - 왼쪽 가운데, **c** - 중앙, **r** - 오른쪽 가운데
- **bl** - 왼쪽 아래, **bc** - 가운데 아래, **br** - 오른쪽 아래

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- 워터마크는 비디오 프레임에 영구적으로 렌더링되며 처리 후 제거할 수 없습니다.
- 워터마크는 FFmpeg에 내장된 산세리프 글꼴을 사용합니다.
- 이미지 워터마크는 이미지 Watermark 도구를 대신 사용하세요.
