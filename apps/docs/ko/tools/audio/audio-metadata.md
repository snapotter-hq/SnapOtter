---
description: "오디오 메타데이터 태그(ID3)를 조회, 편집 또는 제거합니다."
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: f73ed48361d1
---

# Audio Metadata {#audio-metadata}

제목, 아티스트, 앨범과 같은 오디오 메타데이터 태그(ID3 및 유사 태그 형식)를 조회, 편집 또는 제거합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

오디오 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 파라미터 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strip | boolean | No | `false` | 기존 메타데이터 태그를 모두 제거 |
| title | string | No | - | 제목 태그 설정(최대 500자) |
| artist | string | No | - | 아티스트 태그 설정(최대 500자) |
| album | string | No | - | 앨범 태그 설정(최대 500자) |

## 요청 예시 {#example-request}

메타데이터 태그 편집:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

모든 메타데이터 제거:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## 참고 {#notes}

- 응답에는 컨테이너 형식, 길이, 비트레이트, 현재 태그가 담긴 `metadata` 객체가 포함됩니다.
- `strip`이 `true`이면 모든 태그 필드가 무시되고 기존 태그가 모두 제거됩니다.
- 제공한 태그만 업데이트되며, 지정하지 않은 태그는 변경되지 않습니다.
- 출력 형식은 입력 형식과 동일합니다.
