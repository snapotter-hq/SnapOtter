---
description: "형식 변환, 품질 제어, 크기 조정, 메타데이터 제거로 웹 전송에 맞게 이미지를 최적화합니다."
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: f6cc8e883fb7
---

# Optimize for Web {#optimize-for-web}

단일 단계로 웹 전송에 맞게 이미지를 최적화합니다. 형식 변환, 품질 조정, 선택적 크기 조정, 프로그레시브 인코딩, 메타데이터 제거를 결합합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

이미지 파일과 JSON `settings` 필드가 포함된 multipart form data를 허용합니다.

실시간 매개변수 조정을 위해 처리된 이미지를 바이너리로 직접 반환하는(작업 공간 생성 없음) 라이브 미리 보기 엔드포인트도 `POST /api/v1/tools/image/optimize-for-web/preview`에서 사용할 수 있습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"webp"` | 출력 형식: `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | No | `80` | 출력 품질(1~100) |
| maxWidth | number | No | - | 최대 너비(픽셀). 이미지가 더 넓으면 축소됩니다. |
| maxHeight | number | No | - | 최대 높이(픽셀). 이미지가 더 크면 축소됩니다. |
| progressive | boolean | No | `true` | 프로그레시브/인터레이스 인코딩 활성화 |
| stripMetadata | boolean | No | `true` | EXIF, GPS, ICC, XMP 메타데이터 제거 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

적극적인 압축으로 AVIF 최적화:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### Preview Endpoint Response {#preview-endpoint-response}

미리 보기 엔드포인트(`/api/v1/tools/image/optimize-for-web/preview`)는 정보 헤더와 함께 바이너리 이미지를 직접 반환합니다:

- `X-Original-Size` - 원본 파일 크기(바이트)
- `X-Processed-Size` - 처리된 파일 크기(바이트)
- `X-Output-Filename` - URL 인코딩된 출력 파일 이름

## Notes {#notes}

- 이 도구는 웹 자산을 위한 원스톱 최적화 파이프라인으로 설계되었습니다. 형식 변환, 품질 조정, 최대 치수 제한, 메타데이터 제거를 단일 패스로 처리합니다.
- 출력 파일 이름 확장자는 선택한 형식과 일치하도록 업데이트됩니다.
- JXL(JPEG XL) 인코딩은 전용 CLI 인코더를 사용합니다. 이미지는 먼저 PNG로 처리된 다음 JXL로 인코딩됩니다.
- 프로그레시브 인코딩은 브라우저가 전체 이미지를 로드하기 전에 저품질 미리 보기를 렌더링할 수 있게 하여 JPEG와 PNG의 체감 로드 시간을 개선합니다.
- 미리 보기 엔드포인트는 더 가볍고(작업 공간/작업 생성 없음) 프런트엔드의 라이브 매개변수 조정 UI를 위한 것입니다.
