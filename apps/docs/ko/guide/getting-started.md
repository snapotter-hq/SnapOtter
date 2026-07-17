---
description: "명령 하나로 Docker에 SnapOtter를 설치. Docker Compose 설정, 소스에서 빌드하기, 전체 기능 개요 포함."
i18n_output_hash: 55c67edda625
i18n_source_hash: 68bf7f60b68d
i18n_provenance: human
---

# 시작하기 {#getting-started}

::: tip 설치 전에 사용해 보기
[demo.snapotter.com](https://demo.snapotter.com)에서 전체 UI를 살펴보세요 - 가입이나 설치가 필요 없습니다.
:::

## 빠른 시작 {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

이 단일 컨테이너는 필요한 모든 것을 실행한다. `DATABASE_URL`이 설정되어 있지 않으면, 루프백 인터페이스에서 자체 PostgreSQL과 Redis를 시작하고(임베디드 모드) 모든 데이터를 `SnapOtter-data` 볼륨에 보관한다. SnapOtter를 사용해 보거나 홈랩에서 셀프 호스팅하기에 가장 빠른 방법이다. 프로덕션에서는 PostgreSQL과 Redis를 각자의 컨테이너에 두는 아래의 [Docker Compose](#docker-compose) 스택을 실행하라. 임베디드 모드는 root로 실행되며(기본값), `DATABASE_URL`을 설정하는 즉시 자동으로 꺼진다.

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

[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)이 필요하다. CUDA를 사용할 수 없으면 자동으로 CPU로 폴백한다. VA-API, Quick Sync, OpenCL을 통한 Intel/AMD iGPU 가속은 현재 AI 추론에 지원되지 않는다. 벤치마크는 [Docker 태그](/ko/guide/docker-tags)를 참고하라.
:::

::: details GHCR에서도 제공
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

두 레지스트리 모두 릴리스마다 동일한 이미지를 게시한다.
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

모든 환경 변수는 [구성](/ko/guide/configuration)을 참고하라.

## 소스에서 빌드 {#build-from-source}

**전제 조건:** Node.js 22+, pnpm 9+, Docker (Postgres + Redis용), Python 3.10+ (AI 기능용), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- 프론트엔드: [http://localhost:1349](http://localhost:1349)
- 백엔드: [http://localhost:13490](http://localhost:13490)

## 할 수 있는 것 {#what-you-can-do}

### 파일 처리 (200+ 도구) {#file-processing-200-tools}

| 모달리티 | 개수 | 예시 도구 |
|----------|-------|---------------|
| **이미지** | 105 | 크기 조정, 자르기, 압축, 변환, 배경 제거, 업스케일, OCR, 워터마크, 콜라주, 컬러화, GIF 도구, 형식 프리셋 |
| **비디오** | 57 | 트림, 자르기, 압축, 변환, 병합, 오디오 추출, 자동 자막, 비디오→GIF, 크기 조정, 안정화, 형식 프리셋 |
| **오디오** | 27 | 트림, 병합, 변환, 노멀라이즈, 노이즈 감소, 전사, 피치 시프트, 페이드, 벨소리 제작기, 형식 프리셋 |
| **PDF / 문서** | 42 | 병합, 분할, 압축, OCR, 워터마크, 편집(리댁트), Word→PDF, Excel→PDF, 회전, 보호, 복구 |
| **파일** | 10 | CSV→JSON, JSON→XML, CSV 병합, CSV 분할, ZIP 생성, ZIP 추출, 차트 제작기, YAML/JSON |

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
