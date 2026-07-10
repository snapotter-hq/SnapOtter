---
description: "XML에서 반복되는 요소를 추출하여 CSV 표로 만듭니다."
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: 6bf5b9366265
---

# XML to CSV {#xml-to-csv}

XML 파일에서 반복되는 요소를 추출하여 평면 CSV 표로 만듭니다. 이 도구는 XML 트리에서 첫 번째 객체 배열을 자동으로 찾아 각 요소를 행에 매핑합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

XML 파일이 포함된 multipart form data를 받습니다. settings 필드는 필요하지 않습니다.

## 매개변수 {#parameters}

이 도구에는 구성 가능한 매개변수가 없습니다. 반복되는 요소는 XML 구조에서 자동으로 감지됩니다.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## 참고 사항 {#notes}

- `.xml` 파일만 입력으로 허용됩니다.
- 이 도구는 XML 트리에서 첫 번째로 반복되는 형제 요소 집합을 스캔하여 이를 행으로 사용합니다.
- 각 고유한 자식 요소 또는 속성 이름이 CSV 열 헤더가 됩니다.
- 이는 단방향 변환입니다. 양방향 JSON/XML 변환의 경우 [JSON to XML](/ko/tools/files/json-xml) 도구를 사용하세요.
