---
description: "svgo로 SVG 파일을 최소화하고 결과를 벡터 SVG로 유지합니다. 정밀도, 다중 패스, 메타데이터, 서식을 설정할 수 있습니다."
i18n_source_hash: c2601cc2cdd8
i18n_provenance: machine
i18n_output_hash: 0966549df7b1
i18n_hash_version: 2
---

# SVG 최적화 {#optimize-svg}

편집기 잔여 데이터, 불필요한 속성, 과도한 소수점 자릿수를 제거해 SVG 파일 크기를 줄이고 결과를 SVG로 다운로드합니다. “웹용 최적화”와 달리 출력은 래스터화되지 않습니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

`.svg` 또는 `.svgz` 파일과 JSON `settings` 필드가 포함된 멀티파트 폼 데이터를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| precision | number | No | `3` | 경로 데이터와 숫자에 유지할 소수점 자릿수(0~8). 값이 낮을수록 파일이 작아지고 곡선이 약간 거칠어집니다. |
| multipass | boolean | No | `true` | 출력이 더 줄어들지 않을 때까지 최적화를 반복 실행 |
| removeMetadata | boolean | No | `true` | 주석, `<metadata>`, `<desc>`, 편집기 전용 데이터를 제거합니다. 유지하려면 끄세요. |
| pretty | boolean | No | `false` | 몇 줄로 최소화하는 대신 읽기 쉽도록 출력을 들여쓰기 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## Notes {#notes}

- 입력은 SVG 또는 SVGZ 파일이어야 합니다. 래스터 이미지는 `400` 및 코드 `IMAGE_UNDECODABLE`으로 거부됩니다.
- `.svgz` 입력은 먼저 압축이 풀리며, 출력은 항상 일반 `.svg`입니다.
- SVG는 압축을 푼 뒤 10 MB로 제한됩니다. 더 큰 파일은 `400` 및 코드 `SVG_TOO_LARGE`로 거부됩니다.
- `viewBox`와 `<title>`는 항상 유지되므로 그래픽은 계속 확대·축소되고 접근성 이름도 보존됩니다.
- 입력과 출력 모두 SVG 새니타이저를 거치며, 스크립트와 기타 활성 콘텐츠가 제거됩니다.
- 경로가 많은 작업물에서는 `precision`을 낮추는 것이 가장 큰 용량 절감 방법입니다. 0~2에서는 결과를 눈으로 확인하세요.
