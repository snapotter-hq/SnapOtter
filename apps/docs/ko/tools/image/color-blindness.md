---
description: "다양한 유형의 색각 이상을 가진 사람들에게 이미지가 어떻게 보이는지 시뮬레이션합니다."
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: 70338b2b78d2
---

# 색맹 시뮬레이션 {#color-blindness-simulation}

색각 이상(CVD)을 시뮬레이션하여 다양한 유형의 색맹을 가진 사람들에게 이미지가 어떻게 보이는지 미리 봅니다. 디자인, 차트, UI의 접근성 테스트에 유용합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

이미지 파일과 JSON `settings` 필드가 포함된 multipart 폼 데이터를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| simulationType | string | 아니요 | `"deuteranomaly"` | 시뮬레이션할 색각 이상 유형 |

### 시뮬레이션 유형 {#simulation-types}

| 값 | 상태 | 설명 |
|-------|-----------|-------------|
| `protanopia` | 적색맹 | 적색 원추세포의 완전한 결여 |
| `deuteranopia` | 녹색맹 | 녹색 원추세포의 완전한 결여 |
| `tritanopia` | 청색맹 | 청색 원추세포의 완전한 결여 |
| `protanomaly` | 적색약 | 적색 원추세포 감도 저하 |
| `deuteranomaly` | 녹색약 | 녹색 원추세포 감도 저하 (가장 흔함) |
| `tritanomaly` | 청색약 | 청색 원추세포 감도 저하 |
| `achromatopsia` | 전색맹 | 색각의 완전한 결여 |
| `blueConeMonochromacy` | 청색 원추세포 단일 | 청색 원추세포만 기능함 |

## 요청 예시 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## 참고 사항 {#notes}

- 녹색약(Deuteranomaly)이 기본값인 이유는 이것이 가장 흔한 형태의 색각 이상으로, 남성의 약 6%에 영향을 미치기 때문입니다.
- 시뮬레이션은 감소되거나 결여된 원추 광수용체가 인지되는 색을 어떻게 바꾸는지 모델링하는 색 변환 행렬을 사용합니다.
- 이 도구는 비파괴적이며 미리 보기만 생성합니다. 접근성을 위해 원본 이미지를 수정하지 않습니다.
- 출력 형식은 입력 형식과 일치합니다. HEIC, RAW, PSD, SVG 입력은 처리 전에 자동으로 디코딩됩니다.
