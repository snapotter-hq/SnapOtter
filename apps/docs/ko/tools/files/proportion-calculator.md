---
description: "비례식(삼수법)을 풀어 세 개의 알려진 값으로 X를 구합니다."
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: d2958a9aa75c
i18n_hash_version: 2
---

# Proportion Calculator {#proportion-calculator}

비례식(내항과 외항의 곱 계산)으로 삼수법을 풉니다. 세 값을 입력하고 정비례인지 반비례인지 고르면 네 번째 값을 얻습니다. 답이 나온 뒤에도 값이 폼에 남아 있으므로 숫자 하나를 바꾸고 Enter를 눌러 다음 계산을 해 볼 수 있습니다.

이 도구는 수학 비례 계산기이며, 사진 구도용 삼분할 격자가 아닙니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

multipart form data가 아닌 JSON 본문을 받으며, 다운로드할 파일 대신 숫자로 응답합니다.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `a` | number | (필수) | 첫 번째 알려진 값. |
| `b` | number | (필수) | `a`와(과) 짝이 되는 값. |
| `c` | number | (필수) | 세 번째 알려진 값. X는 이 값과 짝이 되는 값입니다. |
| `mode` | string | `direct` | `direct` 또는 `inverse`. |

| Mode | Reads as | Formula | Example |
|------|----------|---------|---------|
| `direct` | A 대 B는 C 대 X | X = B × C ÷ A | 사과 3개가 6이면 10개는 20 |
| `inverse` | A × B = C × X | X = A × B ÷ C | 작업자 4명이 6일 걸리면 8명은 3일 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/proportion-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"a": 3, "b": 6, "c": 10, "mode": "direct"}'
```

## Example Response {#example-response}

```json
{
  "mode": "direct",
  "x": 20
}
```

## Notes {#notes}

- 답은 유효숫자 15자리로 반올림되므로 `0.1 × 3 ÷ 3`은(는) `0.1`(으)로 반환되며 `0.10000000000000002`이(가) 되지 않습니다.
- 정비례에서는 `a`이(가) `0`일 수 없고, 반비례에서는 `c`이(가) `0`일 수 없습니다. 각각 나누는 수이기 때문입니다. 어느 쪽이든 400을 반환합니다.
- double이 담을 수 있는 범위를 벗어나는 답(약 `1.8e308`보다 크거나, 정밀도를 유지하기에는 0에 너무 가까운 경우)은 400을 반환합니다.
- 웹 앱에서는 `1,5` 또는 `1.5`을(를) 입력할 수 있으며 아랍-인도 숫자나 데바나가리 숫자도 사용할 수 있습니다. 천 단위 구분 기호는 허용되지 않습니다.
