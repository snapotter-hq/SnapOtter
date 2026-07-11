---
description: "소스 이미지에서 모든 표준 파비콘 및 앱 아이콘 크기를 생성합니다."
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: f457f1b7b126
---

# 파비콘 생성기 {#favicon-generator}

소스 이미지에서 파비콘과 앱 아이콘 파일 전체 세트를 생성합니다. 브라우저, Apple 기기, Android에 필요한 모든 표준 크기와 함께 웹 매니페스트 및 HTML 스니펫을 만들어 냅니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/favicon`

하나 이상의 이미지 파일과 선택적 JSON `settings` 필드가 포함된 multipart 폼 데이터를 받습니다.

## 파라미터 {#parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| background | string | 아니오 | - | 배경 hex 색상(예: `"#ffffff"`). 설정하면 아이콘이 이 색상 위로 병합됩니다. |
| padding | integer | 아니오 | `0` | 아이콘 콘텐츠 주위의 패딩 비율(0에서 40) |
| radius | integer | 아니오 | `0` | 둥근 아이콘의 모서리 반경 비율(0에서 50) |
| sizes | integer[] | 아니오 | - | 출력을 특정 픽셀 크기로 제한(예: `[16, 32, 180]`). 생략하면 모든 표준 크기를 생성합니다. |
| themeColor | string | 아니오 | `"#ffffff"` | 웹 매니페스트용 테마 색상 hex |

## 생성되는 파일 {#generated-files}

각 입력 이미지에 대해 다음 파일이 만들어집니다:

| 파일 | 크기 | 용도 |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | 브라우저 탭 아이콘 |
| `favicon-32x32.png` | 32x32 | 브라우저 탭 아이콘(HiDPI) |
| `favicon-48x48.png` | 48x48 | 데스크톱 바로 가기 |
| `apple-touch-icon.png` | 180x180 | iOS 홈 화면 |
| `android-chrome-192x192.png` | 192x192 | Android 홈 화면 |
| `android-chrome-512x512.png` | 512x512 | Android 스플래시 화면 |
| `favicon.ico` | 32x32 | 레거시 ICO 형식 |
| `manifest.json` | - | 아이콘 참조가 포함된 웹 앱 매니페스트 |
| `favicon-snippet.html` | - | 바로 사용할 수 있는 HTML 링크 태그 |

## 예제 요청 {#example-request}

둥근 모서리와 패딩이 있는 단일 소스 이미지:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

여러 소스 이미지(각각 하위 폴더에 자체 세트를 받음):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## 예제 응답 {#example-response}

응답은 직접 스트리밍되는 ZIP 파일입니다. 응답 헤더는 다음과 같습니다:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## 포함된 HTML 스니펫 {#html-snippet-included}

ZIP에는 HTML `<head>`에 붙여 넣을 수 있는 `favicon-snippet.html` 파일이 포함되어 있습니다:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## 참고 {#notes}

- 소스 이미지는 `cover` fit 모드를 사용하여 크기가 조정되며, 이는 각 정사각형 크기를 채우도록 잘린다는 뜻입니다. 최상의 결과를 위해 정사각형 소스 이미지를 사용하세요.
- 여러 파일을 업로드하면 각 파일은 ZIP 안에 자체 하위 폴더(소스 파일 이름을 따름)를 갖습니다.
- 단일 파일 업로드의 경우 모든 출력은 하위 폴더 없이 ZIP의 루트에 위치합니다.
- 검증 또는 디코딩에 실패한 파일은 건너뛰며, 문제를 설명하는 `skipped-files.txt`가 ZIP에 포함됩니다.
- 지원되는 입력 형식: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD 등.
- EXIF 방향은 크기 조정 전에 자동으로 적용됩니다.
