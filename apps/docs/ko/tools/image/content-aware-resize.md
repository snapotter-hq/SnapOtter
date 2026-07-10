---
description: "낮은 중요도 경로를 따라 픽셀을 추가하거나 제거하여 핵심 콘텐츠와 얼굴을 보존하는 심 카빙(seam-carving) 크기 조정입니다."
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: 5caaed80e2b8
---

# 콘텐츠 인식 크기 조정 {#content-aware-resize}

시각적 중요도가 가장 낮은 경로를 따라 픽셀을 지능적으로 제거하거나 추가하는 심 카빙 크기 조정으로, 중요한 콘텐츠를 보존하고 선택적으로 얼굴을 보호합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**처리 방식:** 동기(결과를 직접 반환)

**모델 번들:** 기본 작동에는 필요하지 않습니다. 얼굴 보호가 활성화된 경우 `face-detection` 번들(200~300 MB)을 사용합니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| file | file | 예 | - | 이미지 파일(multipart) |
| width | number | 아니요 | - | 목표 너비(픽셀) |
| height | number | 아니요 | - | 목표 높이(픽셀) |
| protectFaces | boolean | 아니요 | `false` | 얼굴을 감지하고 심 제거로부터 보호 |
| blurRadius | number | 아니요 | `4` | 에너지 계산을 위한 전처리 블러 반경 (0~20) |
| sobelThreshold | number | 아니요 | `2` | 소벨 에지 감지 임계값(1~20). 값이 높을수록 알고리즘이 더 공격적으로 작동함 |
| square | boolean | 아니요 | `false` | 정사각형으로 크기 조정(더 작은 치수 사용) |

`width`, `height` 또는 `square` 중 하나 이상을 지정해야 합니다.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## 응답 (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## 참고 사항 {#notes}

- 이 사용자 지정 라우트는 현재 동기 200 응답을 반환합니다.
- 콘텐츠 인식 크기 조정에 `caire` 심 카빙 라이브러리를 사용합니다.
- 치수를 줄이기만 합니다(심 제거). 이미지를 원래 크기 이상으로 확장할 수 없습니다.
- `protectFaces` 옵션은 AI 얼굴 감지를 사용하여 얼굴 영역을 고에너지로 표시하여 심이 얼굴을 통과하지 못하게 합니다.
- `blurRadius`은(는) 에너지 맵 계산 전에 스무딩을 제어합니다. 값이 높을수록 에너지 맵이 더 균일해져 노이즈가 있는 이미지에 도움이 될 수 있습니다.
- `sobelThreshold`은(는) 에지가 얼마나 공격적으로 감지되는지에 영향을 미칩니다. 값이 낮을수록 더 미묘한 에지를 보존합니다.
- 출력은 항상 PNG 형식입니다.
- HEIC/HEIF, RAW, TGA, PSD, EXR, HDR 입력 형식을 자동 디코딩으로 지원합니다.
