---
description: "Word 문서를 PDF로 변환합니다."
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 5f4e4a48c806
---

# Word to PDF {#word-to-pdf}

Word 문서, OpenDocument 텍스트, RTF 또는 일반 텍스트 파일을 PDF로 변환합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

Word/ODT/RTF/TXT 파일이 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

이 도구에는 구성 가능한 매개변수가 없습니다. 문서를 업로드하면 PDF로 변환됩니다.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
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

- 허용되는 입력 형식: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- 변환은 서버에서 헤드리스로 실행되는 LibreOffice가 처리합니다.
- 문서에 임베드된 글꼴은 가능한 경우 사용되며, 그렇지 않으면 시스템 글꼴로 대체됩니다.
- 머리글, 바닥글, 표, 이미지는 PDF 출력에 보존됩니다.
