---
description: "Excel, OpenDocument, CSV 형식 간 변환."
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: 76f037815f0c
---

# 스프레드시트 변환 {#convert-spreadsheet}

Excel(XLSX), OpenDocument Spreadsheet(ODS), CSV 형식 간에 스프레드시트를 변환합니다. 다중 시트 워크북은 CSV로 변환할 때 첫 번째 시트를 내보냅니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

Excel/ODS/CSV 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| format | string | 예 | - | 출력 형식: `xlsx`, `ods`, `csv` |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
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
- 다중 시트 워크북을 CSV로 변환할 때는 첫 번째 시트만 내보내집니다.
- 수식은 계산되어 CSV 출력에서 정적 값으로 내보내집니다.
- 출력 형식은 입력 형식과 달라야 합니다.
