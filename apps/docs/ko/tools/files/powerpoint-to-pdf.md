---
description: "프레젠테이션을 PDF로 변환합니다."
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: 1618923be6be
---

# PowerPoint to PDF {#powerpoint-to-pdf}

PowerPoint 또는 OpenDocument 프레젠테이션을 슬라이드당 한 페이지로 PDF로 변환합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

PowerPoint/ODP 파일이 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

이 도구에는 구성 가능한 매개변수가 없습니다. 프레젠테이션을 업로드하면 PDF로 변환됩니다.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
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

- 허용되는 입력 형식: `.pptx`, `.ppt`, `.odp`.
- 각 슬라이드는 PDF에서 한 페이지가 됩니다.
- 변환은 서버에서 헤드리스로 실행되는 LibreOffice가 처리합니다.
- 애니메이션과 전환 효과는 PDF 출력에 포함되지 않습니다.
