---
description: "비디오의 흐린 복사본으로 막대를 채웁니다."
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: dad9b1548476
---

# Blur Pad {#blur-pad}

패딩 영역을 단색 막대 대신 흐리게 처리하고 크기를 조정한 비디오 복사본으로 채워 비디오를 목표 화면비에 맞춥니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

비디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"16:9"` | 목표 화면비: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | No | `20` | 배경의 가우시안 흐림 sigma(2-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes {#notes}

- 흐림 값이 높을수록 더 부드럽고 추상적인 배경을 생성합니다. 값이 낮을수록 더 많은 디테일이 보입니다.
- 비디오가 이미 목표 화면비와 일치하면 파일이 변경 없이 반환됩니다.
- 단색 패딩을 원하면 Aspect Pad 도구를 대신 사용하세요.
