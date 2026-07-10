---
description: "이미지에서 QR 코드, 바코드, 2D 코드를 스캔하여 주석이 달린 출력을 생성합니다."
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: d6f9a1f4f654
---

# Barcode Reader {#barcode-reader}

업로드된 이미지에서 모든 유형의 바코드와 QR 코드를 스캔합니다. 감지된 각 코드에 대해 디코딩된 텍스트, 바코드 유형, 위치 데이터를 반환합니다. 또한 감지된 코드 주위에 색상이 지정된 경계 상자가 있는 주석 이미지를 생성합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

이미지 파일과 선택적 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | 아니요 | `true` | 읽기 어려운 바코드를 위한 적극적인 스캔 모드 활성화 (느리지만 더 철저함) |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## 응답 예시 {#example-response}

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## 응답 필드 {#response-fields}

| 필드 | 유형 | 설명 |
|-------|------|-------------|
| filename | string | 원본 파일명 |
| barcodes | array | 감지된 바코드 객체 배열 |
| annotatedUrl | string 또는 null | 주석 이미지 다운로드 URL (바코드가 없으면 null) |
| previewUrl | string 또는 null | annotatedUrl과 동일 (프론트엔드 미리보기 호환성용) |

### 바코드 객체 {#barcode-object}

| 필드 | 유형 | 설명 |
|-------|------|-------------|
| type | string | 바코드 형식 (QRCode, EAN-13, Code128, DataMatrix, PDF417 등) |
| text | string | 바코드의 디코딩된 내용 |
| position | object | topLeft, topRight, bottomLeft, bottomRight 좌표가 있는 경계 상자 |

## 지원되는 바코드 유형 {#supported-barcode-types}

1D 바코드: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

2D 바코드: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## 참고 사항 {#notes}

- 바코드 감지에는 zxing-wasm 라이브러리를 사용합니다.
- 주석 이미지는 감지된 각 바코드에 색상이 지정된 다각형 경계 상자와 번호가 매겨진 레이블을 오버레이합니다.
- 단일 이미지에서 최대 255개의 바코드를 감지할 수 있습니다.
- 바코드가 없으면 `barcodes`은(는) 빈 배열이고 `annotatedUrl`은(는) null입니다.
- `tryHarder` 모드는 처리 시간을 대가로 더 철저한 스캔을 수행합니다. 깨끗하고 정렬이 잘 된 바코드를 더 빠르게 처리하려면 비활성화하세요.
- 주석 출력은 항상 PNG 형식입니다.
- HEIC, RAW, PSD, SVG 입력은 스캔 전에 자동으로 디코딩됩니다.
- 처리 전에 EXIF 방향이 자동으로 적용됩니다.
