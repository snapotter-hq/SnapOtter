---
description: "내장된 이미지를 압축하여 PDF 파일 크기를 줄입니다."
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: 0d4bcd6775bc
---

# Compress PDF {#compress-pdf}

내장된 이미지를 다운샘플링하여 PDF 파일 크기를 줄입니다. 품질 슬라이더와 목표 파일 크기 중에서 선택할 수 있습니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

PDF 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | 압축 모드: `quality` 또는 `targetSize` |
| quality | integer | No | `75` | 압축 품질, 1-100 (높을수록 압축이 적음). `quality` 모드에서 사용됨 |
| targetSizeKb | number | No | - | 목표 파일 크기(킬로바이트). `targetSize` 모드에서 사용됨 |

## Example Request {#example-request}

품질로 압축:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

목표 크기로 압축:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- `quality` 모드에서는 값이 낮을수록 파일이 작아지지만 이미지 열화가 심해집니다.
- `targetSize` 모드에서는 이진 탐색으로 요청한 크기에 맞는 가장 높은 DPI를 찾습니다.
- 압축이 오히려 파일을 키우게 되는 경우, 원본 바이트가 변경 없이 반환됩니다.
- 텍스트와 벡터 콘텐츠는 영향을 받지 않으며, 내장된 래스터 이미지만 다운샘플링됩니다.
