---
description: "지각적 해싱을 사용하여 중복 및 유사 중복 이미지를 감지합니다."
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: 4cbb238eaa80
---

# 중복 찾기 {#find-duplicates}

여러 이미지를 업로드하여 지각적 해싱(dHash)으로 중복 및 유사 중복 이미지를 감지합니다. 유사한 이미지를 그룹으로 묶고, 각 그룹에서 가장 품질이 좋은 버전을 식별하며, 절약 가능한 공간을 계산합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

여러 이미지 파일과 선택적 JSON `settings` 필드가 포함된 multipart 폼 데이터를 받습니다.

## 파라미터 {#parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| threshold | number | 아니오 | `8` | 이미지를 중복으로 간주할 최대 해밍 거리(0에서 20). 낮을수록 더 엄격한 매칭 |

### 파일 필드 {#file-fields}

multipart 요청에 최소 2개의 이미지 파일을 업로드하세요(모두 `file` 필드 이름 사용, 또는 파일 파트의 경우 임의의 필드 이름 사용).

## 예제 요청 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## 예제 응답 {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## 응답 필드 {#response-fields}

| 필드 | 타입 | 설명 |
|-------|------|-------------|
| totalImages | number | 성공적으로 분석된 이미지 수 |
| duplicateGroups | array | 중복 이미지 그룹 |
| uniqueImages | number | 어떤 중복 그룹에도 속하지 않는 이미지 수 |
| spaceSaveable | number | 최적이 아닌 중복을 제거하여 절약할 수 있는 총 바이트 수 |
| skippedFiles | array | 처리할 수 없었던 파일(파일 이름과 사유 포함) |

### 중복 그룹 객체 {#duplicate-group-object}

| 필드 | 타입 | 설명 |
|-------|------|-------------|
| groupId | number | 그룹 식별자 |
| files | array | 이 중복 그룹에 속한 이미지 |

### 파일 객체(그룹 내부) {#file-object-within-a-group}

| 필드 | 타입 | 설명 |
|-------|------|-------------|
| filename | string | 원본 파일 이름 |
| similarity | number | 기준 이미지(그룹의 첫 번째)와의 유사도 비율 |
| width | number | 이미지 너비(픽셀) |
| height | number | 이미지 높이(픽셀) |
| fileSize | number | 파일 크기(바이트) |
| format | string | 이미지 형식 |
| isBest | boolean | 가장 품질이 좋은 버전인지 여부(픽셀 수 최다, 파일 크기 최대) |
| thumbnail | string 또는 null | 미리보기용 Base64 JPEG 썸네일(너비 200px) |

## 참고 {#notes}

- 지각적 유사도 감지를 위해 128비트 dHash(64비트 행 + 64비트 열)를 사용합니다. 크기 조정, 재압축, 사소한 편집을 거친 경우에도 중복을 잡아냅니다.
- threshold는 해시 간 최대 해밍 거리를 나타냅니다. 기본값 8은 오탐을 피하면서 유사 중복을 잡아냅니다. 픽셀 단위로 동일한 것만 찾으려면 0을, 매우 느슨한 매칭에는 15-20을 사용하세요.
- 각 그룹에서 "최적" 이미지는 픽셀 수(너비 x 높이)가 가장 많은 것이며, 동점일 경우 파일 크기로 결정합니다.
- 최소 2개의 이미지가 필요합니다. 검증 또는 디코딩에 실패한 파일은 전체 요청을 실패시키지 않고 `skippedFiles`에 보고됩니다.
- 썸네일은 데이터 URI로 인코딩된 너비 200px JPEG 미리보기입니다.
- 모든 일반 형식이 지원됩니다(HEIC, RAW, PSD, SVG는 자동으로 디코딩됨).
