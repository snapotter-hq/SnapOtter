---
description: "열이 일치하는 여러 CSV 또는 TSV 파일을 하나로 결합합니다."
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: bac6a7a9f263
---

# Merge CSVs {#merge-csvs}

열이 일치하는 여러 CSV 또는 TSV 파일을 하나의 병합된 파일로 결합합니다. 모든 입력 파일은 동일한 열 헤더를 가지고 있어야 합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

두 개 이상의 CSV 파일이 포함된 multipart form data를 받습니다. settings 필드는 필요하지 않습니다.

## 매개변수 {#parameters}

이 도구에는 구성 가능한 매개변수가 없습니다. 일치하는 열 헤더를 가진 2~20개의 CSV 또는 TSV 파일을 업로드하세요.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## 참고 사항 {#notes}

- 2개에서 20개 사이의 입력 파일이 필요합니다.
- 모든 파일은 동일한 열 헤더를 공유해야 합니다. 열이 일치하지 않으면 병합이 실패합니다.
- 헤더 행은 출력에 한 번만 포함되며, 모든 파일의 데이터 행은 업로드 순서대로 연결됩니다.
- CSV와 TSV 파일 모두 허용되지만, 단일 요청 내의 모든 파일은 동일한 구분 기호를 사용해야 합니다.
