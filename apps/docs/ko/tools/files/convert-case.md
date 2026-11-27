---
description: "텍스트를 대문자, 소문자, 제목 형식, 문장 형식 등으로 바꿉니다."
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: 90dc6d69a419
i18n_hash_version: 2
---

# Convert Case {#convert-case}

텍스트를 붙여넣고 대소문자 형식을 고른 뒤 결과를 복사합니다. 텍스트는 사용자의 SnapOtter 서버로만 전송되고 다른 곳으로는 전송되지 않습니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

multipart form data가 아닌 JSON 본문을 받으며, 다운로드할 파일 대신 변환된 텍스트로 응답합니다.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (필수) | 변환할 텍스트. 최대 1,000,000자. |
| `mode` | string | (필수) | 아래 모드 중 하나. |
| `locale` | string | (없음) | `tr`, `de` 같은 BCP 47 언어 태그로, 언어에 따라 대소문자가 달라지는 문자에 사용합니다. 지정하지 않으면 모든 언어에서 대소문자 처리가 동일합니다. |

| Mode | Input | Output |
|------|-------|--------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Example Response {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Notes {#notes}

- `title`은(는) 짧은 영어 단어(a, an, and, of, the, to 등)를 줄의 처음이나 끝에 오지 않는 한 소문자로 유지합니다. `capitalized`은(는) 모든 단어의 첫 글자를 대문자로 바꿉니다.
- `sentence`은(는) 텍스트의 시작, 줄 바꿈 뒤, 그리고 `.`, `!`, `?`, `…` 뒤에 공백이 오는 위치에서 새 문장을 시작하므로, `snapotter.com`이나 `3.5`의 점은 계산되지 않습니다.
- `camel`, `pascal`, `snake`, `kebab`은(는) 공백, 문장 부호, 기존 대소문자 변화 지점(`XMLHttpRequest`은(는) `xml_http_request`이(가) 됩니다)에서 나누며 각 줄을 따로 변환합니다.
- `locale`을(를) `tr`(으)로 설정하면 `i`은(는) `İ`(으)로 대문자 변환되고 `I`은(는) `ı`(으)로 소문자 변환됩니다. 독일어 `ß`은(는) 모든 로캘에서 `SS`(으)로 대문자 변환됩니다.
- 웹 앱은 현재 인터페이스 언어를 `locale`(으)로 전송합니다.
