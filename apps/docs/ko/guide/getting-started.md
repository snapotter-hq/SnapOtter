---
description: "Docker로 명령 한 줄에 SnapOtter를 설치하고, 로그인한 뒤 첫 번째 도구를 열어 봅니다. GPU 가속, 저사양 장비, Docker Compose, 소스 빌드도 다룹니다."
i18n_source_hash: b40014f9f1a3
i18n_provenance: machine
i18n_output_hash: 5bfdc97e8775
i18n_hash_version: 2
---

# 시작하기 {#getting-started}

::: tip 설치 전에 체험해 보기
[demo.snapotter.com](https://demo.snapotter.com)에서 전체 UI를 둘러보세요. 가입이나 설치가 필요 없습니다.
:::

## 빠른 시작 {#quick-start}

명령 하나를 실행합니다.

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

그런 다음 [http://localhost:1349](http://localhost:1349)에 접속해 `admin` / `admin`(으)로 로그인합니다. 처음 로그인할 때 비밀번호를 변경하라는 안내가 표시됩니다.

이제 도구를 열어 보세요. 사이드바에서 하나를 고르거나 [크기 조정](http://localhost:1349/image/resize)으로 바로 이동해 이미지를 넣고 결과를 내려받으면 됩니다.

설치는 이게 전부입니다. 이 컨테이너 하나로 필요한 모든 것이 실행됩니다. [`DATABASE_URL`](/ko/guide/configuration#env-database-url)를 설정하지 않으면 루프백 인터페이스에서 자체 PostgreSQL과 Redis를 시작하고(내장 모드) 모든 데이터를 `SnapOtter-data` 볼륨에 보관합니다. SnapOtter를 가장 빠르게 사용해 보거나 홈랩에서 셀프 호스팅하기에 좋은 방법입니다. 내장 모드는 root(기본값)로 실행되며 `DATABASE_URL`를 설정하는 즉시 자동으로 꺼집니다. 프로덕션에서는 PostgreSQL과 Redis를 각자의 컨테이너에 두는 [Docker Compose 스택](#docker-compose)을 사용하세요.

작업 결과는 데이터 볼륨에 보관되지 않으므로 컨테이너가 교체되면 (예: 이미지 업그레이드) 사라지고, 다운로드 링크도 더 이상 작동하지 않습니다. 배포 가이드의 [작업 출력 보존](/ko/guide/deployment#keeping-job-output)에서 보존하는 방법을 안내합니다.

::: tip RAM 4 GB 이하에서 실행하기
Raspberry Pi, 오래된 노트북, 작은 VPS에서는 작업을 한 번에 하나씩 실행하고, 위 명령에 `-e CONCURRENT_JOBS=1 -e MAX_WORKER_THREADS=2`를 추가해 이미지 스레드 풀을 제한하며, 무거운 AI 번들은 설치하지 마세요. 함께 설정할 만한 다른 제한과 제한된 하드웨어에서 기대할 수 있는 성능은 [저사양 환경 구성](/ko/guide/low-resource#tuning-knobs)에 정리되어 있습니다.
:::

::: tip 익명 제품 분석
SnapOtter에는 기본적으로 익명 제품 분석이 포함되어 있습니다. 끄려면 **설정 → 시스템 → 개인정보 보호**를 열고 **익명 제품 분석**을 끄세요. 인스턴스 전체에서 즉시 중단됩니다.

환경 변수 `SNAPOTTER_TELEMETRY=0`(`false`와 `off`도 사용 가능)를 설정하면 다시 빌드하지 않고도 인스턴스의 모든 텔레메트리를 비활성화할 수 있습니다.

오류 모니터링은 [Sentry](https://sentry.io)가 제공하며, Sentry는 오픈소스 프로그램을 통해 SnapOtter를 후원합니다.

수집되는 항목은 [SnapOtter가 수집하는 정보](/ko/guide/telemetry)를 참고하세요.
:::

## GPU 가속 {#gpu-acceleration}

NVIDIA GPU를 사용하면 무거운 AI 도구가 훨씬 빨라집니다. 업스케일(약 47배), 얼굴 보정(약 12배), 받아쓰기, 배경 제거(각각 약 4배)가 해당합니다. OCR, 얼굴 감지, 사진 복원은 계속 CPU에 의존하므로 GPU가 도움이 되지 않습니다. 같은 이미지로 둘 다 처리할 수 있으며, `--gpus all`를 추가하세요.

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

호스트에 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)이 필요합니다. CUDA를 사용할 수 없으면 SnapOtter가 자동으로 CPU로 전환됩니다. VA-API, Quick Sync, OpenCL을 통한 Intel/AMD iGPU 가속은 현재 AI 추론에서 지원되지 않습니다.

- [하드웨어 요구 사항](/ko/guide/deployment#full-ai-tools-on-nvidia-cuda)에 GPU와 CPU의 전체 처리 시간이, [Docker 이미지 벤치마크](/ko/guide/docker-tags#benchmarks)에 웜 스타트와 콜드 스타트 수치가 있습니다.
- AI 도구가 여전히 CPU에서 실행된다면 [GPU 가속 확인](/ko/guide/deployment#verify-gpu-acceleration)을 참고하세요.
- Compose를 사용한다면 배포 가이드의 [NVIDIA CUDA 빠른 시작](/ko/guide/deployment#quick-start-nvidia-cuda)을 참고하세요.

## 다른 설치 방법 {#other-ways-to-install}

### Compose로 단일 컨테이너 실행 {#single-container-compose}

빠른 시작과 같은 내장 모드 컨테이너를 Compose 파일로 작성한 것으로, 관리하고 수정하기 더 쉽습니다. `docker-compose.yml`로 저장하고 `docker compose up -d`를 실행하세요.

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace  # keeps job results across upgrades
    environment:
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin  # you're asked to change it on first login
    restart: unless-stopped
    # mem_limit: 4g
    # cpus: 2

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
```

`docker run` 명령과 마찬가지로, 이 방식은 SnapOtter를 사용해 보거나 소규모로 설치하기 위한 것입니다. [구성](/ko/guide/configuration)의 모든 설정은 `environment` 아래에 넣습니다.

### Docker Compose (프로덕션) {#docker-compose}

이 페이지의 축약된 Compose 예시를 복사하는 대신, 릴리스마다 관리하고 테스트하는 프로덕션 파일을 사용하세요.

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

[http://localhost:1349](http://localhost:1349)에 접속한 뒤 `admin` / `admin`(으)로 로그인합니다.

표준 [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml)에는 런타임 볼륨 네 개 전부, 상태 확인, 리소스 제한, 내구성 있는 Redis 구성, 고정된 데이터베이스/캐시 이미지, 현재의 컨테이너 보안 강화 설정이 들어 있습니다. 첫 로그인 직후 기본 관리자 비밀번호를 변경하세요. 재현 가능한 배포를 위해 `latest`를 따르는 대신 SnapOtter 애플리케이션 이미지를 확인한 릴리스 태그나 다이제스트로 고정하세요.

모든 환경 변수는 [구성](/ko/guide/configuration)을, 시크릿, 네트워크 정책, 백업 안내는 [보안 및 강화](/ko/guide/security)를 참고하세요.

### GitHub Container Registry {#ghcr}

Docker Hub와 GHCR 모두 릴리스마다 동일한 이미지를 게시합니다. GHCR에서 받으려면 이미지 이름을 바꾸세요.

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

### 소스에서 빌드 {#build-from-source}

**사전 요구 사항:** Node.js 22.22+, pnpm 9+, Docker(Postgres + Redis용), Python 3.11+(AI 기능용), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- 프런트엔드: [http://localhost:1351](http://localhost:1351)
- 백엔드: [http://localhost:13490](http://localhost:13490)

## 할 수 있는 일 {#what-you-can-do}

### 파일 처리 (200개 이상의 도구) {#file-processing-200-tools}

| 유형 | 개수 | 예시 도구 |
|----------|-------|---------------|
| **이미지** | 114 | 크기 조정, 자르기, 압축, 변환, 배경 제거, 업스케일, OCR, 워터마크, 콜라주, 컬러화, GIF 도구, 형식 프리셋 |
| **비디오** | 63 | 자르기, 크롭, 압축, 변환, 병합, 오디오 추출, 자동 자막, 비디오를 GIF로, 크기 조정, 흔들림 보정, 형식 프리셋 |
| **오디오** | 57 | 자르기, 병합, 변환, 노멀라이즈, 노이즈 감소, 받아쓰기, 피치 변경, 페이드, 벨소리 만들기, 형식 프리셋 |
| **PDF / 문서** | 37 | 병합, 분할, 압축, OCR, 워터마크, 가림 처리, Word를 PDF로, Excel을 PDF로, 회전, 보호, 복구 |
| **파일** | 32 | CSV를 JSON으로, JSON을 XML로, CSV 병합, CSV 분할, ZIP 만들기, ZIP 풀기, 차트 만들기, YAML/JSON, 글꼴 변환, 비율 계산기, Base64, 형식 프리셋 |

### 파이프라인 {#pipelines}

도구를 여러 단계의 워크플로로 연결해 이미지 하나 또는 배치 전체에 적용할 수 있습니다.

1. 사이드바에서 **파이프라인**을 엽니다.
2. 단계를 추가합니다(어떤 도구든, 어떤 설정이든 가능).
3. 파일 하나에 실행하거나 배치 전체에 한 번에 실행합니다.
4. 나중에 다시 쓸 수 있도록 파이프라인을 저장합니다.

파이프라인은 기본적으로 20단계까지 허용합니다. 제한을 없애려면 [`MAX_PIPELINE_STEPS=0`](/ko/guide/configuration#env-max-pipeline-steps)를 설정하세요.

### 파일 라이브러리 {#file-library}

처리한 모든 파일을 **파일** 라이브러리에 저장할 수 있습니다. SnapOtter는 전체 버전 기록을 추적하므로 원본 업로드부터 최종 출력까지 모든 처리 단계를 되짚어 볼 수 있습니다.

저장은 명시적으로 이루어집니다. 라이브러리에 저장한 결과는 삭제할 때까지 유지되고, 처리만 하고 저장하지 않은 결과는 72시간 후 자동으로 정리됩니다([`FILE_MAX_AGE_HOURS`](/ko/guide/configuration#env-file-max-age-hours)로 변경 가능).

### REST API 및 API 키 {#rest-api-api-keys}

모든 도구는 HTTP로 사용할 수 있습니다.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

API 키는 **설정 → API 키**에서 생성합니다. 모든 엔드포인트는 [REST API 레퍼런스](/ko/api/rest)를, 대화형 레퍼런스는 [http://localhost:1349/api/docs](http://localhost:1349/api/docs)를 참고하세요.

### 다중 사용자 및 팀 {#multi-user-teams}

역할 기반 접근 제어로 여러 사용자를 사용할 수 있습니다.

- **관리자**: 전체 접근 권한. 사용자, 팀, 설정, 모든 파일/파이프라인/API 키를 관리합니다.
- **사용자**: 도구를 사용하고 자신의 파일/파이프라인/API 키를 관리합니다.

**설정 → 팀**에서 팀을 만들어 사용자를 묶을 수 있습니다.

[`AUTH_ENABLED=true`](/ko/guide/configuration#env-auth-enabled)를 설정하세요(로그인 없이 혼자 사용하는 경우에는 `false`).

## 휴대폰에서 사용하기 {#use-it-from-your-phone}

SnapOtter는 모바일 브라우저에서 동작하며 앱으로 설치할 수도 있습니다. 휴대폰에서 인스턴스를 열고 다음을 따르세요.

- **iPhone / iPad (Safari):** 공유를 누른 다음 **홈 화면에 추가**를 누릅니다.
- **Android (Chrome):** 브라우저 메뉴를 열고 **앱 설치**를 누릅니다.

설치된 앱은 별도의 창으로 열리며 곧바로 인스턴스로 연결됩니다.

한 가지 유의할 점이 있습니다. 브라우저는 HTTPS에서만 설치 안내를 표시합니다. LAN의 일반 HTTP 주소는 브라우저 탭에서는 문제없이 동작하지만, 제대로 설치하려면 인증서가 있는 리버스 프록시 뒤에 인스턴스를 두세요([배포 가이드](/ko/guide/deployment) 참고).

휴대폰과 태블릿에서는 이미지 도구의 업로드 버튼 옆에 **사진 촬영** 버튼이 표시됩니다. 영수증이나 화이트보드를 찍으면 바로 도구로 전달됩니다.
