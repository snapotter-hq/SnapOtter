---
description: "비디오에서 자막 트랙을 SRT, WebVTT 또는 ASS 파일로 추출합니다."
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: 195c2530edd3
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

비디오 컨테이너에서 임베드된 자막 트랙을 추출하여 SRT, WebVTT 또는 ASS 파일로 다운로드합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

비디오 파일과 선택적 `settings` JSON 문자열이 담긴 multipart form data를 받습니다.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | 출력 형식: `srt`, `vtt`(WebVTT) 또는 `ass` |

비디오 컨테이너에서 발견된 첫 번째 자막 트랙을 추출합니다.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- 비디오에는 임베드된 자막 트랙이 있어야 합니다. 자막 트랙을 찾을 수 없으면 요청은 400 오류를 반환합니다.
- 비디오에 여러 자막 트랙이 있으면 첫 번째 트랙이 추출됩니다.
- 텍스트 트랙(SubRip, ASS, mov_text, WebVTT)은 세 가지 출력 형식 중 어느 것으로든 변환할 수 있습니다. ASS 트랙을 SRT나 WebVTT로 변환하면 위치 지정과 효과가 사라집니다.
- 이미지 기반 트랙(Blu-ray PGS, DVD VobSub)은 OCR 없이는 텍스트로 바꿀 수 없으므로 422 오류를 반환합니다.
