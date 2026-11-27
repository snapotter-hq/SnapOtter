---
description: "기기 에뮬레이션으로 웹페이지 또는 HTML 스니펫을 고품질 이미지로 캡처합니다."
i18n_source_hash: 307493f63631
i18n_provenance: machine
i18n_output_hash: a4cedf2f4620
i18n_hash_version: 2
---

# HTML to Image {#html-to-image}

웹페이지 URL 또는 원시 HTML 콘텐츠를 스크린샷 이미지로 캡처합니다. 기기 에뮬레이션(데스크톱, 태블릿, 모바일), 전체 페이지 캡처, 여러 출력 형식을 지원합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

**JSON 본문**을 받습니다(multipart 아님). 파일 업로드가 필요 없습니다.

## 파라미터 {#parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| url | string | 조건부 | - | 캡처할 URL(유효한 URL이어야 함) |
| html | string | 조건부 | - | 렌더링할 원시 HTML 콘텐츠(1에서 5,000,000자) |
| format | string | 아니오 | `"png"` | 출력 형식: `jpg`, `png`, `webp` |
| quality | number | 아니오 | `90` | 손실 형식의 출력 품질(1에서 100) |
| fullPage | boolean | 아니오 | `false` | 뷰포트뿐 아니라 스크롤 가능한 전체 페이지를 캡처 |
| devicePreset | string | 아니오 | `"desktop"` | 기기 에뮬레이션: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | 아니오 | `1280` | 사용자 지정 뷰포트 너비(픽셀, 320에서 3840, devicePreset이 `custom`일 때 사용) |
| viewportHeight | number | 아니오 | `720` | 사용자 지정 뷰포트 높이(픽셀, 320에서 2160, devicePreset이 `custom`일 때 사용) |
| clientJobId | string | 아니오 | - | 응답이 도착하기 전에 진행 상황 스트림을 열 수 있도록 직접 지정하는 작업 ID |

`url` 또는 `html` 중 하나를 반드시 제공해야 하며, 둘 다 제공할 수는 없습니다.

### 기기 프리셋 {#device-presets}

| 프리셋 | 너비 | 높이 | 모바일 UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | 아니오 |
| `tablet` | 768 | 1024 | 아니오 |
| `mobile` | 375 | 812 | 예 |
| `custom` | (사용자 지정) | (사용자 지정) | 아니오 |

## 예제 요청 {#example-request}

웹페이지 캡처:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

HTML 콘텐츠 렌더링:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## 예제 응답 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

### 느린 페이지 {#slow-pages}

캡처는 대기열에 등록된 작업으로 실행됩니다. 동기 대기 시간 안에 끝나는 캡처는 위의 결과와 함께 `200`을 반환합니다. 더 오래 걸리는 캡처는 작업 ID와 함께 `202`을 반환합니다.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true,
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress"
}
```

작업이 완료될 때까지 `progressUrl`(Server-Sent Events)를 따라가세요. 완료 이벤트에는 `200` 응답과 동일한 결과 객체가 담겨 있습니다. 작업은 `POST /api/v1/jobs/{jobId}/cancel`으로 취소할 수 있습니다.

::: warning 2.3.0 이후 변경됨
2.3.0까지 이 엔드포인트는 캡처가 끝날 때까지 요청을 계속 열어 둔 채 `200`을 반환했습니다. `200`만 처리하는 스크립트는 `202`도 처리해야 합니다.
:::

## 참고 {#notes}

- 서버에 Chromium이 설치되어 있어야 합니다. 브라우저 서비스를 사용할 수 없으면 HTTP 503을 반환합니다.
- URL은 SSRF 공격에 대해 검증됩니다(사설/내부 네트워크 주소는 차단됨).
- 이 엔드포인트는 시간당 120회 요청으로 속도 제한됩니다.
- 이 도구는 URL/HTML에서 이미지를 생성하므로 `originalSize`은 항상 0입니다.
- 출력 파일 이름은 `screenshot.<format>`입니다.
- 페이지 로드가 너무 오래 걸리면 캡처가 HTTP 504(게이트웨이 시간 초과)로 실패합니다.
- 브라우저 서비스가 반복적으로 충돌하면 일시적으로 비활성화되고, 캡처는 코드 `BROWSER_CRASHED`과 함께 HTTP 503으로 실패합니다.
- 브라우저 충돌(HTTP 503)은 다른 대기열 이미지 작업과 마찬가지로 실패를 보고하기 전에 한 번 재시도됩니다. 페이지 로드 시간 초과는 재시도되지 않습니다.
- 이미 `202`을 반환한 캡처는 HTTP 상태 대신 진행 상황 스트림에서 실패를 보고합니다.
