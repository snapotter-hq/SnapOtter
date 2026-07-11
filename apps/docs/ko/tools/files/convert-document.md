---
description: "Word, OpenDocument, RTF, 일반 텍스트 형식 간 변환."
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: 68b853b3c9b2
---

# 문서 변환 {#convert-document}

LibreOffice를 사용하여 Word(DOCX), OpenDocument(ODT), RTF, 일반 텍스트 형식 간에 문서를 변환합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

Word/ODT/RTF/TXT 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| format | string | 예 | - | 출력 형식: `docx`, `odt`, `rtf`, `txt` |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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

- 허용 입력 형식: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- 변환은 서버에서 헤드리스로 실행되는 LibreOffice가 처리합니다.
- 복잡한 서식(매크로, 임베디드 객체)은 형식 간 변환 시 유지되지 않을 수 있습니다.
- 출력 형식은 입력 형식과 달라야 합니다.
