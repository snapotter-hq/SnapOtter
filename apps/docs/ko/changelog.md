---
description: "SnapOtter의 릴리스 노트 및 버전 이력. 각 릴리스에서 새로 추가되거나 개선되거나 수정된 내용을 확인하세요."
i18n_source_hash: 9020073f127e
i18n_provenance: human
i18n_output_hash: eeebbc528b3d
---

# 변경 로그 {#changelog}

## v2.0.0 {#v2-0-0}

SnapOtter 2.0은 이미지 툴킷을 완전한 파일 조작 스위트로 확장합니다. 다섯 가지 모달리티(Image, Video, Audio, PDF, Files)에 걸친 200개 이상의 도구를 Postgres 17과 Redis 기반 작업 큐 위에 다시 구축했으며, 한 번의 명령으로 실행되는 `docker run`를 제공합니다. 이번은 메이저 릴리스입니다. 1.x에서 업그레이드하기 전에 호환성을 깨는 변경 사항을 읽어보세요.

### 새로운 기능 {#new-features}

- **네 가지 새로운 도구 모달리티**: Video, Audio, PDF, Files가 Image에 합류하여 카탈로그가 200개 이상의 도구로 늘어났습니다.
- **내구성 있는 백그라운드 작업**: Redis 기반 큐(BullMQ)가 모든 도구를 실시간 SSE 진행률과 함께 추적되는 작업으로 실행합니다.
- **올인원 단일 컨테이너 모드**: 하나의 `docker run`로 임베디드 Postgres와 Redis가 포함된 완전한 인스턴스를 부팅합니다.
- **온디맨드 AI 번들**: 배경 제거, OCR, 전사, 업스케일, 얼굴 감지 및 보정, 개체 지우개, 컬러화, 사진 복원이 UI에서 설치됩니다. GPU 가속은 프레임워크별로 감지됩니다.
- **Sign PDF**: 서명을 그리거나, 입력하거나, 업로드하여 브라우저에서 PDF에 배치합니다.
- **Automate**: 도구를 연결하는 시각적 파이프라인 빌더로, 아홉 개의 사전 구축된 템플릿을 제공합니다.
- **원클릭 변환 프리셋 83개**: JPG-to-PNG, MP4-to-GIF 등 전용 변환기와 퍼지 검색을 지원합니다.
- **레이어 기반 이미지 편집기**: 브러시, 도형, 조정, 필터, 커브를 갖춘 `/editor`의 Konva 기반 편집기입니다.
- **Files 라이브러리**: 모든 결과를 저장하고 다른 도구의 입력으로 재사용합니다.
- 고정된 도구, 캔버스 내 확대/축소 및 이동, 21개 언어, 그리고 엔터프라이즈 기능(OIDC/SSO, SAML, SCIM, S3 스토리지, 도구별 권한, 감사 로그 내보내기, 분산 추적)을 제공합니다.

### 개선 사항 {#improvements}

- 실행 중인 프로세스를 취소합니다. (#137)
- DNG를 포함하여 LibRaw를 통한 전체 해상도 RAW 디코딩을 지원합니다. (#289)
- 비루트 및 외부 UID 배포(TrueNAS, Unraid, OpenShift, PUID/PGID)를 지원합니다. (#230, #127)
- 정확한 AI 설치 감지와 강화된 설치 흐름을 제공합니다. (#214, #352)
- 개인정보 보호 강화: 자동 서드파티 송신을 제거하고, 선택적 엄격 오프라인 모드를 추가했습니다.
- 분석이 꺼져 있어도 항상 표시되는 피드백 버튼을 제공합니다.

### 버그 수정 {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0`이 도구 경로에 대한 속도 제한을 다시 비활성화합니다. (#271)
- Docker 이미지 내부의 AI virtualenv 경로를 복구했습니다. (#390)
- sharp 0.35.2+ 호환성을 지원합니다. (#362)
- 이미지 편집기 레이아웃 수정: 눈금자, 채우기 동작, 사이드바, 캔버스 크기 조정. (#258, #259)
- 이탈리아어 번역을 완료했습니다. (#231, #206, #425)
- 오디오 normalize 및 loudnorm이 원본 샘플레이트를 유지합니다.
- SSRF 강화: 숫자 IPv6 CIDR 매칭과 확장된 URL 사전 스캔을 적용했습니다. (#287)
- 생성된 PDF에 Producer로 SnapOtter가 표시됩니다.
- mediapipe가 Python 3.13 및 Debian 13에 설치됩니다.

### 호환성을 깨는 변경 사항 {#breaking-changes}

2.0은 임베디드 SQLite 데이터베이스를 Postgres 17로 대체하고 작업 큐를 위해 Redis 8을 추가합니다. 1.x 데이터는 첫 부팅 시 자동으로 마이그레이션되지만 컨테이너 스택이 변경되었으므로 먼저 전체 `/data` 볼륨을 백업하세요(1.x는 SQLite를 WAL 모드로 실행하므로 커밋된 데이터는 보통 `snapotter.db-wal`에 있습니다). 그런 다음 단일 컨테이너 이미지(임베디드 Postgres 및 Redis, 루트 전용) 또는 Compose 스택(앱과 Postgres 17 및 Redis 8)을 선택하세요. [마이그레이션 가이드](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md)와 [업그레이드 가이드](/ko/guide/upgrading)를 참고하세요.

### 업그레이드 {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

또는 Docker Compose로:

```bash
docker compose pull && docker compose up -d
```

[GitHub의 전체 diff](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

새로운 HTML to Image 도구, WCAG 2.2 AA 접근성, 침투 테스트를 통한 보안 강화, 그리고 5가지 중요한 Docker 수정 사항을 제공합니다.

### 새로운 기능 {#new-features-1}

- **HTML to Image**: URL 또는 원시 HTML의 스크린샷을 PNG/JPEG/WebP로 캡처합니다. 전체 페이지 캡처, 사용자 지정 뷰포트, 다크 모드를 지원합니다.
- **Docker _FILE 시크릿 규약**: 민감한 환경 변수를 평문 대신 파일로 마운트합니다. (#205)
- **엔터프라이즈 라이선스 및 S3 스토리지**: 선택적 상용 라이선스 키와 S3 호환 객체 스토리지를 지원합니다.
- **도형 편집기 개선**: 채우기/윤곽선 투명도, RGBA 색상 선택기, 점선 스타일을 추가했습니다.
- **사전 빌드된 릴리스 아카이브**: 비 Docker 설치(Proxmox, 베어메탈, LXC)를 위해 GitHub Releases에서 tarball을 다운로드합니다. (#202)

### 개선 사항 {#improvements-1}

- **WCAG 2.2 AA 접근성**: 내비게이션 건너뛰기, 포커스 트래핑, aria-live 영역, 모션 감소 지원, 올바른 명암비를 제공합니다. (#209)
- **모바일 반응성**: 반응형 설정, 모바일 탭 전환 시 SSE 자동 재연결을 지원합니다. (#203, #204)
- **배경 제거 품질**: 가장자리 스무딩, 색상 오염 제거, 출력 형식 선택을 추가했습니다.
- **이탈리아어 번역**: @albanobattistella가 약 145개의 새 문자열을 추가했습니다. (#206)
- **도구별 API 문서**: 매개변수, 예제, 응답 형식을 담은 53개의 문서 페이지를 제공합니다.
- **AI 모델 다운로드**: HuggingFace를 위한 지수 백오프 재시도 로직을 추가했습니다. (#201)

### 버그 수정 {#bug-fixes-1}

- 새 Docker 컨테이너를 전혀 사용할 수 없던 문제(속도 제한이 모든 요청을 차단)를 수정했습니다.
- 얼굴 감지 AI 도구(blur-faces, red-eye-removal, enhance-faces, passport-photo)가 모든 플랫폼에서 실패하던 문제를 수정했습니다.
- ARM에서 HEIC 파일이 깨지던 문제(libheif 심볼 불일치)를 수정했습니다.
- ARM에서 업스케일 및 restore-photo AI 번들이 설치되지 않던 문제를 수정했습니다.
- OCR이 GPU 컨테이너에서 잘못된 CUDA 버전을 사용하던 문제를 수정했습니다.
- 16진수 IPv4 매핑 IPv6 주소를 통한 SSRF 가드 우회 문제를 수정했습니다. (제공: @tonghuaroot)
- 보조 이미지가 포함된 iPhone HEIC 디코딩 문제를 수정했습니다. (#183, #199)
- 8GB GPU에서 Real-ESRGAN CUDA OOM 문제를 수정했습니다. (#200)
- 프로덕션 Sentry 오류 6건과 QA 버그 7건을 수정했습니다. (#208)

### 보안 {#security}

- 침투 테스트 발견 사항 10건을 해결했습니다(XFF 우회, 잘못된 형식의 JSON 충돌, 무제한 파이프라인, 감사 로그 XSS, TRACE 메서드 등). (#207)
- 16진수 IPv6 SSRF 우회를 차단했습니다. (제공: @tonghuaroot)
- Dockerfile 베이스 이미지를 다이제스트로 고정했습니다.

### 업그레이드 {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

또는 Docker Compose로:

```bash
docker compose pull && docker compose up -d
```

[GitHub의 전체 diff](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

라이브 데모, 도구별 랜딩 페이지, 그리고 일련의 다듬기 수정 사항을 제공합니다.

### 새로운 기능 {#new-features-2}

- **라이브 데모** - [demo.snapotter.com](https://demo.snapotter.com)에서 아무것도 설치하지 않고 SnapOtter를 사용해 볼 수 있습니다.
- **도구 색인 페이지** - `/tools`에서 검색과 카테고리 필터로 50개 이상의 모든 도구를 둘러봅니다.
- **50개 이상의 SEO 랜딩 페이지** - 이제 모든 도구에 FAQ, 사용 사례, 비교 표가 포함된 전용 랜딩 페이지가 있습니다.
- **배경 미리 보기** - 전후 슬라이더가 투명 이미지 뒤에 체크무늬 배경을 표시합니다.
- **강력한 비밀번호 생성기** - Add Members 폼의 원클릭 버튼을 제공합니다.

### 버그 수정 {#bug-fixes-2}

- HEIC/HEIF 정보 도구가 더 이상 실패하지 않습니다(사전 디코딩 추가).
- AI 모델 번들 설치가 더 나은 오류 메시지를 표시하고 리소스 제한을 준수합니다.
- 라이브러리 썸네일이 올바르게 로드됩니다(인증 헤더 누락 문제 해결).
- People 및 Teams 설정 표에서 드롭다운 메뉴가 더 이상 잘리지 않습니다.
- 비압축 도구에서 크기 비교 백분율을 숨겼습니다.
- 중복된 개인정보 처리방침 링크를 제거했습니다.
- AI 기능 설정에 이탈리아어 번역을 추가했습니다.
- 이름이 변경된 Lucide 아이콘을 업데이트했습니다(Wand2, Columns).

### 인프라 {#infrastructure}

- OpenSSF Scorecard를 4.3에서 약 7.0으로 강화했습니다.
- CI 테스트를 축소된 픽스처로 4개 샤드로 병렬화했습니다.
- 41개의 의존성 업데이트를 적용했습니다.

### 업그레이드 {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

또는 Docker Compose로:

```bash
docker compose pull && docker compose up -d
```

[GitHub의 전체 diff](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

다섯 개의 새 도구, 완전한 이미지 편집기, SSO 로그인, 20개 언어를 제공합니다. 아마 세 개의 별도 릴리스로 나뉘었어야 했지만, 어쨌든 여기까지 왔습니다.

### 새로운 기능 {#new-features-3}

- **이미지 편집기** - 레이어, 브러시, 도형, 조정, 필터, 커브, 키보드 단축키를 제공합니다. 브라우저에서 실행되고 사용자의 하드웨어에서 처리됩니다.
- **OIDC / SSO 인증** - Google, GitHub, Okta 또는 모든 OpenID Connect 공급자로 로그인합니다. 몇 개의 환경 변수를 설정하면 팀이 기존 계정을 사용합니다.
- **밈 생성기** - opentype.js를 통한 텍스트 렌더링이 포함된 100개의 내장 템플릿을 제공합니다. 또는 직접 이미지를 업로드합니다.
- **Beautify** - 스크린샷을 넣으면 다듬어진 이미지가 나옵니다. 디바이스 프레임(macOS, Windows, 브라우저), 그림자, 그라데이션, 소셜 미디어 프리셋을 제공합니다.
- **색맹 시뮬레이션** - 적색맹, 녹색맹, 청색맹 등 색각 이상에서 이미지가 어떻게 보이는지 미리 봅니다.
- **PNG 투명도 수정기** - 가짜 투명 PNG를 감지하고 BiRefNet HR-matting으로 수정합니다. LaMa 인페인팅을 통한 선택적 워터마크 제거를 지원합니다.
- **AI 캔버스 확장** - AI 채우기로 이미지 경계를 확장합니다. GPU 시간을 얼마나 투자할지에 따라 세 가지 품질 등급(fast, balanced, quality)을 제공합니다.
- **20개 언어** - 아랍어, 중국어(간체/번체), 체코어, 네덜란드어, 프랑스어, 독일어, 힌디어, 인도네시아어, 이탈리아어, 일본어, 한국어, 폴란드어, 포르투갈어, 러시아어, 스페인어, 태국어, 터키어, 우크라이나어, 베트남어를 지원합니다. 아랍어의 경우 RTL이 작동합니다.
- **URL 가져오기** - 드롭존에 URL을 붙여넣거나 목록에서 일괄 가져옵니다. SSRF 보호가 적용된 서버 측 페치를 제공합니다.
- **다중 파일 지우개** - 여러 이미지에 걸쳐 지우기 마스크를 그리고 한 번의 클릭으로 모두 처리합니다. 스트로크는 이미지별로 유지됩니다.
- **파이프라인 가져오기/내보내기** - 도구 체인을 JSON으로 저장하고 다른 사람과 공유합니다.
- **17개의 새 카메라 RAW 형식**을 exiftool을 통해 추가했으며, QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ, APNG 입력을 지원합니다. BMP, ICO, JP2, QOI에 대한 새 출력 코덱을 추가했습니다. AVIF, TIFF, GIF, JXL, PSD 내보내기를 이전에 손실된 브랜치에서 복구했습니다.

### 개선 사항 {#improvements-2}

- **이미지 향상** - 기존 파이프라인을 CLAHE + normalise + gamma로 교체했습니다. 새로운 Deep Enhance 토글은 더 적극적인 결과를 위해 AI 모델을 사용합니다.
- **사진 복원** - 8각도 Otsu 필터링으로 스크래치 감지를 다시 작성했습니다. 이제 LaMa 인페인팅이 원본 해상도에서 실행됩니다.
- **어디서나 이색적인 형식** - OCR, image-to-PDF, 파비콘 생성기, composition, stitch, vectorize가 이제 모두 HEIC, RAW, PSD를 디코딩합니다.
- **Compress** - 목표 크기 허용 오차를 5%에서 1%로 좁혔습니다. 목표 크기가 기본 모드입니다. 스테퍼 버튼과 KB/MB 단위 선택기를 추가했습니다.
- **Sentry 정리** - 조치 불가능한 이벤트 644건을 필터링했습니다. 이제 실제 오류가 올바르게 처리됩니다.
- **GPU 감지** - CUDA는 있지만 nvidia-smi가 없는 컨테이너에 대한 진단을 개선했습니다.
- **인증 비활성화 모드** - 익명 사용자가 admin 역할로 DB에 시드됩니다. API 키, 파이프라인, 사용자 파일이 더 이상 FK 제약 조건에서 깨지지 않습니다.
- 단위, 통합, E2E 전반에 걸쳐 **2,705개 이상의 새 테스트**를 추가했습니다.

### 버그 수정 {#bug-fixes-3}

- CPU 업스케일이 NAS 박스와 저전력 하드웨어에서 더 이상 시간 초과되지 않습니다.
- QR 코드 로고가 더 이상 미리 보기를 영구적으로 사라지게 하지 않습니다.
- 세로가 긴 초상화 이미지의 크롭 오버플로를 수정했습니다.
- TIFF 알파 파일이 손상을 일으키는 대신 올바르게 PNG 출력을 강제합니다.
- HDR/EXR 디코딩이 CLAHE 전에 8비트로 변환하여 디코딩 실패를 수정합니다.
- 얼굴 랜드마크 입력 버퍼가 Python 사이드카 이전에 PNG로 변환되어 충돌을 수정합니다.
- 중복 찾기가 혼합 형식 배치와 네트워크 오류를 처리합니다.
- Beautify 미리 보기가 실시간으로 업데이트됩니다.
- stitch 및 vectorize의 진행률 표시줄을 추가했습니다.
- SVGZ가 SVG-to-raster로 처리됩니다.
- 퍼센트 인코딩된 X-File-Results 헤더를 통해 비 ASCII 파일 이름을 수정했습니다.

### 업그레이드 {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

또는 Docker Compose로:

```bash
docker compose pull && docker compose up -d
```

[GitHub의 전체 diff](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

GPU 자동 감지 기능이 있는 통합 Docker 이미지입니다. 하나의 이미지가 CPU와 GPU 워크로드를 모두 처리합니다. 로그 순환이 포함된 단일 파일로 compose를 단순화했습니다. 이제 모델 사전 다운로드에 검증과 스모크 테스트가 포함됩니다.

---

## v1.13.0 {#v1-13-0}

역할 기반 접근 제어(RBAC)입니다. 14개의 세분화된 권한, 세 개의 내장 역할(admin, editor, user), 사용자 지정 역할 지원을 제공합니다. 모든 API 경로에서 권한을 확인합니다. 프런트엔드 탭이 사용자 권한에 따라 필터링됩니다.

---

## v1.12.0 {#v1-12-0}

PDF to Image 도구입니다. PDF 페이지를 사용자 지정 DPI에서 PNG, JPEG, WebP 또는 TIFF로 변환합니다. GPU 자동 감지 기능이 있는 통합 Docker 이미지입니다.

---

## v1.11.0 {#v1-11-0}

AI 친화적인 문서를 위해 vitepress-plugin-llms를 통해 자동 생성되는 llms.txt입니다.

---

## v1.10.0 {#v1-10-0}

얼굴 보호 기능이 있는 콘텐츠 인식 크기 조정(seam carving)입니다. 중요한 콘텐츠를 보존하면서 이미지 크기를 조정합니다.

---

## v1.9.0 {#v1-9-0}

Stitch / Combine 도구입니다. 이미지를 나란히, 수직으로 쌓거나, 사용자 지정 그리드로 결합합니다.

---

## v1.8.0 {#v1-8-0}

Edit Metadata 도구입니다. 세분화된 제거/유지 인터페이스로 EXIF, IPTC, XMP 메타데이터를 보고 편집합니다.

---

## 이전 릴리스 {#older-releases}

패치 릴리스를 포함한 전체 커밋 수준 변경 로그는 [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases)를 참고하세요.
