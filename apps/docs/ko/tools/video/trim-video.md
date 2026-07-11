---
description: "시작 및 종료 시간을 지정하여 비디오에서 클립을 잘라냅니다."
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: 7cb48f2f868e
---

# Trim Video {#trim-video}

초 단위로 시작 및 종료 시간을 지정하여 비디오에서 클립을 잘라내며, 프레임 단위 정확한 컷을 위한 옵션을 제공합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | 시작 시간(초, >= 0이어야 함) |
| endS | number | Yes | - | 종료 시간(초, startS 이후여야 함) |
| precise | boolean | No | `false` | 키프레임 탐색 대신 프레임 단위 정확한 컷을 위해 재인코딩 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- `precise`가 `false`(기본값)일 때 이 도구는 키프레임 탐색을 사용하며, 이는 빠르지만 요청한 시간보다 몇 프레임 앞에서 시작할 수 있습니다.
- `precise`를 `true`로 설정하면 정확한 프레임 경계를 위해 세그먼트를 재인코딩하지만 시간이 더 오래 걸립니다.
- `endS` 값은 `startS`보다 커야 합니다.
