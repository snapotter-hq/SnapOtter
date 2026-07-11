---
description: "이미지 엔진 작업 레퍼런스. 모든 Sharp 기반 이미지 처리 작업과 매개변수."
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: 9a40c4b2dc21
---

# 이미지 엔진 {#image-engine}

`@snapotter/image-engine` 패키지는 AI가 아닌 모든 이미지 작업을 처리합니다. 이 패키지는 [Sharp](https://sharp.pixelplumbing.com/)를 감싸며, 외부 의존성 없이 프로세스 내에서 완전히 실행됩니다.

## 작업 {#operations}

### resize {#resize}

이미지를 특정 치수 또는 백분율로 확대/축소합니다.

| 매개변수 | 타입 | 설명 |
|---|---|---|
| `width` | number | 목표 너비(픽셀) |
| `height` | number | 목표 높이(픽셀) |
| `fit` | string | `cover`, `contain`, `fill`, `inside`, 또는 `outside` |
| `withoutEnlargement` | boolean | true이면 더 작은 이미지를 확대하지 않음 |
| `percentage` | number | 절대 치수 대신 백분율로 확대/축소 |

`width`, `height` 또는 둘 다 설정할 수 있습니다. 하나만 설정하면 나머지는 종횡비를 유지하도록 계산됩니다.

### crop {#crop}

이미지에서 직사각형 영역을 잘라냅니다.

| 매개변수 | 타입 | 설명 |
|---|---|---|
| `left` | number | 왼쪽 가장자리로부터의 X 오프셋 |
| `top` | number | 위쪽 가장자리로부터의 Y 오프셋 |
| `width` | number | 자르기 영역의 너비 |
| `height` | number | 자르기 영역의 높이 |
| `unit` | string | `px`(기본값) 또는 `percent` |

### rotate {#rotate}

이미지를 지정한 각도만큼 회전합니다.

| 매개변수 | 타입 | 설명 |
|---|---|---|
| `angle` | number | 회전 각도(도 단위, 0-360) |
| `background` | string | 노출된 영역의 채우기 색상(기본값: `#000000`). 90도가 아닌 각도에만 적용됩니다. |

### flip {#flip}

이미지를 수평, 수직 또는 둘 다 반전합니다. 최소한 하나는 true여야 합니다.

| 매개변수 | 타입 | 설명 |
|---|---|---|
| `horizontal` | boolean | 좌우 반전 |
| `vertical` | boolean | 상하 반전 |

### convert {#convert}

이미지 형식을 변경합니다.

| 매개변수 | 타입 | 설명 |
|---|---|---|
| `format` | string | 목표 형식: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `jxl`, `heic`, `heif`, `bmp`, `ico`, `jp2`, `qoi` |
| `quality` | number | 압축 품질(1-100, 손실 형식에 적용) |

처음 일곱 개 형식(`jpg`부터 `jxl`까지)은 Sharp에 의해 프로세스 내에서 인코딩됩니다. 나머지 형식은 API 계층에서 외부 인코더를 사용합니다: `heic`/`heif`는 heif-enc를 통해, `bmp`/`ico`는 ImageMagick을 통해, `jp2`는 opj_compress를 통해, `qoi`는 인라인 TypeScript 코덱을 통해 처리됩니다.

### compress {#compress}

형식은 그대로 유지하면서 파일 크기를 줄입니다.

| 매개변수 | 타입 | 설명 |
|---|---|---|
| `quality` | number | 목표 품질(1-100) |
| `targetSizeBytes` | number | 선택적 목표 파일 크기(바이트) |
| `format` | string | 선택적 형식 재정의 |

### strip-metadata {#strip-metadata}

이미지에서 EXIF, IPTC, XMP, ICC 메타데이터를 제거합니다. 매개변수가 없으면(또는 `stripAll: true`) 모든 것을 제거합니다. 선택적 제거를 위해 개별 플래그를 전달하세요.

| 매개변수 | 타입 | 설명 |
|---|---|---|
| `stripAll` | boolean | 모든 메타데이터 제거(플래그가 설정되지 않았을 때 기본값) |
| `stripExif` | boolean | EXIF 데이터 제거(`stripGps`가 별도로 설정되지 않은 경우 GPS 포함) |
| `stripGps` | boolean | GPS 위치 데이터 제거 |
| `stripIcc` | boolean | ICC 색상 프로파일 제거 |
| `stripXmp` | boolean | XMP 메타데이터 제거 |

### 색상 조정 {#color-adjustments}

이 작업들은 이미지의 색상 속성을 수정합니다. 각각 하나의 숫자 값을 받습니다.

| 작업 | 매개변수 | 범위 | 설명 |
|---|---|---|---|
| `brightness` | `value` | -100 ~ 100 | 밝기 조정 |
| `contrast` | `value` | -100 ~ 100 | 대비 조정 |
| `saturation` | `value` | -100 ~ 100 | 색상 채도 조정 |

### 색상 필터 {#color-filters}

이 필터들은 고정된 색상 변환을 적용합니다. 매개변수를 받지 않습니다.

| 작업 | 설명 |
|---|---|
| `grayscale` | 회색조로 변환 |
| `sepia` | 세피아 톤 적용 |
| `invert` | 모든 색상 반전 |

### 색상 채널 {#color-channels}

개별 RGB 색상 채널을 조정합니다. 값은 100 = 변화 없음인 배율입니다.

| 매개변수 | 타입 | 설명 |
|---|---|---|
| `red` | number | 적색 채널 배율(0 ~ 200, 100 = 변화 없음) |
| `green` | number | 녹색 채널 배율(0 ~ 200, 100 = 변화 없음) |
| `blue` | number | 청색 채널 배율(0 ~ 200, 100 = 변화 없음) |

### sharpen {#sharpen}

단일 값으로 제어되는 간단한 선명화입니다.

| 매개변수 | 타입 | 설명 |
|---|---|---|
| `value` | number | 선명화 강도(0 ~ 100). 0.5-10의 가우시안 시그마로 매핑됩니다. |

### sharpen-advanced {#sharpen-advanced}

선택 가능한 세 가지 방식과 선택적 노이즈 감소 사전 패스를 갖춘 고급 선명화입니다.

| 매개변수 | 타입 | 설명 |
|---|---|---|
| `method` | string | `adaptive`, `unsharp-mask`, 또는 `high-pass` |
| `sigma` | number | 가우시안 블러 반경, 0.5-10(적응형) |
| `m1` | number | 평탄 영역 선명화, 0-10(적응형) |
| `m2` | number | 텍스처 영역 선명화, 0-20(적응형) |
| `x1` | number | 평탄/거친 영역 임계값, 0-10(적응형) |
| `y2` | number | 최대 밝게 하기(헤일로 클램프), 0-50(적응형) |
| `y3` | number | 최대 어둡게 하기(헤일로 클램프), 0-50(적응형) |
| `amount` | number | 강도 백분율, 0-500(언샤프 마스크) |
| `radius` | number | 블러 반경, 0.1-5.0(언샤프 마스크) |
| `threshold` | number | 최소 가장자리 밝기, 0-255(언샤프 마스크) |
| `strength` | number | 블렌드 강도, 0-100(하이패스) |
| `kernelSize` | number | 3x3 / 5x5 커널에 대해 `3` 또는 `5`(하이패스) |
| `denoise` | string | 노이즈 감소 사전 패스: `off`, `light`, `medium`, 또는 `strong` |

매개변수는 방식별로 다릅니다. 선택한 방식에 관련된 것만 제공하세요.

### color-blindness {#color-blindness}

3x3 색상 재조합 행렬을 사용해 색각 이상을 시뮬레이션합니다.

| 매개변수 | 타입 | 설명 |
|---|---|---|
| `type` | string | 다음 중 하나: `protanopia`, `deuteranopia`, `tritanopia`, `protanomaly`, `deuteranomaly`, `tritanomaly`, `achromatopsia`, `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

전체 블록을 제거하지 않고 개별 EXIF/IPTC 메타데이터 필드를 작성하거나 제거합니다.

| 매개변수 | 타입 | 설명 |
|---|---|---|
| `artist` | string | EXIF Artist 태그 |
| `copyright` | string | EXIF Copyright 태그 |
| `imageDescription` | string | EXIF ImageDescription 태그 |
| `software` | string | EXIF Software 태그 |
| `dateTime` | string | EXIF DateTime 태그 |
| `dateTimeOriginal` | string | EXIF DateTimeOriginal 태그 |
| `clearGps` | boolean | 모든 GPS 태그 제거 |
| `fieldsToRemove` | string[] | 삭제할 EXIF 필드명 목록 |

모든 매개변수는 선택 사항입니다. `fieldsToRemove`에 나열된 필드는 기존 EXIF 블록에서 삭제됩니다. 명명된 매개변수를 통해 설정된 필드는 기록(또는 덮어쓰기)됩니다. MakerNote 같은 바이너리/안전하지 않은 키는 조용히 무시됩니다.

## 형식 감지 {#format-detection}

엔진은 파일 확장자뿐 아니라 파일 헤더로부터 입력 형식을 자동으로 감지합니다. 따라서 실제로는 PNG인 `.jpg` 파일도 올바르게 처리됩니다. 감지는 다층 방식을 사용합니다: 먼저 매직 바이트, 그다음 대체 수단으로 파일 확장자를 사용합니다.

SnapOtter는 **55개 이상의 입력 형식**과 **13개의 출력 형식**을 지원하며, 여기에는 20개 이상 브랜드의 카메라 RAW 형식 23종, 전문 형식(PSD, EPS, OpenEXR, HDR), 최신 코덱(JPEG XL, AVIF, HEIC, QOI, JPEG 2000), 과학/게임 형식(FITS, DDS)이 포함됩니다. 디코딩은 가능한 경우 Sharp가 기본적으로 처리하며, ImageMagick, LibRaw, 특수 CLI 디코더로 자동 대체됩니다.

전체 목록은 [지원 형식](/ko/guide/supported-formats) 페이지를 참고하세요.

## 메타데이터 추출 {#metadata-extraction}

`info` 도구는 이미지 메타데이터를 반환합니다. 전체 필드 레퍼런스는 [이미지 정보](/ko/tools/image/info)를 참고하세요.

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```
