---
description: "상세한 이미지 메타데이터, 속성 및 채널별 히스토그램 통계를 확인합니다."
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: aef0fa4b0715
---

# 이미지 정보 {#image-info}

치수, 형식, 색 공간, EXIF/ICC/XMP 존재 여부, 채널별 히스토그램 통계를 포함한 포괄적인 이미지 메타데이터를 반환하는 읽기 전용 분석 도구입니다. 처리된 출력 파일을 만들어 내지 않습니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/info`

이미지 파일이 포함된 multipart 폼 데이터를 받습니다. 설정 필드가 필요 없습니다.

## 파라미터 {#parameters}

이 도구에는 설정 가능한 파라미터가 없습니다. 이미지 파일을 업로드하기만 하면 됩니다.

| 필드 | 타입 | 필수 | 설명 |
|-------|------|----------|-------------|
| file | file | 예 | 분석할 이미지 |

## 예제 요청 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## 예제 응답 {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## 응답 필드 {#response-fields}

| 필드 | 타입 | 설명 |
|-------|------|-------------|
| filename | string | 정제된 파일 이름 |
| fileSize | number | 파일 크기(바이트) |
| width | number | 이미지 너비(픽셀) |
| height | number | 이미지 높이(픽셀) |
| format | string | 감지된 형식(jpeg, png, webp 등) |
| channels | number | 색상 채널 수 |
| hasAlpha | boolean | 이미지에 알파 채널이 있는지 여부 |
| colorSpace | string | 색 공간(srgb, cmyk 등) |
| density | number 또는 null | DPI/PPI 해상도 |
| isProgressive | boolean | JPEG가 프로그레시브 인코딩을 사용하는지 여부 |
| orientation | number 또는 null | EXIF 방향 값(1-8) |
| hasProfile | boolean | ICC 프로필이 임베드되어 있는지 여부 |
| hasExif | boolean | EXIF 메타데이터가 있는지 여부 |
| hasIcc | boolean | ICC 색 프로필이 있는지 여부 |
| hasXmp | boolean | XMP 메타데이터가 있는지 여부 |
| bitDepth | string 또는 null | 샘플당 비트 수 |
| pages | number | 페이지 수(TIFF, GIF 같은 다중 페이지 형식의 경우) |
| histogram | array | 채널별 통계(최소, 최대, 평균, 표준 편차) |

## 참고 {#notes}

- 이것은 읽기 전용 엔드포인트입니다. 다운로드 가능한 출력 파일이나 `jobId`를 만들어 내지 않습니다.
- RAW 형식 이미지(DNG, CR2, NEF, ARW 등)의 경우, Sharp가 직접 읽을 수 없는 실제 센서 치수와 메타데이터 플래그를 추출하기 위해 ExifTool을 사용합니다.
- HEIC/HEIF 파일은 Sharp가 HEVC 픽셀을 디코딩할 수 없으므로 픽셀 통계를 추출하기 위해 내부적으로 PNG로 디코딩됩니다.
- 히스토그램은 전체 256-빈 분포가 아니라 채널별 최소/최대/평균/표준편차를 제공합니다.
- `density` 필드는 임베드된 DPI 메타데이터가 있는 경우 이를 반영합니다.
