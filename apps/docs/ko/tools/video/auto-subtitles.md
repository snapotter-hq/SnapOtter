---
description: "AI를 사용하여 비디오 오디오 트랙에서 자막 파일을 생성합니다."
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: 0e0b92a9ab7a
---

# Auto Subtitles {#auto-subtitles}

AI 기반 음성 인식(faster-whisper)을 사용하여 비디오의 오디오 트랙에서 자막 파일을 생성합니다. 자동 감지와 10개의 명시적 언어를 지원합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

비디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다. 이는 비동기 엔드포인트로, 즉시 `202 Accepted`을(를) 반환하며 진행 상황은 `GET /api/v1/jobs/{jobId}/progress`의 SSE로 스트리밍됩니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | 음성 언어: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | No | `"srt"` | 출력 자막 형식: `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 이 도구는 **transcription** 기능 번들이 설치되어 있어야 하는 AI 도구입니다. 번들이 설치되어 있지 않으면 API가 관리자 UI를 통해 설치하라는 안내와 함께 `501 Feature Not Installed`을(를) 반환합니다.
- `auto` 언어 옵션은 whisper에 내장된 언어 감지를 사용합니다. 언어를 명시적으로 지정하면 정확도와 속도가 향상됩니다.
- SRT는 가장 널리 지원되는 자막 형식입니다. VTT(WebVTT)는 웹 비디오 플레이어의 표준입니다.
- 작업이 완료될 때까지 `GET /api/v1/jobs/{jobId}/progress`의 SSE로 진행 상황 업데이트를 확인할 수 있습니다.
