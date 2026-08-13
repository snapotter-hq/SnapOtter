---
description: "명령 하나로 Docker에 SnapOtter를 설치. Docker Compose 설정, 소스에서 빌드하기, 전체 기능 개요 포함."
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: 099b08f91118
i18n_hash_version: 2
---

# 시작하기 {#getting-started}

::: tip 설치 전에 사용해 보기
[demo.snapotter.com](https://demo.snapotter.com)에서 전체 UI를 살펴보세요 - 가입이나 설치가 필요 없습니다.
:::

## 빠른 시작 {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

이 단일 컨테이너는 필요한 모든 것을 실행합니다. `DATABASE_URL`를 설정하지 않으면 루프백 인터페이스(임베디드 모드)에서 자체 PostgreSQL 및 Redis를 시작하고 모든 데이터를 `SnapOtter-data` 볼륨에 유지합니다. 홈랩에서 SnapOtter 또는 자체 호스트를 시도하는 가장 빠른 방법입니다. 프로덕션의 경우 PostgreSQL 및 Redis를 자체 컨테이너에 유지하는 [표준 Docker Compose 스택](#docker-compose)을 사용합니다. 임베디드 모드는 루트(기본값)로 실행되며 `DATABASE_URL`를 설정하자마자 자동으로 꺼집니다.

Raspberry Pi나 오래된 노트북, 작은 VPS에 설치할 예정이라면 [저사양 환경 설정](/ko/guide/low-resource)에서 조정된 설치 가이드와 제한된 하드웨어에서 기대할 수 있는 것을 확인하라.

첫 로그인 시 비밀번호 변경을 요청받는다.

::: tip 익명 제품 애널리틱스
SnapOtter에는 익명 제품 애널리틱스가 기본으로 포함되어 있다. 끄려면 **Settings → System → Privacy**를 열고 **Anonymous Product Analytics**를 끄면 된다. 전체 인스턴스에 대해 즉시 중지된다.

리빌드 없이 인스턴스의 모든 텔레메트리를 비활성화하려면 환경 변수 `SNAPOTTER_TELEMETRY=0`(`false`과 `off`도 작동함)를 설정할 수도 있다.

오류 모니터링은 오픈소스 프로그램을 통해 SnapOtter를 후원하는 [Sentry](https://sentry.io)로 구동된다.

수집되는 내용에 대한 자세한 사항은 [SnapOtter가 수집하는 것](/ko/guide/telemetry)을 참고하라.
:::

::: tip NVIDIA CUDA 가속
`--gpus all`를 추가하여 NVIDIA CUDA 가속 배경 제거, 업스케일링, 얼굴 강화, 그리고 복원. OCR CPU 기반으로 유지되며 유무에 관계없이 동일한 이미지에서 작동합니다. GPU 입장:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

[NVIDIA 컨테이너 툴킷](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)이 필요합니다. CUDA를 사용할 수 없으면 자동으로 CPU로 대체됩니다. VA-API, Quick Sync 또는 OpenCL을 통한 Intel/AMD iGPU 가속은 현재 AI 추론에 지원되지 않습니다. 벤치마크는 [Docker 태그](/ko/guide/docker-tags)를 참조하세요. `--gpus all`에도 불구하고 AI 도구가 CPU에서 실행되는 경우 [GPU 가속 확인](/ko/guide/deployment#verify-gpu-acceleration)을 참조하세요.
:::

::: details GHCR에서도 제공
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

두 레지스트리 모두 릴리스마다 동일한 이미지를 게시한다.
:::

## 도커 컴포즈 {#docker-compose}

이 페이지에서 축약된 Compose 예시를 복사하는 대신 각 릴리스에서 유지관리되고 테스트된 프로덕션 파일을 사용하세요.

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.2.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

표준 [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.2.0/docker/docker-compose.yml)에는 4개의 런타임 볼륨, 상태 확인, 리소스 제한, 내구성 있는 Redis 구성, 고정된 데이터베이스/캐시 이미지 및 현재 컨테이너 강화가 모두 포함됩니다. 처음 로그인한 후 즉시 기본 관리자 비밀번호를 변경하세요. 재현 가능한 배포를 위해 `latest`를 따르는 대신 SnapOtter 애플리케이션 이미지를 확인한 릴리스 태그 또는 다이제스트에 고정하세요.

모든 환경 변수는 [구성](/ko/guide/configuration)을 참조하고 비밀, 네트워크 정책 및 백업 지침은 [보안 및 강화](/ko/guide/security)를 참조하세요.

## 소스에서 빌드 {#build-from-source}

**전제 조건:** Node.js 22.22+, pnpm 9+, Docker (Postgres + Redis용), Python 3.11+ (AI 기능용), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- 프론트엔드: [http://localhost:1351](http://localhost:1351)
- 백엔드: [http://localhost:13490](http://localhost:13490)

## 할 수 있는 것 {#what-you-can-do}

### 파일 처리 (200+ 도구) {#file-processing-200-tools}

| 모달리티 | 개수 | 예시 도구 |
|----------|-------|---------------|
| **이미지** | 107 | 크기 조정, 자르기, 압축, 변환, 배경 제거, 업스케일, OCR, 워터마크, 콜라주, 컬러화, GIF 도구, 형식 프리셋 |
| **비디오** | 57 | 트림, 자르기, 압축, 변환, 병합, 오디오 추출, 자동 자막, 비디오→GIF, 크기 조정, 안정화, 형식 프리셋 |
| **오디오** | 27 | 트림, 병합, 변환, 노멀라이즈, 노이즈 감소, 전사, 피치 시프트, 페이드, 벨소리 제작기, 형식 프리셋 |
| **PDF / 문서** | 29 | 병합, 분할, 압축, OCR, 워터마크, 편집(리댁트), Word→PDF, Excel→PDF, 회전, 보호, 복구 |
| **파일** | 23 | CSV→JSON, JSON→XML, CSV 병합, CSV 분할, ZIP 생성, ZIP 추출, 차트 제작기, YAML/JSON |

### 파이프라인 {#pipelines}

도구를 다단계 워크플로로 연결하고 하나의 이미지 또는 전체 배치에 적용한다:

1. 사이드바에서 **Pipelines**를 연다.
2. 단계를 추가한다(어떤 도구든, 어떤 설정이든).
3. 단일 파일 또는 전체 배치를 한 번에 실행한다.
4. 나중에 재사용하도록 파이프라인을 저장한다.

파이프라인은 기본적으로 20단계를 허용한다. 제한을 무제한으로 만들려면 `MAX_PIPELINE_STEPS=0`을 설정하라.

### 파일 라이브러리 {#file-library}

처리하는 모든 파일은 **Files** 라이브러리에 저장할 수 있다. SnapOtter는 전체 버전 히스토리를 추적하므로 원본 업로드부터 최종 출력까지 모든 처리 단계를 추적할 수 있다.

저장은 명시적이다. 라이브러리에 저장하는 결과는 삭제할 때까지 보관되는 반면, 처리하고 저장하지 않은 결과는 72시간 후 자동으로 삭제된다(`FILE_MAX_AGE_HOURS`로 구성 가능).

### REST API 및 API 키 {#rest-api-api-keys}

모든 도구는 HTTP로 접근할 수 있다:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

**Settings → API Keys**에서 API 키를 생성한다. 모든 엔드포인트는 [REST API 레퍼런스](/ko/api/rest)를 참고하거나, 대화형 레퍼런스는 [http://localhost:1349/api/docs](http://localhost:1349/api/docs)를 방문하라.

### 다중 사용자 및 팀 {#multi-user-teams}

역할 기반 접근 제어로 여러 사용자를 활성화한다:

- **관리자**: 전체 접근 - 사용자, 팀, 설정, 모든 파일/파이프라인/API 키 관리
- **사용자**: 도구 사용, 자신의 파일/파이프라인/API 키 관리

**Settings → Teams**에서 팀을 만들어 사용자를 그룹화한다.

`AUTH_ENABLED=true`을 설정하라(또는 로그인 없는 단일 사용자/개인 사용에는 `false`).

## 휴대폰에서 사용하기 {#use-it-from-your-phone}

SnapOtter는 모바일 브라우저에서 동작하며, 앱으로 설치할 수도 있다. 휴대폰에서 인스턴스를 연 다음:

- **iPhone / iPad(Safari)**: 공유를 탭한 뒤 **홈 화면에 추가**를 탭한다.
- **Android(Chrome)**: 브라우저 메뉴를 열고 **앱 설치**를 탭한다.

설치된 앱은 자체 창에서 열리며, 곧바로 인스턴스로 연결된다.

한 가지 유의할 점: 브라우저는 HTTPS에서만 설치 옵션을 제공한다. LAN의 일반 HTTP 주소도 브라우저 탭에서는 잘 동작하지만, 실제로 설치하려면 인증서를 갖춘 리버스 프록시 뒤에 인스턴스를 두면 된다([배포 가이드](/ko/guide/deployment) 참조).

휴대폰과 태블릿에서는 이미지 도구의 업로드 버튼 옆에 **사진 촬영** 버튼이 표시된다. 영수증이나 화이트보드를 찍으면 곧바로 도구로 들어간다.
