---
description: "합성을 위해 위치, 불투명도, 혼합 모드로 이미지를 레이어링합니다."
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: 76b833682d88
---

# 이미지 합성 {#image-composition}

구성 가능한 위치, 불투명도, 혼합 모드로 기본 이미지 위에 오버레이 이미지를 레이어링합니다. 로고, 그래픽을 합성하거나 여러 이미지를 결합하는 데 유용합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/compose`

**두 개의** 이미지 파일과 JSON `settings` 필드가 포함된 multipart 폼 데이터를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| x | number | 아니요 | `0` | 왼쪽 상단 모서리에서 오버레이의 수평 오프셋(픽셀) (최소 0) |
| y | number | 아니요 | `0` | 왼쪽 상단 모서리에서 오버레이의 수직 오프셋(픽셀) (최소 0) |
| opacity | number | 아니요 | `100` | 오버레이 불투명도 백분율 (0 ~ 100) |
| blendMode | string | 아니요 | `"over"` | 합성 혼합 모드 |

### 혼합 모드 {#blend-modes}

| 값 | 설명 |
|-------|-------------|
| `over` | 일반 오버레이 (기본값) |
| `multiply` | 픽셀 값을 곱하여 어둡게 |
| `screen` | 반전, 곱셈, 다시 반전하여 밝게 |
| `overlay` | 기본 밝기에 따라 곱셈과 스크린을 결합 |
| `darken` | 각 레이어에서 더 어두운 픽셀을 유지 |
| `lighten` | 각 레이어에서 더 밝은 픽셀을 유지 |
| `hard-light` | 강한 대비 오버레이 |
| `soft-light` | 은은한 대비 오버레이 |
| `difference` | 레이어 간 절대 차이 |
| `exclusion` | difference와 유사하지만 대비가 낮음 |

### 파일 필드 {#file-fields}

| 필드 이름 | 필수 | 설명 |
|------------|----------|-------------|
| file | 예 | 기본/배경 이미지 |
| overlay | 예 | 오버레이/전경 이미지 |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

multiply 혼합 모드 사용:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## 참고 사항 {#notes}

- 두 이미지는 합성 전에 검증되고 디코딩됩니다(HEIC, RAW, PSD, SVG 지원).
- 오버레이는 `x` 및 `y`에 의해 지정된 정확한 픽셀 좌표에 배치됩니다. 맞추기 위해 크기가 조정되지 않습니다.
- 불투명도가 100 미만이면 혼합 전에 오버레이에 알파 마스크가 적용됩니다.
- 오버레이는 기본 이미지 경계를 넘어 확장될 수 있습니다(잘립니다).
- 처리 전에 두 이미지 모두에 EXIF 방향이 자동으로 적용됩니다.
- 출력 크기는 기본 이미지 크기와 일치합니다.
