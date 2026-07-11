---
description: "CSV와 Excel(XLSX) 간 양방향 변환."
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 45b76d4ed060
---

# CSV to Excel {#csv-to-excel}

CSV와 Excel(XLSX) 형식 간에 양방향으로 변환합니다. CSV 또는 TSV 파일을 업로드하여 XLSX를 얻거나, XLSX 파일을 업로드하여 CSV를 얻으세요.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

CSV, TSV, 또는 XLSX 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| sheet | integer | 아니요 | `1` | XLSX에서 변환할 때 내보낼 워크시트 번호(최소 1) |

## 요청 예시 {#example-request}

CSV to Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel to CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## 참고 사항 {#notes}

- 변환 방향은 입력 파일 확장자로 자동 감지됩니다: `.csv` 또는 `.tsv`는 `.xlsx`을 생성하고, `.xlsx`는 `.csv`을 생성합니다.
- `sheet` 매개변수는 XLSX에서 변환할 때만 적용됩니다. 내보낼 워크시트를 선택합니다.
- TSV(탭 구분 값) 파일은 CSV와 함께 지원됩니다.
