---
description: "AVIF, JXL, HEIC와 같은 최신 형식을 포함하여 이미지를 형식 간에 변환합니다."
i18n_source_hash: 562f8270e8c3
i18n_provenance: human
i18n_output_hash: 4d24e322a7ac
---

# 변환 {#convert}

이미지를 형식 간에 변환합니다. 일반적인 웹 형식은 물론 HEIC, JXL, BMP, ICO, JP2, QOI, PSD와 같은 특수 형식도 지원합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/convert`

이미지 파일과 JSON `settings` 필드가 포함된 multipart 폼 데이터를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| format | string | 예 | - | 목표 형식: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | 아니요 | - | 출력 품질(1~100). jpg, webp, avif, heic와 같은 손실 형식에 적용됩니다. |

## 지원되는 출력 형식 {#supported-output-formats}

| 형식 | 유형 | 비고 |
|--------|------|-------|
| jpg | 손실 | JPEG, 최고의 호환성 |
| png | 무손실 | 투명도 지원 |
| webp | 둘 다 | 최신 웹 형식, 우수한 압축 |
| avif | 손실 | 차세대 형식, 탁월한 압축 |
| tiff | 둘 다 | 인쇄/출판 워크플로 |
| gif | 무손실 | 256색으로 제한 |
| heic / heif | 손실 | Apple 생태계 형식 |
| jxl | 둘 다 | JPEG XL, 차세대 형식 |
| bmp | 무손실 | 비압축 비트맵 |
| ico | 무손실 | Windows 아이콘 형식 |
| jp2 | 손실 | JPEG 2000 |
| qoi | 무손실 | Quite OK Image 형식 |
| psd | 레이어 | Adobe Photoshop(ImageMagick 필요) |
| ppm | 무손실 | Portable Pixmap (PPM/PGM/PBM) |
| eps | 벡터 | Encapsulated PostScript |
| tga | 무손실 | Targa 이미지 형식 |

## 요청 예시 {#example-request}

WebP로 변환:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

PNG로 변환(무손실):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## 참고 사항 {#notes}

- 출력 파일 이름 확장자는 목표 형식에 맞게 자동으로 업데이트됩니다.
- SVG 입력은 변환 전에 300 DPI로 래스터화됩니다.
- PSD 변환에는 서버에 ImageMagick이 설치되어 있어야 합니다.
- BMP, EPS, ICO, JP2, JXL, PPM, QOI, TGA는 특수 CLI 인코더를 사용하며 Sharp 처리를 우회합니다.
- HEIC/HEIF 인코딩은 시스템 HEIC 인코더 라이브러리를 사용합니다.
- 입력 형식은 광범위합니다: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW(CR2, NEF, ARW 등), PSD, SVG, BMP 등.
