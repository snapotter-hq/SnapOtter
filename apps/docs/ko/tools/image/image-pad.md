---
description: "단색, 투명 또는 흐림 배경으로 이미지를 목표 종횡비에 맞게 패딩합니다."
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: 669517accb38
---

# 이미지 패딩 {#image-pad}

주위에 단색, 투명 또는 흐림 배경을 추가하여 이미지를 목표 종횡비에 맞게 패딩합니다. 자르지 않고 소셜 미디어나 인쇄용 고정 종횡비에 이미지를 맞추는 데 유용합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

이미지 파일과 JSON `settings` 필드가 포함된 multipart 폼 데이터를 받습니다.

## 파라미터 {#parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| target | string | 아니오 | `"1:1"` | 목표 종횡비: `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, 또는 `custom` |
| ratioW | integer | 아니오 | `1` | 사용자 지정 비율 너비(1-100, target이 `custom`일 때 사용) |
| ratioH | integer | 아니오 | `1` | 사용자 지정 비율 높이(1-100, target이 `custom`일 때 사용) |
| background | string | 아니오 | `"color"` | 배경 모드: `color`, `transparent`, 또는 `blur` |
| color | string | 아니오 | `"#ffffff"` | 배경 hex 색상(background가 `color`일 때) |
| padding | integer | 아니오 | `0` | 캔버스 비율로 표현한 추가 패딩(0-50) |

## 예제 요청 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## 예제 응답 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## 참고 {#notes}

- `blur` 배경 모드는 원본 이미지의 흐린 복사본을 패딩 채우기로 만들어 시각적으로 조화로운 결과를 만들어 냅니다.
- `transparent` 배경을 사용하면 알파를 보존하기 위해 출력이 PNG로 변환됩니다.
- 투명도가 관련되지 않는 한 출력 형식은 입력 형식과 일치합니다. HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
- 임의의 종횡비(예: 3:2를 위한 `ratioW: 3, ratioH: 2`)를 위해서는 `target`를 `custom`로 설정하고 `ratioW` 및 `ratioH`을 제공하세요.
