---
description: "폭탄 보호 기능으로 ZIP 아카이브에서 파일을 안전하게 추출합니다."
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: 68034faafde1
---

# ZIP 추출 {#extract-zip}

ZIP 아카이브에서 파일을 안전하게 추출합니다. 단일 파일 아카이브는 포함된 파일을 직접 반환하고, 다중 파일 아카이브는 추출된 내용이 담긴 평면 ZIP을 반환합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

ZIP 파일이 포함된 multipart form data를 받습니다. settings 필드는 필요하지 않습니다.

## 매개변수 {#parameters}

이 도구에는 설정 가능한 매개변수가 없습니다. 추출할 `.zip` 파일을 업로드하세요.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## 참고 사항 {#notes}

- `.zip` 파일만 입력으로 허용됩니다.
- 아카이브에 파일이 하나만 포함된 경우, 그 파일이 직접 반환됩니다(ZIP으로 감싸지지 않음).
- 아카이브에 여러 파일이 포함된 경우, 모든 파일이 루트 레벨로 추출된 평면 ZIP이 반환됩니다(중첩 디렉터리 구조는 평탄화됨).
- 내장된 폭탄 보호 기능이 리소스 고갈을 방지하기 위해 과도한 압축 비율이나 파일 개수를 가진 아카이브를 거부합니다.
