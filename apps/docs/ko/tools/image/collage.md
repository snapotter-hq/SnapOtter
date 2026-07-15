---
description: "25개 이상의 템플릿, 조정 가능한 간격과 모서리, 셀별 이동 및 확대/축소로 여러 이미지를 그리드 콜라주로 결합합니다."
i18n_source_hash: cd50a782239d
i18n_provenance: human
i18n_output_hash: 5f0f00e8ca46
---

# 콜라주 및 그리드 {#collage-grid}

25개 이상의 템플릿으로 여러 이미지를 아름다운 그리드 콜라주로 결합합니다. 사용자 지정 간격, 모서리 반경, 배경색, 셀별 이동/확대·축소 컨트롤을 갖춘 2~9개 이미지 레이아웃을 지원합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/collage`

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| templateId | string | 예 | - | 템플릿 레이아웃 ID (예: `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | 아니요 | - | `imageIndex`, `panX`, `panY`, `zoom`, `objectFit`을(를) 담은 셀별 설정 배열 |
| cells[].imageIndex | integer | 예 | - | 이 셀에 배치할 이미지의 인덱스 (0부터 시작) |
| cells[].panX | number | 아니요 | 0 | 수평 이동 오프셋 (-100 ~ 100) |
| cells[].panY | number | 아니요 | 0 | 수직 이동 오프셋 (-100 ~ 100) |
| cells[].zoom | number | 아니요 | 1 | 확대/축소 수준 (1 ~ 10) |
| cells[].objectFit | string | 아니요 | `"cover"` | 이미지가 셀을 채우는 방식: `cover` 또는 `contain` |
| gap | number | 아니요 | 8 | 셀 간 간격(픽셀) (0 ~ 500) |
| cornerRadius | number | 아니요 | 0 | 각 셀의 모서리 반경(픽셀) (0 ~ 500) |
| backgroundColor | string | 아니요 | `"#FFFFFF"` | 배경색(16진수 또는 `"transparent"`) |
| aspectRatio | string | 아니요 | `"free"` | 캔버스 화면비: `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | 아니요 | `"png"` | 출력 형식: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | 아니요 | 90 | 출력 품질 (1 ~ 100) |

## 사용 가능한 템플릿 {#available-templates}

| 템플릿 ID | 이미지 | 레이아웃 |
|-------------|--------|--------|
| `2-h-equal` | 2 | 동일한 두 개의 열 |
| `2-v-equal` | 2 | 동일한 두 개의 행 |
| `2-h-left-large` | 2 | 왼쪽 2/3, 오른쪽 1/3 |
| `2-h-right-large` | 2 | 왼쪽 1/3, 오른쪽 2/3 |
| `3-left-large` | 3 | 큰 왼쪽, 오른쪽에 두 개 세로 배치 |
| `3-right-large` | 3 | 왼쪽에 두 개 세로 배치, 큰 오른쪽 |
| `3-top-large` | 3 | 큰 위쪽, 아래에 두 개의 열 |
| `3-h-equal` | 3 | 동일한 세 개의 열 |
| `3-v-equal` | 3 | 동일한 세 개의 행 |
| `4-grid` | 4 | 2x2 그리드 |
| `4-left-large` | 4 | 큰 왼쪽, 오른쪽에 세 개 세로 배치 |
| `4-top-large` | 4 | 큰 위쪽, 아래에 세 개의 열 |
| `4-bottom-large` | 4 | 위에 세 개의 열, 큰 아래쪽 |
| `5-top2-bottom3` | 5 | 위에 두 개, 아래에 세 개 |
| `5-top3-bottom2` | 5 | 위에 세 개, 아래에 두 개 |
| `5-left-large` | 5 | 큰 왼쪽, 오른쪽에 네 개 세로 배치 |
| `5-center-large` | 5 | 큰 가운데, 네 모서리 |
| `6-grid-2x3` | 6 | 2열 x 3행 |
| `6-grid-3x2` | 6 | 3열 x 2행 |
| `6-top-large` | 6 | 큰 위쪽, 아래에 다섯 개의 열 |
| `7-mosaic` | 7 | 모자이크 레이아웃 |
| `8-mosaic` | 8 | 모자이크 레이아웃 |
| `9-grid` | 9 | 3x3 그리드 |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## 참고 사항 {#notes}

- multipart 요청에 여러 이미지 파일을 업로드하세요. 이미지는 업로드 순서대로 템플릿 셀에 할당됩니다.
- 템플릿이 지원하는 것보다 많은 이미지가 업로드되면 초과된 이미지는 무시됩니다.
- HEIC, RAW, PSD, SVG 입력 형식을 지원합니다(자동 디코딩).
- 캔버스 기본 크기는 가장 긴 변 기준 2400px이며, 선택한 화면비에 따라 조정됩니다.
- `aspectRatio`이(가) `"free"`일 때 캔버스는 기본적으로 4:3(2400x1800)으로 설정됩니다.
- 셀별 `panX`/`panY` 값은 셀 내에서 크롭 창을 이동합니다. 값이 100이면 한쪽 가장자리로 완전히 이동하고, -100이면 반대쪽으로 이동합니다.
- `"transparent"` 배경색은 `png`, `webp` 또는 `avif` 출력 형식에서만 유지됩니다.
