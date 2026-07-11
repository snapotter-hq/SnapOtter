---
description: "HTML 파일을 PDF로 변환합니다."
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: 6b1cf3067b15
---

# HTML to PDF {#html-to-pdf}

HTML 파일을 스타일이 적용된 PDF 문서로 변환합니다. 원격 리소스(외부 이미지, 스타일시트, 스크립트)는 개인정보 보호를 위해 비활성화됩니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

HTML 파일이 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

이 도구에는 설정 가능한 매개변수가 없습니다. HTML 파일을 업로드하면 PDF로 변환됩니다.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
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

- 허용 입력 형식: `.html`, `.htm`.
- URL로 참조된 원격 리소스(이미지, 스타일시트, 스크립트)는 개인정보 보호 및 보안을 위해 가져오지 않습니다.
- 인라인 스타일과 임베디드 이미지(data URI)는 유지됩니다.
- 변환은 서버의 WeasyPrint가 처리합니다.
