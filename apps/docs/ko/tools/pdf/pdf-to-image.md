---
description: "PDF 페이지를 고품질 이미지로 변환합니다."
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: 14ab51070e40
---

# PDF to Image {#pdf-to-image}

PDF 페이지를 고품질 래스터 이미지로 변환합니다. 페이지 선택, 다양한 출력 형식, DPI 제어, 색상 모드를 지원합니다. 변환 전에 PDF를 검사할 수 있는 info 및 preview 하위 경로를 포함합니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"png"` | 출력 형식: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | No | 150 | 렌더링 해상도(36에서 2400). DPI가 높을수록 더 크고 세밀한 이미지를 생성합니다. |
| quality | number | No | 85 | 손실 형식의 출력 품질(1에서 100) |
| colorMode | string | No | `"color"` | 색상 모드: `color`, `grayscale`, `bw` (흑백 임계값) |
| pages | string | No | `"all"` | 페이지 선택: `all`, 단일 페이지(`3`), 범위(`1-5`), 또는 쉼표로 구분(`1,3,5-8`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

페이지를 렌더링하지 않고 PDF의 페이지 수를 반환합니다.

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Info Response {#info-response}

```json
{
  "pageCount": 10
}
```

## Preview Sub-Route {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

모든 페이지의 저해상도 JPEG 썸네일을 base64 data URL로 반환합니다. 페이지 선택 UI를 구축하는 데 유용합니다.

### Preview Request {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Preview Response {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Notes {#notes}

- MuPDF를 사용하여 PDF를 렌더링하므로 올바른 글꼴 렌더링과 벡터 그래픽을 갖춘 고충실도 출력을 제공합니다.
- 비밀번호로 보호된 PDF는 지원되지 않으며 400 오류를 반환합니다.
- `pages` 매개변수는 유연한 문법을 지원합니다:
  - `"all"` 또는 `""` - 모든 페이지
  - `"3"` - 단일 페이지
  - `"1-5"` - 페이지 범위(양 끝 포함)
  - `"1,3,5-8"` - 개별 페이지와 범위 혼합
- 페이지 번호는 1부터 시작합니다. 문서 길이를 초과하는 페이지를 지정하면 400 오류를 반환합니다.
- 메인 엔드포인트는 항상 개별 페이지 다운로드와 선택된 모든 페이지가 담긴 ZIP을 모두 생성합니다.
- preview 엔드포인트는 72 DPI로 렌더링하고 빠른 썸네일 생성을 위해 너비 300px로 크기를 조정합니다. 썸네일은 60% 품질의 JPEG입니다.
- preview 엔드포인트는 `MAX_PDF_PAGES` 서버 구성을 준수하여 생성되는 썸네일 수를 제한합니다.
- 높은 DPI의 대용량 문서의 경우 처리 시간이 비례하여 증가합니다. 웹용으로는 낮은 DPI(150)를, 인쇄용으로는 높은 DPI(300-600)를 사용하는 것을 고려하세요.
