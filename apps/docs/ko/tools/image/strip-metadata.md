---
description: "개인정보 보호와 파일 크기 축소를 위해 이미지에서 EXIF, GPS, ICC, XMP 메타데이터를 제거합니다."
i18n_source_hash: e89147734fd0
i18n_provenance: human
i18n_output_hash: e5894cf9c431
---

# Remove Metadata {#remove-metadata}

이미지에서 EXIF, GPS, ICC 색상 프로파일, XMP 메타데이터를 제거합니다. 개인정보 보호(GPS 좌표, 카메라 정보 제거)와 파일 크기 축소에 유용합니다.

## API Endpoints {#api-endpoints}

### Strip Metadata {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

이미지를 처리하고 선택된 메타데이터가 제거된 정리된 버전을 반환합니다.

### Inspect Metadata {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

이미지를 수정하지 않고 파싱된 메타데이터를 JSON으로 반환합니다. 제거 전에 어떤 메타데이터가 존재하는지 미리 보는 데 유용합니다.

## Parameters (Strip) {#parameters-strip}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | No | `false` | EXIF 데이터 제거(카메라 설정, 날짜 등) |
| stripGps | boolean | No | `false` | GPS/위치 데이터만 제거 |
| stripIcc | boolean | No | `false` | ICC 색상 프로파일 제거 |
| stripXmp | boolean | No | `false` | XMP 메타데이터 제거(Adobe, IPTC) |
| stripAll | boolean | No | `true` | 모든 메타데이터를 한 번에 제거 |

`stripAll`가 `true`이면 개별 플래그를 재정의하고 모든 것을 제거합니다.

## Example Request {#example-request}

모든 메타데이터 제거:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

GPS 데이터만 제거(카메라 정보와 색상 프로파일 유지):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

수정 없이 메타데이터 검사:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response (Strip) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Example Response (Inspect) {#example-response-inspect}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "exif": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTimeOriginal": "2024:03:15 14:30:00",
    "ExposureTime": "1/250",
    "FNumber": 2.8,
    "ISO": 400
  },
  "gps": {
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 46, 30],
    "_latitude": 37.775,
    "_longitude": -122.4183
  },
  "icc": {
    "Profile Size": "3144 bytes",
    "Color Space": "RGB",
    "Description": "sRGB IEC61966-2.1"
  },
  "xmp": {
    "CreatorTool": "Adobe Photoshop 25.0"
  }
}
```

## Notes {#notes}

- 이미지는 제거 후 원본 형식으로 다시 인코딩됩니다. JPEG는 품질 90의 mozjpeg를, PNG는 압축 레벨 9를, WebP는 품질 85를 사용합니다.
- ICC 프로파일을 제거하면 이미지가 sRGB가 아닌 프로파일로 태그되어 있었을 경우 미묘한 색상 변화가 생길 수 있습니다. 색상 정확도가 중요하다면 `stripIcc: false`을 사용하세요.
- inspect 엔드포인트는 편의를 위해 GPS 좌표를 십진수 위도/경도 값(밑줄이 접두사로 붙음)으로 파싱합니다.
- 지원 입력 형식: JPEG, PNG, WebP, AVIF, TIFF, GIF.
