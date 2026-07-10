---
description: "Code 128, EAN-13, UPC-A, Code 39, ITF-14, Data Matrix 형식으로 바코드를 생성합니다."
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: 29dbc7c506e9
---

# Barcode Generator {#barcode-generator}

텍스트 입력으로부터 바코드 이미지를 생성합니다. Code 128, EAN-13, UPC-A, Code 39, ITF-14, Data Matrix 형식을 지원합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

`application/json` 본문(multipart 아님)을 받습니다. 바코드는 업로드된 파일이 아닌 제공된 텍스트로부터 생성됩니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| text | string | 예 | - | 바코드에 인코딩할 텍스트 (1-256자) |
| type | string | 아니요 | `"code128"` | 바코드 형식: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | integer | 아니요 | `3` | 이미지 배율 계수 (1-8) |
| includeText | boolean | 아니요 | `true` | 바코드 아래에 텍스트를 렌더링할지 여부 |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## 참고 사항 {#notes}

- 대부분의 도구와 달리, 바코드는 업로드된 파일이 아닌 텍스트로부터 생성되므로 이 엔드포인트는 multipart form data가 아닌 JSON 본문을 받습니다.
- EAN-13은 정확히 12자리 또는 13자리를 요구합니다. UPC-A는 정확히 11자리 또는 12자리를 요구합니다. 검사 숫자가 생략된 경우 자동으로 계산됩니다.
- Code 128은 가장 유연한 형식이며 전체 ASCII 문자 집합을 지원합니다.
- Data Matrix는 더 긴 문자열을 작은 정사각형에 인코딩하기에 적합한 2D 바코드를 생성합니다.
