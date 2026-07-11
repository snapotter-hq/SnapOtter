---
description: "base64 데이터 URI가 포함된 초소형 저품질 이미지 플레이스홀더를 생성합니다."
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: 24d35198c423
---

# LQIP 플레이스홀더 {#lqip-placeholder}

소스 이미지에서 초소형 저품질 이미지 플레이스홀더(LQIP)를 생성합니다. 작은 플레이스홀더 파일과 함께 base64 데이터 URI, 바로 사용할 수 있는 HTML `<img>` 태그, 즉시 임베드용 CSS `background-image` 스니펫을 반환합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

이미지 파일과 JSON `settings` 필드가 포함된 multipart 폼 데이터를 받습니다.

## 파라미터 {#parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| width | integer | 아니오 | `16` | 목표 너비(픽셀, 4-64) |
| blur | number | 아니오 | `2` | 흐림 전략의 흐림 반경(0-20) |
| strategy | string | 아니오 | `"blur"` | 플레이스홀더 전략: `blur`, `pixelate`, 또는 `solid` |
| format | string | 아니오 | `"webp"` | 출력 형식: `webp`, `png`, 또는 `jpeg` |
| quality | integer | 아니오 | `50` | 출력 품질(1-100) |

## 예제 요청 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## 예제 응답 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## 참고 {#notes}

- `dataUri` 필드에는 추가 요청 없이 `src` 속성이나 CSS에 바로 사용할 수 있는 완전한 데이터 URI가 들어 있습니다.
- `html` 및 `css` 필드는 일반적인 사용 사례를 위한 복사-붙여넣기 스니펫을 제공합니다.
- `blur` 전략은 부드러운 흐림 썸네일을 만들어 냅니다. `pixelate` 전략은 각진 모자이크를 만듭니다. `solid` 전략은 단일 평균 색상을 반환합니다.
- 일반적인 플레이스홀더 크기는 200-500바이트이므로 HTML에 직접 인라인하기에 적합합니다.
- 높이는 소스 이미지의 종횡비를 유지하도록 자동으로 계산됩니다.
- HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
