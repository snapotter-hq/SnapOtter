---
description: "이미지에서 주요 색상을 색상 팔레트로 추출합니다."
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: 4fb84b7b8924
---

# 색상 팔레트 {#color-palette}

이미지에서 주요 색상을 추출하여 16진수 색상 값으로 반환합니다. 양자화된 빈도 분석을 사용하여 가장 두드러지고 시각적으로 뚜렷한 색상을 식별합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

이미지 파일과 선택적 JSON `settings` 필드가 포함된 multipart 폼 데이터를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| count | integer | 아니요 | `8` | 추출할 색상 수 (2~16) |
| format | string | 아니요 | `"hex"` | 색상 형식: `hex`, `rgb`, `hsl` |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## 응답 예시 {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## 응답 필드 {#response-fields}

| 필드 | 유형 | 설명 |
|-------|------|-------------|
| filename | string | 정제된 파일 이름 |
| colors | array | 요청한 형식의 색상 문자열 배열, 우세도 순으로 정렬(가장 빈번한 것부터) |
| hex | array | 16진수 색상 문자열 배열(`format` 설정과 관계없이 항상 16진수) |
| count | number | 추출된 색상 수 |

## 참고 사항 {#notes}

- 최대 `count`개의 주요 색상(기본 8, 범위 2~16)을 빈도순(가장 흔한 것부터)으로 정렬하여 반환합니다.
- 이미지는 분석을 위해 내부적으로 100x100 픽셀로 크기가 조정되므로, 팔레트는 작은 세부 사항보다는 전체적인 색상 분포를 나타냅니다.
- 색상은 픽셀 집단을 범위가 가장 넓은 채널을 따라 재귀적으로 분할하는 중앙값 절단(median-cut) 양자화를 사용해 추출됩니다.
- 알파 채널은 분석 전에 제거되므로 투명한 영역은 고려되지 않습니다.
- 이 엔드포인트는 읽기 전용입니다. 다운로드 가능한 출력 파일이나 `jobId`을(를) 생성하지 않습니다.
- HEIC, RAW, PSD, SVG 입력은 분석 전에 자동으로 디코딩됩니다.
