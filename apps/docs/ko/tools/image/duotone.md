---
description: "사용자 지정 그림자 색상과 하이라이트 색상으로 2색 듀오톤 효과를 적용합니다."
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: ca08144514d4
---

# 듀오톤 {#duotone}

이미지에 2색 듀오톤 효과를 적용합니다. 이미지가 회색조로 변환된 다음, 그림자 색상(어두운 톤)과 하이라이트 색상(밝은 톤) 사이의 그라디언트로 매핑됩니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/duotone`

이미지 파일과 JSON `settings` 필드가 포함된 multipart 폼 데이터를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| shadow | string | 아니요 | `"#1e3a8a"` | 그림자 16진수 색상(어두운 톤에 적용) |
| highlight | string | 아니요 | `"#fbbf24"` | 하이라이트 16진수 색상(밝은 톤에 적용) |
| intensity | integer | 아니요 | `100` | 효과 강도(0~100); 0은 원본을 반환하고, 100은 전체 듀오톤을 적용 |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## 참고 사항 {#notes}

- 출력 형식은 입력 형식과 일치합니다. HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
- 100 미만의 `intensity`은(는) 듀오톤 결과를 원본 이미지와 혼합하여 더 은은한 효과를 낼 수 있습니다.
- 인기 있는 듀오톤 조합에는 네이비/골드, 틸/코랄, 퍼플/핑크가 있습니다.
