---
description: "이미지에서 채널별 통계가 포함된 RGB 히스토그램 차트를 생성합니다."
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: e80390f6a76d
---

# 히스토그램 {#histogram}

이미지에서 RGB 히스토그램 차트를 생성합니다. 응답 JSON에 채널별 통계 및 원시 256-빈 히스토그램 데이터와 함께 PNG 히스토그램 이미지를 반환합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/histogram`

이미지 파일과 JSON `settings` 필드가 포함된 multipart 폼 데이터를 받습니다.

## 파라미터 {#parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| scale | string | 아니오 | `"linear"` | Y축 스케일: `linear` 또는 `log` |

## 예제 요청 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## 예제 응답 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## 참고 {#notes}

- `downloadUrl`은 R, G, B 및 휘도 분포를 보여주는 렌더링된 PNG 히스토그램 차트를 가리킵니다.
- `bins`에는 각 채널(빨강, 초록, 파랑, 휘도)에 대한 원시 256-값 배열이 들어 있어 사용자 지정 시각화 렌더링에 적합합니다.
- `stats`은 채널별 평균, 중앙값, 표준 편차를 제공합니다.
- `mean` 및 `max`은 하위 호환용 축약 필드입니다.
- 히스토그램이 몇 개의 피크에 지배되고 하위 빈의 디테일을 보고 싶을 때 `log` 스케일을 사용하세요.
- HEIC, RAW, PSD, SVG 입력은 분석 전에 자동으로 디코딩됩니다.
