---
description: "행과 열 또는 픽셀 크기로 하나의 이미지를 격자 타일로 분할하며, ZIP 아카이브로 반환합니다."
i18n_source_hash: 838f5fa791b0
i18n_provenance: human
i18n_output_hash: 12cc7ec531f9
---

# 이미지 분할 {#image-splitting}

단일 이미지를 열/행 개수 또는 특정 픽셀 크기로 격자 타일로 분할합니다. 모든 타일을 담은 ZIP 아카이브를 반환합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/split`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | No | 3 | 분할할 열 개수 (1 ~ 100) |
| rows | integer | No | 3 | 분할할 행 개수 (1 ~ 100) |
| tileWidth | integer | No | - | 타일 너비(픽셀, 최소 10). `tileWidth`와 `tileHeight`가 모두 설정되면 `columns`을 재정의합니다. |
| tileHeight | integer | No | - | 타일 높이(픽셀, 최소 10). `tileWidth`와 `tileHeight`가 모두 설정되면 `rows`을 재정의합니다. |
| outputFormat | string | No | `"original"` | 타일 출력 형식: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | 손실 형식의 출력 품질 (1 ~ 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Example Response {#example-response}

응답은 `Content-Type: application/zip`과 함께 ZIP 파일로 직접 스트리밍됩니다. 파일명은 `split-<jobId>.zip` 패턴을 따릅니다.

ZIP 내부의 각 타일은 `<originalBaseName>_r<row>_c<col>.<ext>`으로 이름이 지정됩니다 (예: `photo_r1_c1.png`, `photo_r2_c3.webp`).

## Notes {#notes}

- 단일 이미지 파일을 받습니다.
- HEIC, RAW, PSD, SVG 입력 형식을 지원합니다(자동으로 디코딩됨).
- `tileWidth`과 `tileHeight`이 모두 제공되면 `columns`/`rows`보다 우선합니다. 격자 크기는 `ceil(imageWidth / tileWidth)`과 `ceil(imageHeight / tileHeight)`로 계산됩니다.
- 이미지 크기가 균등하게 나누어떨어지지 않으면 가장자리 타일(맨 오른쪽 열, 맨 아래 행)이 지정된 타일 크기보다 작을 수 있습니다.
- 최대 격자 크기는 100x100(10,000개 타일)으로 제한됩니다.
- 응답은 ZIP를 직접 스트리밍하므로 JSON 응답 본문이 없습니다. curl에서 파일을 저장하려면 `--output`을 사용하세요.
