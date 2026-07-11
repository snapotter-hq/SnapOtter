---
description: "모든 SnapOtter 환경 변수와 기본값. 인증, 스토리지, AI 모델, 분석 등을 구성합니다."
i18n_source_hash: 8e9e9ca2840c
i18n_provenance: human
i18n_output_hash: 6a94a1e1efe3
---

# 구성 {#configuration}

모든 구성은 환경 변수를 통해 이루어집니다. 모든 변수에는 합리적인 기본값이 있으므로 SnapOtter는 아무것도 설정하지 않아도 바로 작동합니다.

## 환경 변수 {#environment-variables}

### 서버 {#server}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `1349` | 서버가 수신 대기하는 포트입니다. |
| `RATE_LIMIT_PER_MIN` | `1000` | IP당 분당 최대 요청 수입니다. 속도 제한을 비활성화하려면 0으로 설정합니다. |
| `CORS_ORIGIN` | (비어 있음) | CORS에 대해 허용된 오리진의 쉼표 구분 목록이며, 동일 오리진만 허용하려면 비워 둡니다. |
| `LOG_LEVEL` | `info` | 로그 상세 수준입니다. 다음 중 하나: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `true` | 리버스 프록시의 `X-Forwarded-For` 헤더를 신뢰합니다. 프록시 뒤에 있지 않으면 `false`로 설정합니다. |

### 인증 {#authentication}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `AUTH_ENABLED` | `false` | 로그인을 요구하려면 `true`로 설정합니다. Docker 이미지의 기본값은 `true`입니다. |
| `DEFAULT_USERNAME` | `admin` | 초기 관리자 계정의 사용자 이름입니다. 첫 실행 시에만 사용됩니다. |
| `DEFAULT_PASSWORD` | `admin` | 초기 관리자 계정의 비밀번호입니다. 첫 로그인 후 변경하세요. |
| `MAX_USERS` | `0` (무제한) | 등록된 사용자 계정의 최대 수입니다. 무제한으로 하려면 0으로 설정합니다. |
| `SESSION_DURATION_HOURS` | `168` | 로그인 세션 수명(시간 단위, 기본값은 7일)입니다. |
| `SKIP_MUST_CHANGE_PASSWORD` | - | 첫 로그인 시 강제 비밀번호 변경 프롬프트를 우회하려면 비어 있지 않은 값으로 설정합니다 |

### 스토리지 {#storage}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` 또는 `s3`. S3/MinIO에는 s3_storage 기능이 포함된 라이선스가 필요합니다. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@postgres:5432/snapotter` | PostgreSQL 연결 문자열입니다. |
| `REDIS_URL` | `redis://redis:6379` | Redis 연결 문자열(BullMQ 작업 큐에 사용)입니다. |
| `WORKSPACE_PATH` | `./tmp/workspace` | 처리 중 임시 파일을 위한 디렉터리입니다. 자동으로 정리됩니다. |
| `FILES_STORAGE_PATH` | `./data/files` | 영구 사용자 파일(업로드된 이미지, 저장된 결과)을 위한 디렉터리입니다. |

### 임베디드 모드 {#embedded-mode}

`DATABASE_URL`와 `REDIS_URL` 없이 이미지를 실행하면 컨테이너 내부에서 자체 PostgreSQL 17과 Redis를 시작하며, 루프백에 바인딩되고 모든 데이터는 `/data` 볼륨에 저장됩니다. 이는 빠른 시작, 홈랩, 1.x에서의 업그레이드를 위한 단일 명령 `docker run` 경험을 복원합니다. 이는 프로덕션 배포가 아니라 편의를 위한 경로입니다. 프로덕션에서는 별도의 PostgreSQL과 Redis가 있는 3개 컨테이너 Compose 스택을 실행하세요. 임베디드 모드는 컨테이너를 루트로 실행해야 하며 임의 UID 런타임(OpenShift, Kubernetes `runAsNonRoot`)과 호환되지 않습니다. 그런 환경에서는 Compose를 사용하세요.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `EMBEDDED` | `auto` | `DATABASE_URL`과 `REDIS_URL`이 모두 설정되지 않으면 자동 활성화됩니다. 비활성화하려면 `0`로 설정합니다(그러면 외부 `DATABASE_URL`/`REDIS_URL`이 설정되지 않은 경우 앱이 조용히 컨테이너 내 데이터베이스를 시작하는 대신 즉시 실패합니다). |
| `REDIS_MAXMEMORY` | `512mb` | 임베디드 Redis의 메모리 상한(임베디드 모드 전용)입니다. Raspberry Pi처럼 메모리가 제한된 호스트에서는 이 값을 낮추세요. |

1.x에서 업그레이드하기: 기존 `snapotter.db`을 볼륨의 `/data/snapotter.db`에 두면 임베디드 모드가 첫 부팅 시 이를 임베디드 PostgreSQL로 가져옵니다. 가져오기는 한 번만 실행되며 이후 부팅에서는 건너뜁니다.

텔레메트리 참고: 임베디드 모드는 다른 구성과 마찬가지로 이미지의 분석 기본값을 상속합니다. 게시된 이미지는 분석이 켜진 상태로 제공됩니다. 비활성화하려면 `--build-arg SNAPOTTER_ANALYTICS=off`로 빌드하거나 앱 내 관리자 옵트아웃을 사용하세요.

### 처리 제한 {#processing-limits}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `100` | 업로드당 최대 파일 크기(메가바이트)입니다. 무제한으로 하려면 0으로 설정합니다. |
| `MAX_BATCH_SIZE` | `100` | 단일 배치 요청의 최대 파일 수입니다. 무제한으로 하려면 0으로 설정합니다. |
| `CONCURRENT_JOBS` | `0` (자동) | 병렬로 실행되는 배치 작업 수입니다. 사용 가능한 CPU 코어를 기준으로 자동 감지하려면 0으로 설정합니다. |
| `MAX_MEGAPIXELS` | `0` (무제한) | 허용되는 최대 이미지 해상도(메가픽셀)입니다. 무제한으로 하려면 0으로 설정합니다. |
| `MAX_WORKER_THREADS` | `0` (자동) | 이미지 처리를 위한 최대 워커 스레드 수입니다. 사용 가능한 CPU 코어를 기준으로 자동 감지하려면 0으로 설정합니다. |
| `PROCESSING_TIMEOUT_S` | `0` (제한 없음) | 요청당 최대 처리 시간(초)입니다. 시간 초과 없음으로 하려면 0으로 설정합니다. |
| `MAX_PIPELINE_STEPS` | `20` | 파이프라인의 최대 단계 수입니다. 제한 없음으로 하려면 0으로 설정합니다. |
| `MAX_CANVAS_PIXELS` | `0` (제한 없음) | 출력 이미지의 최대 캔버스 크기(픽셀)입니다. 제한 없음으로 하려면 0으로 설정합니다. |
| `MAX_SVG_SIZE_MB` | `0` (무제한) | 최대 SVG 파일 크기(메가바이트)입니다. 무제한으로 하려면 0으로 설정합니다. |
| `MAX_SPLIT_GRID` | `100` | 이미지 분할 도구의 최대 그리드 차원입니다. |
| `MAX_PDF_PAGES` | `0` (무제한) | PDF-to-image 변환의 최대 PDF 페이지 수입니다. 무제한으로 하려면 0으로 설정합니다. |

### 정리 {#cleanup}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | 저장되지 않은 처리 결과(원시 업로드 및 도구 출력)를 자동 삭제 전까지 보관하는 기간입니다. Files 라이브러리에 명시적으로 저장한 파일은 영향을 받지 않으며 삭제할 때까지 유지됩니다. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | 정리 작업이 실행되는 빈도입니다. |

### 외관 {#appearance}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `DEFAULT_THEME` | `light` | 새 세션의 기본 테마입니다. `light` 또는 `dark`. |
| `DEFAULT_LOCALE` | `en` | 기본 인터페이스 언어입니다. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | 기본 도구 레이아웃입니다. `sidebar` 또는 `fullscreen`. |

### Docker 권한 {#docker-permissions}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PUID` | `999` | 컨테이너 프로세스를 이 UID로 실행합니다. 바인드 마운트를 위해 호스트 사용자와 일치하도록 설정합니다(`id -u`). |
| `PGID` | `999` | 컨테이너 프로세스를 이 GID로 실행합니다. 바인드 마운트를 위해 호스트 그룹과 일치하도록 설정합니다(`id -g`). |

## Docker 예제 {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
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
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## 볼륨 {#volumes}

Docker Compose 스택은 네 개의 볼륨을 사용합니다.

- `/data` (app) - AI 모델, Python venv, 사용자 파일입니다. 재시작 전반에 걸쳐 업로드된 파일과 설치된 AI 번들을 유지하려면 이것을 마운트하세요.
- `/tmp/workspace` (app) - 처리 중인 파일을 위한 임시 저장소입니다. 임시적일 수 있지만 마운트하면 컨테이너의 쓰기 가능한 계층이 가득 차는 것을 방지합니다.
- `SnapOtter-pgdata` (postgres) - PostgreSQL 데이터 디렉터리입니다. 모든 관계형 데이터(사용자, 설정, 파이프라인, 작업, 감사 로그)를 보관합니다. `pg_dump` 또는 볼륨 스냅샷으로 백업하세요.
- `SnapOtter-redisdata` (redis) - 내구성 있는 작업 큐를 위한 Redis append-only 파일입니다.
