---
description: "패턴 템플릿을 사용하여 여러 파일의 이름을 바꾸고 ZIP으로 다운로드합니다."
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: 0fb2e63efe9d
---

# Bulk Rename {#bulk-rename}

인덱스, 자릿수를 맞춘 인덱스, 원본 파일명에 대한 자리 표시자가 있는 패턴 템플릿을 사용하여 여러 파일의 이름을 바꿉니다. 이름이 바뀐 모든 파일을 담은 ZIP 아카이브를 반환합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

여러 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| pattern | string | 아니요 | `"image-{{index}}"` | 자리 표시자가 있는 이름 지정 패턴 (최대 1000자) |
| startIndex | number | 아니요 | `1` | 시작 인덱스 번호 |

### 패턴 자리 표시자 {#pattern-placeholders}

| 자리 표시자 | 설명 | 예시 |
|-------------|-------------|---------|
| `{{index}}` | `startIndex`부터 시작하는 순차 번호 | `1`, `2`, `3` |
| `{{padded}}` | 0으로 채워진 순차 번호 | `01`, `02`, `03` |
| `{{original}}` | 확장자 없는 원본 파일명 | `photo`, `IMG_001` |

원본 파일 확장자는 항상 보존됩니다.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

다음을 생성합니다: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

원본 파일명 사용:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

다음을 생성합니다: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## 응답 예시 {#example-response}

응답은 (JSON 응답이 아닌) 직접 스트리밍되는 ZIP 파일입니다. 응답 헤더는 다음과 같습니다:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## 참고 사항 {#notes}

- 이 도구는 이미지를 처리하지 않습니다. 파일 이름만 바꾸고 ZIP 아카이브로 패키징합니다.
- `{{padded}}`의 0 채우기 자릿수는 전체 파일 수에 따라 자동으로 결정됩니다(예: 100개 파일은 3자리 채우기 사용: `001`, `002` 등).
- 파일 확장자는 원본 파일명에서 보존됩니다.
- 파일명은 안전하지 않은 문자를 제거하도록 정리됩니다.
- 최소 하나의 파일이 제공되어야 합니다.
