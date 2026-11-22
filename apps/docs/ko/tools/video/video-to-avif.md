---
description: "비디오 클립을 애니메이션 AVIF 이미지로 변환합니다."
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: e38382d1d146
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

프레임 레이트, 너비, 품질, 클립 구간을 설정해 비디오 클립을 애니메이션 AVIF 이미지로 변환합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | 출력 프레임 레이트(1-30) |
| width | integer | No | `480` | 출력 너비(픽셀, 64-1280). 높이는 비례하여 스케일됨 |
| startS | number | No | `0` | 클립 시작 위치(초) |
| durationS | number | No | `5` | 클립 길이(초, 최대 60) |
| quality | integer | No | `50` | AVIF 품질(1-100) |
| loop | boolean | No | `true` | 애니메이션 반복 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

AV1 인코딩은 GIF나 WebP보다 느리기 때문에 이 도구는 보통 `202`과 함께 작업을 반환하며, 진행 상황은 SSE로 `/api/v1/jobs/{jobId}/progress`에서 확인합니다. 짧은 클립은 동기 대기 시간 안에 끝나 결과를 바로 반환할 수 있습니다:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- 애니메이션 AVIF는 로열티가 없으며, 같은 화질이라면 보통 애니메이션 WebP나 GIF보다 작습니다.
- 최신 브라우저는 애니메이션 AVIF를 재생합니다. 일부 데스크톱 이미지 뷰어는 첫 프레임만 표시합니다.
- 오디오 트랙은 제거됩니다.
