---
description: "Markdown 파일을 Word 문서(DOCX)로 변환합니다."
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: 8a4005429508
---

# Markdown to Word {#markdown-to-word}

Markdown 파일을 Word 문서(DOCX)로 변환하여 제목, 목록, 코드 블록, 기타 서식을 유지합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Markdown 파일이 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

이 도구에는 설정 가능한 매개변수가 없습니다. Markdown 파일을 업로드하면 DOCX로 변환됩니다.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## 참고 사항 {#notes}

- 허용 입력 형식: `.md`, `.markdown`.
- 이 도구는 결과를 직접 반환하는 빠른(동기) 도구입니다.
- 제목, 굵게, 기울임, 링크, 코드 블록, 목록은 Word 스타일로 매핑됩니다.
- 변환은 서버의 Pandoc이 처리합니다.
