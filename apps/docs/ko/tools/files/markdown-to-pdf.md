---
description: "Markdown 파일을 스타일이 적용된 PDF로 변환합니다."
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: 9c79fd741afc
---

# Markdown to PDF {#markdown-to-pdf}

Markdown 파일을 스타일이 적용된 PDF 문서로 변환합니다. 개인정보 보호를 위해 원격 리소스는 비활성화되어 있습니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

Markdown 파일이 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

이 도구에는 구성 가능한 매개변수가 없습니다. Markdown 파일을 업로드하면 PDF로 변환됩니다.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
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

- 허용되는 입력 형식: `.md`, `.markdown`.
- 개인정보 보호와 보안을 위해 원격 리소스(URL로 참조된 이미지, 스타일시트)는 가져오지 않습니다.
- Markdown은 먼저 HTML로 렌더링된 다음 WeasyPrint를 통해 PDF로 변환됩니다.
- 코드 블록, 표, 기타 Markdown 요소는 PDF 출력에서 스타일이 적용됩니다.
