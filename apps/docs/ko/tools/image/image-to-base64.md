---
description: "HTML, CSS 등에 임베드할 수 있도록 이미지를 base64 데이터 URI로 변환합니다."
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: 42a27094655d
---

# 이미지를 Base64로 {#image-to-base64}

하나 이상의 이미지를 base64 인코딩된 문자열과 데이터 URI로 변환합니다. 선택적 형식 변환, 품질 제어, 크기 조정을 지원합니다. HTML, CSS, JSON 또는 이메일 템플릿에 이미지를 직접 임베드하는 데 유용합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

하나 이상의 이미지 파일과 선택적 JSON `settings` 필드가 포함된 multipart 폼 데이터를 받습니다.

## 파라미터 {#parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| outputFormat | string | 아니오 | `"original"` | 인코딩 전 변환: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | 아니오 | `80` | 손실 형식의 출력 품질(1에서 100) |
| maxWidth | number | 아니오 | `0` | 최대 너비(픽셀, 0 = 크기 조정 없음, 확대하지 않음) |
| maxHeight | number | 아니오 | `0` | 최대 높이(픽셀, 0 = 크기 조정 없음, 확대하지 않음) |

## 예제 요청 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

여러 파일:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## 예제 응답 {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## 응답 필드 {#response-fields}

| 필드 | 타입 | 설명 |
|-------|------|-------------|
| results | array | 성공적으로 변환된 이미지 |
| errors | array | 처리에 실패한 이미지(파일 이름과 오류 메시지 포함) |

### Result 객체 {#result-object}

| 필드 | 타입 | 설명 |
|-------|------|-------------|
| filename | string | 원본 파일 이름 |
| mimeType | string | 인코딩된 출력의 MIME 타입 |
| width | number | 최종 너비(픽셀, 크기 조정 후) |
| height | number | 최종 높이(픽셀, 크기 조정 후) |
| originalSize | number | 원본 파일 크기(바이트) |
| encodedSize | number | base64 문자열 크기(바이트) |
| overheadPercent | number | 원본 대비 크기 차이 비율(양수 = 더 큼, 음수 = 더 작음) |
| base64 | string | 원시 base64 인코딩 이미지 데이터 |
| dataUri | string | `src` 속성에 바로 사용할 수 있는 완전한 데이터 URI |

## 참고 {#notes}

- Base64 인코딩은 일반적으로 바이너리 파일에 비해 크기를 약 33% 늘립니다. `overheadPercent` 필드는 실제 차이를 보여줍니다.
- `outputFormat`이 `"original"`일 때 HEIC/HEIF 파일은 JPEG로 변환됩니다(브라우저가 데이터 URI에서 HEIC를 표시할 수 없기 때문).
- `maxWidth` 및 `maxHeight` 옵션은 `withoutEnlargement`와 함께 `fit: inside`을 사용하여 크기를 조정하므로, 지정된 치수보다 작은 이미지는 확대되지 않습니다.
- 단일 요청에서 여러 파일을 처리할 수 있습니다. 각 파일은 독립적으로 처리되며, 실패가 다른 파일의 성공을 막지 않습니다.
- SVG 파일은 재인코딩 없이 `image/svg+xml`로 통과됩니다(형식 변환을 요청하지 않는 한).
- 이것은 읽기 전용 엔드포인트입니다. 다운로드 가능한 파일이나 `jobId`를 만들어 내지 않습니다. base64 데이터는 응답 본문에 직접 반환됩니다.
