---
description: "페이지 크기, 방향, 목표 파일 크기 옵션과 함께 하나 이상의 이미지를 PDF 문서로 결합합니다."
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: 2858baee8272
---

# 이미지를 PDF로 {#image-to-pdf}

하나 이상의 이미지를 PDF 문서로 결합합니다. 여러 페이지 크기, 방향, 여백, 그리고 품질 조정을 통한 선택적 파일 크기 목표 설정을 지원합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

하나 이상의 이미지 파일과 JSON `settings` 필드가 포함된 multipart 폼 데이터를 받습니다.

## 파라미터 {#parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| pageSize | string | 아니오 | `"A4"` | 페이지 크기: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | 아니오 | `"portrait"` | 페이지 방향: `portrait` 또는 `landscape` |
| margin | number | 아니오 | `20` | 페이지 여백(포인트 단위, 0-500) |
| targetSize | object | 아니오 | - | 목표 파일 크기 제약(아래 참조) |
| collate | boolean | 아니오 | `true` | 모든 이미지를 하나의 PDF로 결합. `false`이면 이미지마다 하나의 PDF를 생성합니다. |

### Target Size 객체 {#target-size-object}

| 필드 | 타입 | 필수 | 설명 |
|-------|------|----------|-------------|
| value | number | 예 | 목표 크기 값 |
| unit | string | 예 | 단위: `KB` 또는 `MB` |

최소 목표 크기는 50 KB입니다.

## 예제 요청 {#example-request}

기본 다중 이미지 PDF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

파일 크기 목표 사용:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

이미지당 하나의 PDF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## 예제 응답(결합됨) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## 예제 응답(비결합) {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## 예제 응답(목표 크기 사용) {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## 참고 {#notes}

- 이미지는 페이지 중앙에 배치되며 종횡비를 유지하면서 여백 안에 맞도록 크기가 조정됩니다. 이미지는 절대 확대되지 않습니다.
- `collate`이 `false`이면 각 이미지가 별도의 PDF 파일이 되고, 다운로드는 모든 PDF가 담긴 ZIP 아카이브입니다.
- 목표 크기 기능은 JPEG 품질 수준(10-95)에 대한 반복적인 이진 검색을 사용하여 예산 안에 맞는 최상의 품질을 찾습니다.
- 투명 이미지는 PDF에 임베드되기 전에 흰색으로 병합됩니다.
- 지원되는 입력 형식: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG 등.
- EXIF 방향은 임베드 전에 자동으로 적용됩니다.
