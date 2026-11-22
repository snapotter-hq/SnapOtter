---
description: "화면 비율을 유지하는 데 필요한 나머지 너비 또는 높이를 계산하고 비율을 약분합니다."
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: 0fd4eca6092b
i18n_hash_version: 2
---

# 화면 비율 계산기 {#aspect-ratio-calculator}

원본 너비와 높이를 입력한 다음 새 너비 또는 새 높이를 입력하면, 비율이 유지되도록 나머지 변을 계산해 줍니다. 비율은 가장 간단한 형태로 반환되므로 1920 × 1080은 16:9가 됩니다. 웹 앱에서는 일반적인 비율(16:9, 4:3, 3:2, 1:1, 21:9, 9:16, 4:5)에서 시작할 수 있고, 가로 방향과 세로 방향을 전환할 수 있습니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

multipart form data가 아닌 JSON 본문을 받으며, 다운로드할 파일 대신 숫자로 응답합니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `width` | number | (필수) | 원본 너비. |
| `height` | number | (필수) | 원본 높이. |
| `newWidth` | number | - | 목표 너비. 응답은 이 값으로 `newHeight` 값을 계산합니다. |
| `newHeight` | number | - | 목표 높이. 응답은 이 값으로 `newWidth` 값을 계산합니다. |
| `round` | boolean | `true` | 계산된 변을 정수로 반올림합니다. `false`이면 소수점 이하 두 자리를 유지합니다. |

모든 치수는 `0.0001` 이상 `1000000` 이하여야 합니다. `newWidth` 또는 `newHeight` 중 하나만 보내세요. 둘 다 생략하면 약분된 비율만 반환됩니다.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## 응답 예시 {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

요청에서 둘 다 보내지 않으면 `newWidth`와 `newHeight`는 `null`입니다.

## 참고 사항 {#notes}

- 소수 크기는 소수점 이하 최대 네 자리까지 사용해 정수 비율로 약분되므로, `8.5` × `11`은 `17:22`로 반환됩니다.
- `ratioDecimal`은 너비를 높이로 나눈 값이며 소수점 이하 네 자리로 반올림됩니다.
- 계산된 변은 `0`으로 반환되지 않습니다. 반올림을 켜면 최소 `1`, 끄면 최소 `0.01`입니다.
- `newWidth`와 `newHeight`를 모두 보내거나 허용 범위를 벗어난 치수를 보내면 400이 반환됩니다.
- 이 계산기는 파일을 읽거나 쓰지 않습니다. 계산한 숫자를 적용하려면 [이미지 크기 조정](/ko/tools/image/resize) 또는 [이미지 크롭](/ko/tools/image/crop)을 사용하세요.
