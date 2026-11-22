---
description: "텍스트를 Base64로 인코딩하거나 Base64를 텍스트로 디코딩합니다."
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: e800c876cf30
i18n_hash_version: 2
---

# Base64 Encode / Decode {#base64}

텍스트를 붙여넣으면 Base64가 되고, Base64를 붙여넣으면 원래 텍스트로 돌아오며, 결과를 복사할 수 있습니다. 텍스트는 사용자의 SnapOtter 서버로만 전송되고 다른 곳으로는 전송되지 않습니다.

이미지를 Base64로 변환하려면 대신 [Image to Base64](/ko/tools/image/image-to-base64)를 사용하세요.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/base64`

multipart form data가 아닌 JSON 본문을 받으며, 다운로드할 파일 대신 변환된 텍스트로 응답합니다.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (필수) | 인코딩할 텍스트 또는 디코딩할 Base64. 최대 1,000,000자. |
| `mode` | string | (필수) | `encode` 또는 `decode`. |
| `urlSafe` | boolean | `false` | 인코딩할 때 URL 안전 알파벳(`-` 및 `_`)을 사용하고 `=` 패딩을 생략합니다. 디코딩할 때는 무시됩니다. |

## Example Request {#example-request}

인코딩:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

디코딩:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Example Response {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Notes {#notes}

- 텍스트는 UTF-8로 인코딩되므로 악센트 문자, CJK, 이모지도 손상 없이 왕복 변환됩니다.
- 디코딩은 공백과 줄 바꿈을 무시하므로, 76열로 줄 바꿈된 Base64(이메일, PEM 본문)도 붙여넣은 그대로 디코딩됩니다.
- 디코딩은 `=` 패딩이 있든 없든, 표준(`+`, `/`) 또는 URL 안전(`-`, `_`) 알파벳 어느 쪽이든 받아들이지만, 두 가지가 섞인 입력은 받아들이지 않습니다.
- Base64가 아닌 입력은 400과 코드 `ENCODED_TEXT_INVALID`(으)로 실패합니다. 유효한 Base64이지만 UTF-8 텍스트가 아닌 바이너리 데이터(이미지, ZIP)로 디코딩되는 경우에는 `DECODED_DATA_NOT_TEXT`(으)로 실패합니다.
