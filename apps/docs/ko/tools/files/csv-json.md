---
description: "CSV와 JSON 간 양방향 변환."
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: 25d30511ae25
---

# CSV to JSON {#csv-to-json}

CSV와 JSON 형식 간에 양방향으로 변환합니다. CSV 또는 TSV 파일을 업로드하여 객체의 JSON 배열을 얻거나, JSON 배열을 업로드하여 CSV 파일을 얻으세요.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

CSV, TSV, 또는 JSON 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| pretty | boolean | 아니요 | `true` | 들여쓰기와 함께 JSON 출력을 보기 좋게 출력 |

## 요청 예시 {#example-request}

CSV to JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON to CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## 참고 사항 {#notes}

- 변환 방향은 입력 파일 확장자로 자동 감지됩니다: `.csv` 또는 `.tsv`는 `.json`을 생성하고, `.json`는 `.csv`을 생성합니다.
- `pretty` 매개변수는 JSON 출력에만 영향을 줍니다. `false`로 설정하면 출력이 한 줄로 된 간결한 JSON 문자열이 됩니다.
- JSON 입력은 일관된 키를 가진 객체의 배열이어야 합니다. 각 객체가 하나의 행이 되고, 각 키가 하나의 열 헤더가 됩니다.
- TSV(탭 구분 값) 파일은 CSV와 함께 지원됩니다.
