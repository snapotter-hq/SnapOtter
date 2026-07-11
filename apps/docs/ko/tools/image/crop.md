---
description: "위치와 치수로 영역을 지정하여 이미지를 자릅니다."
i18n_source_hash: aab38ccd7c53
i18n_provenance: human
i18n_output_hash: de94f3937d00
---

# 자르기 {#crop}

위치와 크기를 사용하여 직사각형 영역을 정의해 이미지를 자릅니다. 픽셀 단위와 백분율 단위를 모두 지원합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/crop`

이미지 파일과 JSON `settings` 필드가 포함된 multipart 폼 데이터를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| left | number | 예 | - | 자르기 영역의 X 오프셋(왼쪽 가장자리 기준) |
| top | number | 예 | - | 자르기 영역의 Y 오프셋(위쪽 가장자리 기준) |
| width | number | 예 | - | 자르기 영역의 너비 |
| height | number | 예 | - | 자르기 영역의 높이 |
| unit | string | 아니요 | `"px"` | 값의 단위: `px` 또는 `percent` |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

백분율 값을 사용한 자르기:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## 참고 사항 {#notes}

- 자르기 영역은 이미지 경계 안에 들어와야 합니다. 영역이 이미지를 넘어가면 요청이 실패합니다.
- `percent` 단위를 사용할 때 값은 이미지 치수의 백분율을 나타냅니다(예: `left: 10`은(는) 왼쪽 가장자리에서 10%를 의미).
- 출력 형식은 입력 형식과 일치합니다.
- 자르기 전에 EXIF 방향이 자동으로 적용되므로 좌표는 시각적으로 올바른 방향에 대응합니다.
