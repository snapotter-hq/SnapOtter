---
description: "픽셀 수준의 차이 시각화 및 유사도 점수와 함께 두 이미지를 나란히 비교합니다."
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: ee5f8510e4b3
---

# 이미지 비교 {#image-compare}

두 이미지를 업로드하여 픽셀 수준의 차이 맵과 수치적 유사도 백분율을 계산합니다. 출력은 변경된 영역을 빨간색으로 강조 표시하는 차이 이미지입니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/compare`

**두 개의** 이미지 파일이 포함된 multipart 폼 데이터를 받습니다. 설정 필드는 필요하지 않습니다.

## 매개변수 {#parameters}

이 도구에는 구성 가능한 매개변수가 없습니다. 정확히 두 개의 이미지 파일을 업로드하세요.

| 필드 | 유형 | 필수 | 설명 |
|-------|------|----------|-------------|
| file (첫 번째) | file | 예 | 첫 번째 이미지 |
| file (두 번째) | file | 예 | 두 번째 이미지 |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## 응답 필드 {#response-fields}

| 필드 | 유형 | 설명 |
|-------|------|-------------|
| jobId | string | 차이 이미지를 다운로드하기 위한 작업 식별자 |
| similarity | number | 두 이미지 간의 백분율 유사도 (0 ~ 100) |
| dimensions | object | 비교에 사용된 너비와 높이 |
| downloadUrl | string | 생성된 차이 이미지를 다운로드할 URL |
| originalSize | number | 두 입력 이미지의 합산 크기(바이트) |
| processedSize | number | 차이 출력 이미지의 크기(바이트) |

## 참고 사항 {#notes}

- 두 이미지는 비교 전에 동일한 크기(각 축의 최대값)로 조정됩니다.
- 차이 이미지는 변화의 크기에 비례하는 불투명도로 차이를 빨간색으로 강조 표시합니다. 동일하거나 거의 동일한 픽셀(차이 < 10)은 원본의 반투명 버전으로 표시됩니다.
- 유사도는 모든 픽셀에 걸친 평균 픽셀 차이의 역수로 계산되어 백분율로 표현됩니다.
- 유사도가 100%이면 이미지가 픽셀 단위로 동일함을 의미합니다(비교 해상도에서).
- 차이 출력은 입력 형식과 관계없이 항상 PNG 형식입니다.
- 두 이미지는 비교 전에 검증되고 디코딩됩니다(HEIC, RAW, PSD, SVG 지원).
- 처리 전에 두 이미지 모두에 EXIF 방향이 자동으로 적용됩니다.
