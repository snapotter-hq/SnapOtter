---
description: "스프레드시트를 PDF로 변환합니다."
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: b37f293df4d6
---

# Excel to PDF {#excel-to-pdf}

Excel, OpenDocument, 또는 CSV 스프레드시트를 PDF로 변환합니다. 넓은 시트는 여러 페이지에 걸쳐 분할될 수 있습니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

Excel/ODS/CSV 파일이 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

이 도구에는 설정 가능한 매개변수가 없습니다. 스프레드시트를 업로드하면 PDF로 변환됩니다.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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

- 허용 입력 형식: `.xlsx`, `.xls`, `.ods`, `.csv`.
- 넓은 시트는 결과 PDF에서 여러 페이지에 걸쳐 분할될 수 있습니다.
- 차트와 조건부 서식은 PDF 출력에 렌더링됩니다.
- 변환은 서버에서 헤드리스로 실행되는 LibreOffice가 처리합니다.
