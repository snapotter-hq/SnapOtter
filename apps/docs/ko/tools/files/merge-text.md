---
description: "여러 텍스트 또는 Markdown 파일을 원하는 순서대로 하나로 합칩니다."
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: 02d452083402
i18n_hash_version: 2
---

# 텍스트 파일 병합 {#merge-text}

여러 텍스트 또는 Markdown 파일을 하나의 파일로 합칩니다. 파일은 업로드한 순서대로 이어 붙으므로, 순서가 중요하다면 실행 전에 파일 목록에서 순서를 바꾸세요.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

두 개 이상의 텍스트 파일과 선택 사항인 `settings` JSON 문자열이 담긴 멀티파트 폼 데이터를 받습니다.

## 매개변수 {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | 파일 사이에 넣을 내용: `"blank-line"`, `"rule"`(`---` 줄) 또는 `"filename-heading"`(각 파일 이름을 제목으로) |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## 참고 사항 {#notes}

- `.txt`, `.md`, `.markdown`, `.csv`, `.log` 파일을 받으며, 요청당 2개에서 50개까지 가능합니다.
- 모든 파일은 UTF-8 텍스트여야 합니다. 바이너리 파일이나 UTF-8이 아닌 파일은 거부되며 오류에 파일 이름이 표시됩니다.
- 모든 입력의 확장자가 같으면 출력도 그 확장자를 유지합니다(`merged.md`, `merged.log`). 확장자가 섞여 있으면 `merged.txt`이(가) 만들어집니다.
- `filename-heading`을(를) 사용하면 Markdown 출력은 `# name.md` 제목을, 일반 텍스트 출력은 `==> name.txt <==` 표시 줄을 사용합니다.
- 각 파일 끝의 빈 줄은 잘라내어 구분자가 문서 사이에 깔끔하게 놓이도록 합니다. 맨 앞의 바이트 순서 표시(BOM)는 제거됩니다.
- CSV 파일은 일반 텍스트로 이어 붙습니다. 헤더 행 하나로 표를 합치려면 [Merge CSVs](./merge-csvs)을(를) 사용하세요.
- `.eml` 이메일 파일은 아직 지원되지 않습니다.
