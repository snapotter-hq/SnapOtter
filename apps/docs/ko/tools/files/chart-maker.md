---
description: "CSV 또는 JSON 데이터로 막대, 선, 또는 파이 차트를 만듭니다."
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: 42d55135bce9
---

# 차트 메이커 {#chart-maker}

CSV 또는 JSON 데이터로 막대, 선, 또는 파이 차트를 만듭니다. 렌더링된 차트의 PNG 이미지를 반환합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

CSV 또는 JSON 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| kind | string | 아니요 | `"bar"` | 차트 유형: `bar`, `line`, `pie` |
| title | string | 아니요 | - | 차트 제목(최대 120자) |
| width | integer | 아니요 | `960` | 차트 너비(픽셀)(320-2048) |
| height | integer | 아니요 | `540` | 차트 높이(픽셀)(240-1536) |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## 참고 사항 {#notes}

- 입력은 `.csv` 또는 `.json` 파일이어야 합니다. CSV 파일에는 열 이름이 있는 헤더 행이 있어야 합니다.
- 첫 번째 열은 카테고리 레이블로 사용되며, 두 번째 열은 숫자여야 하고 데이터 값을 제공합니다. 두 개의 열만 사용됩니다.
- JSON 입력은 `{label, value}` 객체의 배열이거나, 키가 레이블이 되고 값이 데이터 포인트가 되는 일반 객체여야 합니다.
- 최대 100개의 데이터 포인트. 모든 값은 0 이상이어야 합니다.
- 입력 형식과 관계없이 출력은 항상 PNG 이미지입니다.
