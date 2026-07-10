---
description: "목표 화면비에 맞추기 위해 단색 막대를 추가합니다."
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: e04bb3e0f318
---

# Aspect Pad {#aspect-pad}

크롭 없이 비디오를 목표 화면비에 맞추기 위해 단색 레터박스 또는 필러박스 막대를 추가합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

비디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"9:16"` | 목표 화면비: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| color | string | No | `"#000000"` | 패딩 막대의 16진수 색상(예: 검은색은 `"#000000"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- 비디오가 이미 목표 화면비와 일치하면 파일이 변경 없이 반환됩니다.
- 세로/인물 모드 소셜 미디어 형식(TikTok, Reels, Shorts)에는 `9:16`을(를) 사용하세요.
- 단색 대신 흐림 패딩을 원하면 Blur Pad 도구를 사용하세요.
