---
description: "글꼴을 TTF, OTF, WOFF, WOFF2 사이에서 변환합니다."
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: 6d3e846a4fa7
i18n_hash_version: 2
---

# 글꼴 변환 {#convert-font}

글꼴 파일을 TrueType(TTF), OpenType CFF(OTF), WOFF, WOFF2 사이에서 변환합니다. 데스크톱 글꼴을 웹 글꼴로 바꾸거나, TrueType만 받는 앱을 위해 OTF에서 TTF를 얻을 때 사용합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

`.ttf`, `.otf`, `.woff` 또는 `.woff2` 파일과 JSON `settings` 필드가 포함된 multipart form data를 받습니다.

## 매개변수 {#parameters}

| 매개변수 | 유형 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| format | string | 아니요 | `ttf` | 출력 형식: `ttf`, `otf`, `woff` 또는 `woff2` |

## 요청 예시 {#example-request}

OTF에서 TTF로:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

웹용으로 TTF에서 WOFF2로:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## 응답 예시 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## 참고 사항 {#notes}

- WOFF와 WOFF2는 같은 글꼴 데이터를 압축해 감싼 형식이므로, 이 형식으로 또는 이 형식에서 변환해도 윤곽선은 바뀌지 않습니다.
- OTF에서 TTF로 변환하면 3차(CFF) 곡선이 2차 TrueType 곡선으로 바뀝니다. 각 곡선은 원본에서 1 글꼴 단위 이내로 유지되어 일반 크기에서는 보이지 않지만, 이 변환은 정확히 되돌릴 수 없습니다. TTF에서 OTF로 변환하면 곡선 모양은 그대로 유지되고 제어점만 정수 글꼴 단위로 반올림됩니다.
- 글꼴의 임베딩 권한(OS/2 `fsType` 필드)은 그대로 유지됩니다.
- 글꼴 컬렉션(`.ttc`)은 지원하지 않습니다. 가변 TrueType 글꼴은 OTF로, 가변 CFF2 글꼴은 TTF로 변환할 수 없으니 대신 WOFF나 WOFF2로 변환하세요.
- 변환은 API 프로세스 안이 아니라 Python 문서 워커에서 실행되며, 시간 제한은 다른 문서 도구와 같습니다.
