---
description: "YAML과 JSON 간 양방향 변환을 수행합니다."
i18n_source_hash: ef0c9b633797
i18n_provenance: human
i18n_output_hash: c24cc0d2741c
---

# YAML / JSON 변환 {#yaml-json}

YAML과 JSON 형식 간 양방향 변환을 수행합니다. YAML 파일을 업로드하면 JSON을 얻고, JSON 파일을 업로드하면 YAML을 얻습니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

YAML 또는 JSON 파일이 포함된 multipart form data를 받습니다. settings 필드는 필요하지 않습니다.

## 매개변수 {#parameters}

이 도구에는 구성 가능한 매개변수가 없습니다. 변환 방향은 입력 파일 확장자에 따라 결정됩니다.

## 요청 예시 {#example-request}

YAML을 JSON으로:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON을 YAML로:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## 참고 사항 {#notes}

- 변환 방향은 입력 파일 확장자에서 자동으로 감지됩니다. `.yaml` 또는 `.yml`은(는) `.json`을(를) 생성하고, `.json`은(는) `.yaml`을(를) 생성합니다.
- `.yaml`와 `.yml` 확장자 모두 허용됩니다.
- 다중 문서 YAML 파일에서는 첫 번째 문서만 변환됩니다. `---`로 구분된 추가 문서는 무시됩니다.
