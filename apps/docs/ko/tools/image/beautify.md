---
description: "밋밋한 스크린샷을 그라디언트 배경, 기기 프레임, 그림자, 소셜 미디어 크기 조정으로 세련된 이미지로 만듭니다."
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: f96cdfb1cb86
---

# Beautify Screenshot {#beautify-screenshot}

스크린샷에 그라디언트 배경, 기기 프레임, 그림자, 워터마크, 소셜 미디어 크기 조정을 추가합니다. 제품 마케팅, 소셜 미디어, 문서용의 세련된 이미지를 만드는 데 이상적입니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| backgroundType | string | 아니요 | `"linear-gradient"` | 배경 유형: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | string | 아니요 | `"#667eea"` | 단색 배경 색상 (`backgroundType`이(가) `solid`일 때 사용) |
| gradientStops | array | 아니요 | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | 그라디언트 색상 정지점 (최소 2개). 각 정지점은 `color`(16진수)과 `position`(0-100)을 가집니다. |
| gradientAngle | number | 아니요 | 135 | 그라디언트 각도 (0 ~ 360) |
| padding | number | 아니요 | 64 | 이미지 주위의 여백 픽셀 (0 ~ 256) |
| borderRadius | number | 아니요 | 12 | 스크린샷의 모서리 반경 (0 ~ 64) |
| shadowPreset | string | 아니요 | `"subtle"` | 그림자 프리셋: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | number | 아니요 | 20 | 사용자 지정 그림자 블러 반경 (0 ~ 100, `shadowPreset`이(가) `custom`일 때 사용) |
| shadowOffsetX | number | 아니요 | 0 | 사용자 지정 그림자 수평 오프셋 (-50 ~ 50) |
| shadowOffsetY | number | 아니요 | 10 | 사용자 지정 그림자 수직 오프셋 (-50 ~ 50) |
| shadowColor | string | 아니요 | `"#000000"` | 16진수 형식의 사용자 지정 그림자 색상 |
| shadowOpacity | number | 아니요 | 30 | 사용자 지정 그림자 불투명도 (0 ~ 100) |
| frame | string | 아니요 | `"none"` | 기기 또는 창 프레임: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | string | 아니요 | - | 창 프레임 제목 표시줄에 표시되는 제목 텍스트 |
| socialPreset | string | 아니요 | `"none"` | 소셜 미디어 크기로 조정: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | string | 아니요 | - | 선택적 워터마크 텍스트 오버레이 |
| watermarkPosition | string | 아니요 | `"bottom-right"` | 워터마크 위치: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | number | 아니요 | 50 | 워터마크 불투명도 (0 ~ 100) |
| outputFormat | string | 아니요 | `"png"` | 출력 형식: `png`, `jpeg`, `webp` |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### 배경 이미지 사용 {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## 참고 사항 {#notes}

- 두 개의 파일 필드를 받습니다: `file`(필수, 메인 스크린샷)과 `backgroundImage`(선택, `backgroundType`이(가) `image`일 때 사용).
- HEIC, RAW, PSD, SVG 입력 형식을 지원합니다(자동 디코딩).
- 그림자 프리셋은 특정 값에 매핑됩니다:
  - `subtle`: 블러 20, offsetY 4, 불투명도 20%
  - `medium`: 블러 40, offsetY 10, 불투명도 35%
  - `dramatic`: 블러 80, offsetY 20, 불투명도 50%
- 소셜 미디어 프리셋은 `contain` 모드를 사용하여 최종 출력을 대상 크기에 맞게 조정합니다:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- 기기 프레임(`iphone`, `macbook`, `ipad`)은 이미지 주위에 하드웨어 베젤을 적용하고 `borderRadius` 설정을 건너뜁니다.
- 투명도가 필요한 경우(그림자, 모서리 반경, 기기 프레임, 투명 배경), `jpeg`을(를) 선택하더라도 출력은 PNG로 강제됩니다.
- 이미지 배경은 파이프라인/배치 모드에서 지원되지 않습니다.
