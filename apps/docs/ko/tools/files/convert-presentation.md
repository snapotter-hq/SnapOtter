---
description: "PowerPoint와 OpenDocument 프레젠테이션 형식 간 변환."
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: 1390a97e9509
---

# 프레젠테이션 변환 {#convert-presentation}

PowerPoint(PPTX)와 OpenDocument Presentation(ODP) 형식 간에 프레젠테이션을 변환합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

PowerPoint/ODP 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| format | string | 예 | - | 출력 형식: `pptx`, `odp` |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
```

## 응답 예시 {#example-response}

`202 Accepted`을 반환합니다. `/api/v1/jobs/{jobId}/progress`에서 SSE를 통해 진행 상황을 추적하세요.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## 참고 사항 {#notes}

- 허용 입력 형식: `.pptx`, `.ppt`, `.odp`.
- 변환은 서버에서 헤드리스로 실행되는 LibreOffice가 처리합니다.
- 애니메이션 및 전환 효과는 형식 간에 유지되지 않을 수 있습니다.
- 출력 형식은 입력 형식과 달라야 합니다.
