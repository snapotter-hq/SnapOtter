---
description: "사용자 지정 색상과 오류 정정 수준으로 QR 코드를 생성합니다."
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: 3280f77117cb
---

# QR Code Generator {#qr-code-generator}

텍스트나 URL로부터 크기, 오류 정정 수준, 사용자 지정 전경/배경 색상을 설정할 수 있는 QR 코드 이미지를 생성합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

**JSON body**를 허용합니다(multipart 아님). 파일 업로드가 필요 없습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | QR 코드에 인코딩할 콘텐츠(1~2000자) |
| size | number | No | `400` | 출력 이미지 너비/높이(픽셀, 100~10000) |
| errorCorrection | string | No | `"M"` | 오류 정정 수준: `L` (7%), `M` (15%), `Q` (25%), `H` (30%) |
| foreground | string | No | `"#000000"` | QR 코드 전경/모듈 색상(hex, `#RRGGBB`) |
| background | string | No | `"#FFFFFF"` | QR 코드 배경 색상(hex, `#RRGGBB`) |
| logoDataUri | string | No | - | 데이터 URI 형식의 로고 이미지(`data:image/png;base64,...` 또는 `data:image/jpeg;base64,...`, 최대 700 KB). QR 크기의 22%로 QR 코드 중앙에 배치됩니다. 오류 정정을 `H`으로 강제합니다 |

### Error Correction Levels {#error-correction-levels}

| Level | Recovery | Use Case |
|-------|----------|----------|
| `L` | ~7% | 최대 데이터 밀도 |
| `M` | ~15% | 균형(기본값) |
| `Q` | ~25% | 인쇄된 코드에 적합 |
| `H` | ~30% | 로고 오버레이가 있는 코드에 최적 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

사용자 지정 색상의 브랜드 QR 코드:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notes {#notes}

- 이 엔드포인트는 이미지 업로드가 필요 없으므로 multipart form data가 아니라 JSON을 허용합니다.
- 출력은 항상 PNG 이미지입니다.
- 출력 파일 이름은 항상 `qrcode.png`입니다.
- 이 도구는 이미지를 처음부터 생성하므로 `originalSize`는 항상 0입니다.
- QR 코드 주위에 2모듈 여백(quiet zone)이 포함됩니다.
- 최대 텍스트 길이는 2000자입니다. 실제 용량은 오류 정정 수준과 문자 인코딩에 따라 달라집니다.
- 오류 정정 수준이 높을수록 QR 코드가 부분적으로 가려져도 스캔 가능하지만 데이터 용량은 줄어듭니다.
- `logoDataUri`가 제공되면, 로고가 중앙을 가려도 QR 코드가 스캔 가능하도록 오류 정정이 자동으로 `H` (30%)로 강제됩니다.
