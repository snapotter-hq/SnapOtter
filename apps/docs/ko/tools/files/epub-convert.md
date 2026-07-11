---
description: "EPUB를 PDF, DOCX, HTML, 또는 Markdown으로 변환합니다."
i18n_source_hash: 7d94fc18ca97
i18n_provenance: human
i18n_output_hash: 19ff29a02151
---

# EPUB 변환 {#convert-epub}

EPUB 전자책을 PDF, Word(DOCX), HTML, 또는 Markdown으로 변환합니다. 책 내부의 원격 리소스는 가져오지 않습니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

EPUB 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| format | string | 예 | - | 출력 형식: `pdf`, `docx`, `html`, `md` |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
```

## 응답 예시 {#example-response}

`202 Accepted`을 반환합니다. `/api/v1/jobs/{jobId}/progress`에서 SSE를 통해 진행 상황을 추적하세요.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## 참고 사항 {#notes}

- 허용 입력 형식: `.epub`.
- EPUB에 임베디드된 원격 리소스(외부 이미지, 폰트)는 보안을 위해 가져오지 않습니다.
- 변환된 출력의 이미지 충실도는 EPUB 구조에 따라 달라질 수 있습니다.
- 변환은 서버의 Pandoc이 처리합니다.
