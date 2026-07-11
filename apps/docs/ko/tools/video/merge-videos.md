---
description: "여러 비디오 클립을 하나의 파일로 결합합니다."
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: 630a5604a812
---

# Merge Videos {#merge-videos}

여러 비디오 클립을 하나의 MP4 파일로 결합합니다. 모든 입력은 첫 번째 비디오의 해상도와 30 fps로 정규화됩니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

비디오 파일 두 개 이상이 담긴 multipart form data를 받습니다. 이 엔드포인트는 비동기입니다. 즉시 `202 Accepted`를 반환하고 진행 상황은 `GET /api/v1/jobs/{jobId}/progress`에서 SSE를 통해 스트리밍됩니다.

## Parameters {#parameters}

이 도구에는 설정 매개변수가 없습니다. 비디오 파일 2-10개를 여러 개의 `file` 파트로 업로드하세요.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 클립은 업로드된 순서대로 연결됩니다.
- 모든 클립은 첫 번째 클립의 해상도, 프레임 레이트(30 fps), 코덱(H.264)에 맞게 재인코딩됩니다. 일치하지 않는 입력은 자동으로 정규화됩니다.
- 요청당 비디오 파일 2-10개를 허용합니다.
- 작업이 완료될 때까지 진행 상황 업데이트는 `GET /api/v1/jobs/{jobId}/progress`에서 SSE를 통해 제공됩니다.
