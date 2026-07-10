---
description: "2패스 안정화로 카메라 흔들림을 줄입니다."
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: 0c65313c55d3
---

# Stabilize Video {#stabilize-video}

FFmpeg의 2패스 vidstab 안정화를 사용하여 핸드헬드 영상의 카메라 흔들림을 줄입니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

비디오 파일과 JSON `settings` 필드가 담긴 multipart form data를 받습니다. 이 엔드포인트는 비동기입니다. 즉시 `202 Accepted`를 반환하고 진행 상황은 `GET /api/v1/jobs/{jobId}/progress`에서 SSE를 통해 스트리밍됩니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | 스무딩 윈도우 크기(프레임, 5-60). 값이 높을수록 더 부드러운 모션을 생성합니다 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 안정화는 2패스 프로세스입니다. 첫 번째 패스는 카메라 모션을 분석하고 두 번째 패스는 보정을 적용합니다. 이는 단일 패스 도구보다 대략 두 배 오래 걸립니다.
- 스무딩 값이 높을수록 흔들림이 더 많이 제거되지만 가장자리에 약간의 줌 크롭이 생길 수 있습니다.
- 작업이 완료될 때까지 진행 상황 업데이트는 `GET /api/v1/jobs/{jobId}/progress`에서 SSE를 통해 제공됩니다.
