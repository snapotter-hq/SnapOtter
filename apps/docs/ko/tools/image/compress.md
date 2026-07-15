---
description: "품질 수준 또는 목표 파일 크기로 이미지 파일 크기를 줄입니다."
i18n_source_hash: 342c5cf1f864
i18n_provenance: human
i18n_output_hash: 63d2f45fe4ca
---

# 이미지 압축 {#compress}

품질 수준 또는 킬로바이트 단위의 목표 파일 크기를 지정하여 이미지 파일 크기를 줄입니다. 이 도구는 반복적인 이진 검색을 사용하여 크기 목표를 정확히 맞춥니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/compress`

이미지 파일과 JSON `settings` 필드가 포함된 multipart 폼 데이터를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| mode | string | 아니요 | `"quality"` | 압축 모드: `quality` 또는 `targetSize` |
| quality | number | 아니요 | `80` | 품질 수준(1~100). 모드가 `quality`일 때 사용됩니다. |
| targetSizeKb | number | 아니요 | - | 킬로바이트 단위의 목표 파일 크기. 모드가 `targetSize`일 때 사용됩니다. |

## 요청 예시 {#example-request}

품질 60으로 압축:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

목표 크기 200 KB로 압축:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## 참고 사항 {#notes}

- `quality` 모드에서는 값이 낮을수록 파일이 작아지고 압축 아티팩트가 더 많아집니다. 웹 사용에는 80 정도가 좋은 기본값입니다.
- `targetSize` 모드에서는 엔진이 목표를 초과하지 않으면서 최대한 가깝게 맞추기 위해 반복적인 압축을 수행합니다.
- 출력 형식은 입력 형식과 일치합니다. 압축은 형식의 기본 인코딩에 적용됩니다(예: JPEG 파일의 경우 JPEG 품질, WebP 파일의 경우 WebP 품질).
- 기본 품질(80)이 적절하다면 `quality` 매개변수를 완전히 생략할 수 있습니다.
