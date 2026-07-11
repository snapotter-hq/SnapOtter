---
description: "JSON과 XML 간 양방향 변환."
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: 423ba4cd5d09
---

# JSON to XML {#json-to-xml}

JSON과 XML 형식 간에 양방향으로 변환합니다. JSON 파일을 업로드하여 XML을 얻거나, XML 파일을 업로드하여 JSON을 얻으세요.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

JSON 또는 XML 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| pretty | boolean | 아니요 | `true` | 들여쓰기와 함께 출력을 보기 좋게 출력 |

## 요청 예시 {#example-request}

JSON to XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML to JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## 참고 사항 {#notes}

- 변환 방향은 입력 파일 확장자로 자동 감지됩니다: `.json`는 `.xml`을 생성하고, `.xml`는 `.json`을 생성합니다.
- `pretty` 매개변수는 양방향 모두에 적용됩니다. `false`일 때 출력은 들여쓰기 없이 간결합니다.
- XML 속성과 중첩 구조는 왕복 변환 시 가능한 한 유지됩니다.
