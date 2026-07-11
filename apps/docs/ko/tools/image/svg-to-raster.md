---
description: "사용자 지정 해상도와 DPI로 SVG 파일을 PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF 또는 JXL로 변환하며 배치 처리를 지원합니다."
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: ee6d4199ea8c
---

# SVG to Raster {#svg-to-raster}

사용자 지정 해상도와 DPI로 SVG 파일을 래스터 이미지 형식(PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF 또는 JXL)으로 변환합니다. 여러 SVG의 배치 변환도 지원합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | 목표 너비(픽셀, 1 ~ 65536). 한 치수만 설정하면 종횡비를 유지합니다. |
| height | integer | No | - | 목표 높이(픽셀, 1 ~ 65536). 한 치수만 설정하면 종횡비를 유지합니다. |
| dpi | integer | No | 300 | 렌더링 DPI, 기본 래스터화 밀도를 제어 (36 ~ 2400) |
| quality | number | No | 90 | 손실 형식의 출력 품질 (1 ~ 100) |
| backgroundColor | string | No | `"#00000000"` | 배경 색상(hex, 6자 또는 8자, 8자는 알파 포함) |
| outputFormat | string | No | `"png"` | 출력 형식: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Batch Endpoint {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

한 번의 요청으로 여러 SVG 파일을 변환합니다. ZIP 아카이브를 반환합니다.

### Additional Batch Parameters {#additional-batch-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| clientJobId | string | No | - | 진행 상황 추적을 위한 선택적 클라이언트 제공 작업 ID(최대 128자) |

### Batch Example Request {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Batch Response {#batch-response}

배치 엔드포인트는 다음 헤더와 함께 ZIP 파일을 직접 스트리밍합니다:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Notes {#notes}

- SVG와 SVGZ 파일만 받습니다(확장자뿐 아니라 내용도 검증). SVGZ는 자동으로 압축 해제됩니다.
- SVG 내용은 XSS와 외부 리소스 로딩을 방지하기 위해 렌더링 전에 정화됩니다.
- `dpi` 설정은 SVG가 래스터화되는 밀도를 제어합니다. DPI가 높을수록 동일한 SVG 뷰포트에서 더 큰 픽셀 치수가 생성됩니다.
- `width`와 `height`이 모두 제공되면 이미지는 `fit: inside`을 사용해 리사이즈됩니다(경계 내에서 종횡비 유지).
- 브라우저가 기본적으로 표시할 수 없는 형식(TIFF, HEIF)의 경우 응답에 `previewUrl`가 포함됩니다. 미리보기는 1200px WebP 썸네일입니다.
- 기본 배경 `#00000000`은 완전히 투명합니다. 흰색 배경을 원하면 `#FFFFFF`로 설정하세요(투명도를 지원하지 않는 JPEG 출력에 유용).
- 배치 처리는 `MAX_BATCH_SIZE` 서버 구성을 준수하며 성능을 위해 동시 워커를 사용합니다.
- 배치 작업의 진행 상황은 `/api/v1/jobs/:jobId/progress`의 SSE를 통해 추적할 수 있습니다.
