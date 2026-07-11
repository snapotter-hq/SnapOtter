---
description: "Word, Markdown, HTML 또는 일반 텍스트 파일을 EPUB로 변환합니다."
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: 8cc287aab9bc
---

# Convert to EPUB {#convert-to-epub}

Word 문서, Markdown, HTML 또는 일반 텍스트 파일을 EPUB 전자책 형식으로 변환합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Word/Markdown/HTML/TXT 파일이 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

이 도구에는 구성 가능한 매개변수가 없습니다. 문서를 업로드하면 EPUB로 변환됩니다.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
```

## 응답 예시 {#example-response}

`202 Accepted`을(를) 반환합니다. `/api/v1/jobs/{jobId}/progress`에서 SSE를 통해 진행 상황을 추적할 수 있습니다.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## 참고 사항 {#notes}

- 허용되는 입력 형식: `.docx`, `.md`, `.html`, `.txt`.
- EPUB 출력은 EPUB 3 사양을 따릅니다.
- 소스 문서의 제목은 목차를 생성하는 데 사용됩니다.
- 변환은 서버의 Pandoc이 처리합니다.
