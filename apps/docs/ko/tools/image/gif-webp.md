---
description: "모든 프레임을 보존하면서 애니메이션 GIF를 WebP로, 그리고 그 반대로 변환합니다."
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: b8ae49d6aba7
---

# GIF/WebP 변환기 {#gif-webp-converter}

애니메이션 GIF 파일을 WebP로, 그리고 그 반대로 변환하며 모든 프레임과 애니메이션 타이밍을 보존합니다. WebP 애니메이션은 일반적으로 동등한 GIF보다 25-35% 더 작습니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

GIF 또는 WebP 파일과 JSON `settings` 필드가 포함된 multipart 폼 데이터를 받습니다.

## 파라미터 {#parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| quality | integer | 아니오 | `80` | WebP 인코딩의 출력 품질(1-100) |
| lossless | boolean | 아니오 | `false` | 무손실 WebP 압축 사용 |
| resizePercent | integer | 아니오 | `100` | 출력을 비율로 조정(10-100) |

## 예제 요청 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## 예제 응답 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## 참고 {#notes}

- `.gif` 및 `.webp` 파일만 허용됩니다. 다른 이미지 형식은 이 도구에서 지원되지 않습니다.
- 변환 방향은 자동입니다: GIF 입력은 WebP 출력을, WebP 입력은 GIF 출력을 만들어 냅니다.
- `quality` 및 `lossless` 옵션은 WebP로 인코딩할 때만 적용됩니다. GIF로 변환할 때 출력은 표준 GIF 팔레트를 사용합니다.
- 큰 애니메이션의 치수(및 파일 크기)를 줄이려면 `resizePercent`을 사용하세요.
