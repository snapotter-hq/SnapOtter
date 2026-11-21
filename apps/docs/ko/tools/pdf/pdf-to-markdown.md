---
description: "PDF를 Markdown으로 변환하며, PDF에 있는 제목, 목록, 표를 유지합니다."
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: da61eee90f31
i18n_hash_version: 2
---

# PDF to Markdown {#pdf-to-markdown}

PDF를 Markdown 파일로 바꿔 위키, 정적 사이트, LLM 파이프라인에 바로 넣을 수 있습니다.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

PDF 파일이 포함된 multipart form data를 받습니다.

## Parameters {#parameters}

이 도구에는 구성 가능한 매개변수가 없습니다. PDF를 업로드하면 `.md` 파일을 받습니다.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

큰 PDF는 동기 대기 시간을 넘길 수 있습니다. 이때 API는 `202`와 `jobId`로 응답하며, 진행 상황은 `/api/v1/jobs/{jobId}/progress`에서 확인할 수 있습니다.

## What gets kept {#what-gets-kept}

PDF는 구조가 아니라 위치가 지정된 텍스트를 저장하므로, 변환기가 구조를 추정합니다.

- **제목.** 본문보다 확실히 큰 짧은 줄은 `#`부터 `######`까지의 제목이 되며, 문서 전체의 크기 순으로 단계가 정해집니다.
- **목록.** 글머리 기호나 숫자로 시작하는 줄은 목록 항목이 됩니다.
- **굵게, 기울임, 링크.** 인라인으로 유지됩니다. `http`, `https`, `mailto` 링크만 유지됩니다.
- **표.** 선으로 그린 표는 Markdown 표로 출력됩니다. 공백만으로 배치한 표는 대개 일반 문단으로 나옵니다.

이미지는 제거됩니다. 다단 레이아웃과 특이한 페이지 디자인은 최선을 다해 처리하므로, 사용하기 전에 출력을 확인하세요.

## Notes {#notes}

- 허용되는 입력 형식: `.pdf`.
- 응답의 `chars` 필드는 Markdown 출력의 길이입니다.
- 스캔된 PDF에는 변환할 텍스트 레이어가 없습니다. 이 도구는 빈 파일을 반환하는 대신 `422`와 코드 `NO_TEXT_LAYER`로 거부합니다. 그럴 때는 [PDF OCR](./ocr-pdf) 도구를 사용하세요.
- 왕복 변환에는 [Markdown to PDF](../files/markdown-to-pdf), [Markdown to DOCX](../files/markdown-to-docx), [Markdown to HTML](../files/markdown-to-html)를 사용할 수 있습니다. 이들은 `.md` 파일을 읽습니다.
