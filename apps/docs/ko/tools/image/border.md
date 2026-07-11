---
description: "예측 가능하고 제어 가능한 순서로 이미지에 테두리, 여백, 둥근 모서리, 드롭 섀도를 추가합니다."
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: 66fd89f80522
---

# Border & Frame {#border-frame}

이미지에 테두리, 여백, 둥근 모서리, 드롭 섀도를 추가합니다. 이 도구는 여백, 테두리, 모서리 반경, 그림자 순서로 효과를 적용합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/border`

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| borderWidth | number | 아니요 | 10 | 테두리 두께 픽셀 (0 ~ 2000) |
| borderColor | string | 아니요 | `"#000000"` | 16진수 형식의 테두리 색상 (예: `#FF0000`) |
| padding | number | 아니요 | 0 | 이미지와 테두리 사이의 안쪽 여백 픽셀 (0 ~ 200) |
| paddingColor | string | 아니요 | `"#FFFFFF"` | 16진수 형식의 여백 채우기 색상 |
| cornerRadius | number | 아니요 | 0 | 모서리 반경 픽셀 (0 ~ 2000) |
| shadow | boolean | 아니요 | `false` | 드롭 섀도 추가 여부 |
| shadowBlur | number | 아니요 | 15 | 그림자 블러 반경 (1 ~ 200) |
| shadowOffsetX | number | 아니요 | 0 | 그림자 수평 오프셋 (-50 ~ 50) |
| shadowOffsetY | number | 아니요 | 5 | 그림자 수직 오프셋 (-50 ~ 50) |
| shadowColor | string | 아니요 | `"#000000"` | 16진수 형식의 그림자 색상 |
| shadowOpacity | number | 아니요 | 40 | 그림자 불투명도 백분율 (0 ~ 100) |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## 참고 사항 {#notes}

- 표준 `createToolRoute` 팩토리를 사용합니다. multipart 업로드를 통해 단일 이미지 파일을 받습니다.
- HEIC, RAW, PSD, SVG 입력 형식을 지원합니다(자동 디코딩).
- 처리 순서: 먼저 여백이 추가되고, 그다음 테두리가 감싸고, 그다음 모서리 반경이 적용되며, 마지막으로 그림자가 합성됩니다.
- `cornerRadius` 또는 `shadow`이(가) 활성화되면, 투명도를 유지하기 위해 출력이 (입력 형식에 관계없이) PNG로 강제됩니다. 알파를 지원하는 형식(PNG, WebP, AVIF)은 원래 형식을 유지합니다.
- 그림자는 형태를 인식합니다. 직사각형 그림자를 만드는 대신 둥근 모서리를 따라갑니다.
- `borderWidth`을(를) 0으로 설정하고 `cornerRadius` + `shadow`만 사용하면 프레임 없는 둥근 그림자 효과가 생성됩니다.
