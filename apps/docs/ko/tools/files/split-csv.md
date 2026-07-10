---
description: "행 수를 기준으로 CSV를 더 작은 파일로 분할합니다."
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: c13f60413116
---

# Split CSV {#split-csv}

큰 CSV 또는 TSV 파일을 행 수를 기준으로 더 작은 파일로 분할합니다. 분할된 부분들을 담은 ZIP 아카이브를 반환합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

CSV 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | 아니요 | `1000` | 출력 파일당 데이터 행 수 (1~1,000,000) |
| keepHeader | boolean | 아니요 | `true` | 각 출력 파일에 헤더 행을 반복 |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## 참고 사항 {#notes}

- 출력은 항상 분할된 CSV 부분들을 담은 ZIP 아카이브이며, 순차적으로 이름이 지정됩니다(예: `part-1.csv`, `part-2.csv`).
- `keepHeader`이(가) `true`일 때, 각 부분에 원본 헤더 행이 포함되어 각 파일을 독립적으로 사용할 수 있습니다.
- CSV와 TSV 파일 모두 입력으로 허용됩니다.
- 행 수는 데이터 행만을 의미하며, 헤더 행은 계산되지 않습니다.
