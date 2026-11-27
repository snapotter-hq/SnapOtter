---
description: "자막 파일을 SRT, WebVTT, ASS 사이에서 변환합니다."
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: cf277b34b2b3
i18n_hash_version: 2
---

# Convert Subtitles {#convert-subtitles}

자막 파일을 SRT, WebVTT, ASS 사이에서 변환합니다. 타이밍과 텍스트는 그대로 유지되지만, ASS의 위치 지정과 효과는 유지되지 않습니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

자막 파일 하나(`.srt`, `.vtt` 또는 `.ass`)와 선택 사항인 JSON `settings` 필드를 담은 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | 출력 형식: `srt`, `vtt` 또는 `ass` |
| `encoding` | string | `"auto"` | 입력의 텍스트 인코딩: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` 또는 `euc-kr` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Notes {#notes}

- ASS에서 변환하면 타이밍, 대사 텍스트, 대상 형식이 담을 수 있는 기본 서식이 유지됩니다. SRT는 기울임꼴, 굵게, 색상, 글꼴 크기를 태그로 유지하고, WebVTT는 기울임꼴, 굵게, 밑줄을 유지합니다. 화면상의 위치 지정, 애니메이션 및 기타 ASS 효과는 제거됩니다.
- 출력은 항상 UTF-8입니다. `encoding`이(가) `auto`(으)로 설정되어 있으면, 유효한 UTF-8 파일은 그대로 읽고 그렇지 않은 파일은 Windows-1252(오래된 서유럽 SRT 파일에서 흔히 쓰는 인코딩)로 읽습니다. 악센트가 있는 문자나 라틴 문자가 아닌 문자가 깨져 보이면 `encoding`을(를) 파일의 실제 인코딩으로 설정하세요(예: 중국어 간체는 `gb18030`, 키릴 문자는 `windows-1251`).
- 자막 업로드는 기본적으로 1 MB로 제한됩니다. 제한은 `MAX_SUBTITLE_SIZE_MB`(으)로 늘리거나 해제할 수 있습니다.
