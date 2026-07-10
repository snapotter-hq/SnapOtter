---
description: "AI를 사용하여 피사체를 선명하게 유지하면서 배경을 흐리게 합니다."
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: 72bcc93b31b9
---

# Blur Background {#blur-background}

피사체를 선명하게 유지하면서 이미지 배경을 흐리게 합니다. AI 모델이 피사체를 분리하고, 원본 배경에 블러를 적용한 후, 선명한 피사체를 그 위에 합성합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

이미지 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| intensity | integer | 아니요 | `50` | 블러 강도 (1-100) |
| feather | integer | 아니요 | `0` | 가장자리 페더링 반경 (0-20) |
| format | string | 아니요 | `"png"` | 출력 형식: `png` 또는 `webp` |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

`GET /api/v1/jobs/{jobId}/progress`에서 SSE를 통해 진행 상황을 추적할 수 있습니다. 작업이 완료되면 SSE 스트림이 다운로드 URL과 함께 `completed` 이벤트를 발생시킵니다.

## 참고 사항 {#notes}

- 이 도구는 `202 Accepted`을(를) 반환하고 비동기적으로 처리하는 AI 기반 도구입니다. 진행 상황 업데이트와 최종 결과를 받으려면 SSE 엔드포인트에 연결하세요.
- **background-removal** 기능 번들이 설치되어 있어야 합니다. 번들을 사용할 수 없는 경우 `501`을(를) 반환합니다.
- 강도 값이 높을수록 더 강한 블러 효과가 생성됩니다. 80을 초과하는 값은 뚜렷한 보케 같은 분리 효과를 만듭니다.
- HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
