---
description: "여러 파일을 하나의 ZIP 아카이브로 묶습니다."
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: f25192b26a01
---

# ZIP 만들기 {#create-zip}

모든 유형의 여러 파일을 하나의 ZIP 아카이브로 묶습니다. 중복된 파일명은 자동으로 중복 제거됩니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

둘 이상의 파일이 포함된 multipart form data를 받습니다. settings 필드는 필요하지 않습니다.

## 매개변수 {#parameters}

이 도구에는 설정 가능한 매개변수가 없습니다. 묶을 파일 2-50개를 유형에 관계없이 업로드하세요.

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## 참고 사항 {#notes}

- 2개에서 50개 사이의 입력 파일이 필요합니다.
- 모든 파일 유형이 허용되며, 입력 형식에 제한이 없습니다.
- 여러 파일이 같은 이름을 공유하는 경우, 숫자 접미사를 붙여 자동으로 중복 제거됩니다.
- 출력 아카이브는 표준 ZIP 압축(deflate)을 사용합니다.
