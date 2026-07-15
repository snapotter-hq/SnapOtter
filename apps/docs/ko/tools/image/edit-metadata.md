---
description: "픽셀을 다시 인코딩하지 않고 이미지의 EXIF, IPTC, GPS, XMP 메타데이터 필드를 편집합니다."
i18n_source_hash: 9271d3d8f278
i18n_provenance: human
i18n_output_hash: 8891cb76ddef
---

# 이미지 메타데이터 편집 {#edit-metadata}

EXIF, IPTC, GPS 좌표, 날짜, 키워드를 포함한 이미지 메타데이터 필드를 편집합니다. 내부적으로 ExifTool을 사용하므로 메타데이터가 픽셀 재인코딩 없이 제자리에서 기록되어 완전한 이미지 품질이 유지됩니다.

## API 엔드포인트 {#api-endpoints}

### 메타데이터 편집 {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

메타데이터 필드를 이미지에 기록하고 수정된 파일을 반환합니다.

### 메타데이터 검사 {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

ExifTool을 통해 이미지의 전체 메타데이터를 JSON으로 반환합니다. 이미지를 수정하지 않습니다.

## 매개변수 (편집) {#parameters-edit}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| title | string | 아니요 | - | 이미지 제목(XMP/EXIF) |
| author | string | 아니요 | - | 작성자 이름 |
| artist | string | 아니요 | - | 아티스트 이름(EXIF Artist 태그) |
| copyright | string | 아니요 | - | 저작권 표시 |
| imageDescription | string | 아니요 | - | 이미지 설명(EXIF) |
| software | string | 아니요 | - | 소프트웨어 태그 |
| dateTime | string | 아니요 | - | EXIF DateTime 값 |
| dateTimeOriginal | string | 아니요 | - | EXIF DateTimeOriginal 값 |
| setAllDates | string | 아니요 | - | 모든 날짜 필드를 한 번에 설정 |
| dateShift | string | 아니요 | - | 오프셋만큼 모든 날짜 이동(형식: `+HH:MM` 또는 `-HH:MM`) |
| clearGps | boolean | 아니요 | `false` | 모든 GPS 데이터 제거 |
| gpsLatitude | number | 아니요 | - | GPS 위도 설정 (-90 ~ 90) |
| gpsLongitude | number | 아니요 | - | GPS 경도 설정 (-180 ~ 180) |
| gpsAltitude | number | 아니요 | - | GPS 고도(미터) 설정 |
| keywords | string[] | 아니요 | - | 추가하거나 설정할 키워드/태그 |
| keywordsMode | string | 아니요 | `"add"` | 키워드 처리 방식: `add`(추가) 또는 `set`(대체) |
| fieldsToRemove | string[] | 아니요 | `[]` | 제거할 특정 메타데이터 필드 이름 목록 |
| iptcTitle | string | 아니요 | - | IPTC Object Name |
| iptcHeadline | string | 아니요 | - | IPTC Headline |
| iptcCity | string | 아니요 | - | IPTC City |
| iptcState | string | 아니요 | - | IPTC Province/State |
| iptcCountry | string | 아니요 | - | IPTC Country |

## 요청 예시 {#example-request}

작성자 및 저작권 설정:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

GPS 좌표 설정:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

GPS 제거 및 키워드 추가:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

메타데이터 검사:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## 응답 예시 (편집) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## 참고 사항 {#notes}

- 이 도구는 서버에 ExifTool이 설치되어 있어야 합니다. Docker 이미지에 포함되어 있습니다.
- 메타데이터는 제자리에서 기록되므로 픽셀 재인코딩이 발생하지 않습니다. 파일 크기 변화는 최소입니다(메타데이터 바이트만).
- `dateShift` 매개변수는 모든 날짜 필드를 지정된 오프셋만큼 이동하며, 시간대 오류를 수정하는 데 유용합니다(예: `+02:00` 또는 `-05:30`).
- 변경 사항이 요청되지 않으면(모든 매개변수가 생략되거나 비어 있으면) 원본 파일이 변경 없이 반환됩니다.
- 지원 형식: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF.
- 브라우저에서 미리 볼 수 없는 형식(HEIF, TIFF)의 경우, 응답에 WebP 미리 보기가 포함된 `previewUrl` 필드가 포함됩니다.
