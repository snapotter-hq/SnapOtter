---
description: "Markdown 파일을 독립형 HTML 페이지로 변환합니다."
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: 77ddd3007fa2
---

# Markdown to HTML {#markdown-to-html}

Markdown 파일을 독립형 HTML 페이지로 변환합니다. 소스에서 참조된 원격 이미지는 출력에 그대로 남습니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

Markdown 파일이 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

이 도구에는 설정 가능한 매개변수가 없습니다. Markdown 파일을 업로드하면 HTML로 변환됩니다.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## 참고 사항 {#notes}

- 허용 입력 형식: `.md`, `.markdown`.
- 이 도구는 결과를 직접 반환하는 빠른(동기) 도구입니다.
- 출력은 인라인 스타일이 포함된 자체 완결형 HTML 페이지입니다.
- Markdown 소스의 원격 이미지 URL은 그대로 유지되며 가져오지 않습니다.
