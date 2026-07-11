---
description: "애니메이션 GIF의 크기 조정, 최적화, 속도 변경, 반전, 회전, 프레임 추출을 하나의 도구에서 처리합니다."
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: 95ee0097576e
---

# GIF 도구 {#gif-tools}

애니메이션 GIF의 크기를 조정하고, 최적화하고, 속도를 변경하고, 반전하고, 프레임을 추출하고, 회전합니다. 하나의 도구에서 여러 작업 모드를 제공합니다.

## API 엔드포인트 {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## 파라미터 {#parameters}

### 공통 파라미터 {#common-parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| mode | string | 아니오 | `"resize"` | 작업 모드: `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | 아니오 | 0 | 출력 GIF의 반복 횟수(0 = 무한, 1-100 = 유한 반복) |

### 크기 조정 모드 파라미터 {#resize-mode-parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| width | integer | 아니오 | - | 목표 너비(픽셀, 1에서 16384) |
| height | integer | 아니오 | - | 목표 높이(픽셀, 1에서 16384) |
| percentage | number | 아니오 | - | 비율로 조정(1에서 500). 설정하면 width/height를 무시합니다. |

### 최적화 모드 파라미터 {#optimize-mode-parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| colors | number | 아니오 | 256 | 팔레트의 최대 색상 수(2에서 256) |
| dither | number | 아니오 | 1.0 | 디더링 강도(0에서 1, 0이면 디더링 비활성화) |
| effort | number | 아니오 | 7 | 최적화 노력 수준(1에서 10, 높을수록 느리지만 더 작음) |

### 속도 모드 파라미터 {#speed-mode-parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| speedFactor | number | 아니오 | 1.0 | 속도 배수(0.1에서 10). 1보다 크면 빨라지고, 1보다 작으면 느려집니다. |

### 추출 모드 파라미터 {#extract-mode-parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| extractMode | string | 아니오 | `"single"` | 추출 모드: `single`, `range`, `all` |
| frameNumber | number | 아니오 | 0 | `single` 모드에서 추출할 프레임 인덱스(0부터 시작) |
| frameStart | number | 아니오 | 0 | `range` 모드의 시작 프레임 인덱스(0부터 시작) |
| frameEnd | number | 아니오 | - | `range` 모드의 끝 프레임 인덱스(0부터 시작, 포함) |
| extractFormat | string | 아니오 | `"png"` | 추출 프레임 형식: `png`, `webp` |

### 회전 모드 파라미터 {#rotate-mode-parameters}

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|-----------|------|----------|---------|-------------|
| angle | number | 아니오 | - | 회전 각도: `90`, `180`, 또는 `270` 도 |
| flipH | boolean | 아니오 | `false` | 좌우 반전 |
| flipV | boolean | 아니오 | `false` | 상하 반전 |

## 예제 요청 {#example-requests}

### 크기 조정 {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### 최적화 {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### 속도 높이기 {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### 단일 프레임 추출 {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## 예제 응답 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## 정보 하위 라우트 {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

애니메이션 GIF를 처리하지 않고 그에 대한 메타데이터를 반환합니다.

### 정보 요청 {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### 정보 응답 {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## 참고 {#notes}

- 메인 처리 엔드포인트에는 표준 `createToolRoute` 팩토리를 사용합니다.
- 정보 엔드포인트는 파일 업로드만 필요합니다(설정 불필요).
- `resize` 모드에서 `percentage`이 제공되면 `width`/`height`보다 우선합니다. 크기 조정은 종횡비를 유지하기 위해 `fit: inside`을 사용합니다.
- `speed` 모드에서는 프레임 지연이 속도 배수로 나누어집니다. 프레임당 최소 지연은 20ms입니다(GIF 사양 제한).
- `reverse` 모드에서는 반전하면서 동시에 속도를 조정할 수 있도록 `speedFactor` 파라미터도 사용할 수 있습니다.
- `extract` 모드에서 `range` 또는 `all`를 사용하면 출력은 개별 프레임이 담긴 ZIP 파일입니다.
- `rotate` 모드에서는 각 프레임이 개별적으로 처리된 후 애니메이션으로 다시 조립됩니다.
- `loop` 파라미터는 출력 GIF가 몇 번 반복되는지를 제어합니다. 무한 반복에는 0을 사용하세요.
- 정보 응답의 `duration` 필드는 총 애니메이션 재생 시간(밀리초)입니다.
