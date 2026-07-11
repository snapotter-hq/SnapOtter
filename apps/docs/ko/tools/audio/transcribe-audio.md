---
description: "AI 기반 전사로 음성을 텍스트로 변환합니다."
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 4f8c7123d0b9
---

# 오디오 전사 {#transcribe-audio}

AI 기반 전사(faster-whisper)를 사용하여 음성을 텍스트로 변환합니다. 자동 또는 수동 언어 선택과 함께 일반 텍스트, SRT, VTT 출력 형식을 지원합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| language | string | 아니요 | `"auto"` | 언어: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | 아니요 | `"txt"` | 출력 형식: `txt`, `srt`, `vtt` |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## 응답 예시 {#example-response}

이 도구는 비동기 도구입니다. API는 즉시 `202 Accepted`를 반환합니다:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

`GET /api/v1/jobs/{jobId}/progress`에서 SSE를 통해 진행 상황을 추적하세요. 작업이 완료되면 SSE 스트림이 `downloadUrl`와 함께 최종 결과를 전달합니다.

## 참고 사항 {#notes}

- **transcription** 기능 번들이 설치되어 있어야 합니다. 번들을 사용할 수 없는 경우 코드 `FEATURE_NOT_INSTALLED`, 누락된 `feature`, `featureName`, `estimatedSize`와 함께 `501`를 반환합니다.
- 전사에 faster-whisper를 사용합니다. 언어 `auto`는 발화된 언어를 자동으로 감지합니다.
- `srt` 및 `vtt` 형식은 각 세그먼트의 타임스탬프를 포함하여 자막에 적합합니다.
- `txt` 형식은 타임스탬프 없이 일반 텍스트를 반환합니다.
- 이 도구는 오래 실행되는 AI 도구이며, 처리 시간은 오디오 길이와 서버 하드웨어에 따라 달라집니다.
