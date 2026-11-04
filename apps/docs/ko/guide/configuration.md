---
description: "기본값과 함께 정리한 SnapOtter 환경 변수 전체 목록입니다. 인증, 스토리지, AI 모델, 분석 등을 설정합니다."
i18n_source_hash: caa895c0ba16
i18n_provenance: machine
i18n_output_hash: de7adba59749
i18n_hash_version: 2
---

# 구성 {#configuration}

모든 구성은 환경 변수로 합니다. 모든 변수에 적절한 기본값이 있으므로 아무것도 설정하지 않아도 SnapOtter는 바로 동작합니다.

## 환경 변수 {#environment-variables}

### 서버 {#server}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `1349` | 서버가 수신 대기하는 포트입니다. |
| `BASE_PATH` | (비어 있음) | 공개 배포 경로입니다. 예: `/snapotter`. 비어 있거나 `/`이면 도메인 루트에서 서비스합니다. 런타임에 적용되며 이미지를 다시 빌드할 필요가 없습니다. |
| `RATE_LIMIT_PER_MIN` | `1000` | IP당 분당 최대 요청 수입니다. 0으로 설정하면 속도 제한이 꺼집니다. |
| `CORS_ORIGIN` | (비어 있음) | CORS에 허용할 출처를 쉼표로 구분한 목록입니다. 비워 두면 동일 출처만 허용합니다. |
| `LOG_LEVEL` | `info` | 로그 상세 수준입니다. 다음 중 하나입니다: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | `X-Forwarded-For`를 통해 클라이언트 IP를 지정할 수 있는 피어를 정합니다. 기본값은 사설 네트워크 피어만 신뢰하므로, Docker 네트워크나 LAN에 있는 리버스 프록시는 신뢰하고 공개 클라이언트가 위조한 헤더는 신뢰하지 않습니다. `true`은 직접 관리하는 프록시가 공개 주소 앞단에 있을 때만 설정하세요. |

### 인증 {#authentication}

아래 두 불리언 값은 `true`과 `false`만 허용합니다. `1`, `yes`, `on` 같은 다른 값은 검증에 실패하고, 서버는 수신 대기를 시작하기 전에 종료됩니다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `AUTH_ENABLED` | `true` | 로그인을 요구합니다. `false`로 설정하면 계정 없이 실행되며 모든 요청에 관리자 권한이 부여되므로, 신뢰할 수 있는 네트워크에서만 사용하세요. |
| `DEFAULT_USERNAME` | `admin` | 초기 관리자 계정의 사용자 이름입니다. 최초 실행 시에만 사용됩니다. |
| `DEFAULT_PASSWORD` | `admin` | 초기 관리자 계정의 비밀번호입니다. 첫 로그인 후 변경하세요. |
| `MAX_USERS` | `0` (무제한) | 등록할 수 있는 사용자 계정의 최대 수입니다. 0으로 설정하면 무제한입니다. |
| `SESSION_DURATION_HOURS` | `168` | 로그인 세션 유지 시간(시간 단위)입니다. 기본값은 7일입니다. |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | `true`로 설정하면 첫 로그인 시 강제로 표시되는 비밀번호 변경 안내를 건너뜁니다. |

### 스토리지 {#storage}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` 또는 `s3`입니다. S3와 MinIO를 쓰려면 s3_storage 기능이 포함된 라이선스와 아래의 `S3_*` 변수가 필요합니다. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL 연결 문자열이며, 모든 요청이 처리되는 연결입니다. 2.3.0 이상에서는 `DATABASE_MIGRATION_URL`도 함께 설정하면 이 변수가 최소 권한 런타임 역할이 되어, 앱 테이블에 대한 DML 권한만 가집니다. Compose 스택은 이 변수를 `postgres` 서비스로 연결합니다. 임베디드 모드를 쓰려면 이 변수를 (`REDIS_URL`와 함께) 설정하지 않은 채로 두세요. |
| `DATABASE_MIGRATION_URL` | (비어 있음) | 부팅 중에만 마이그레이션을 실행하고 런타임 역할에 권한을 부여하는 데 쓰는 권한 있는 연결이며, 첫 요청 전에 닫힙니다. 비워 두면 SnapOtter는 단일 역할로 실행되며 `DATABASE_URL`이 두 작업을 모두 맡습니다. [최소 권한 역할](/ko/guide/database#least-privilege-roles)을 참고하세요. |
| `REDIS_URL` | `redis://localhost:6379` | Redis 연결 문자열입니다(BullMQ 작업 큐에 사용). Compose는 이 변수를 `redis` 서비스로 연결합니다. |
| `WORKSPACE_PATH` | `./tmp/workspace` | 처리 중 임시 파일을 두는 디렉터리입니다. 자동으로 정리됩니다. 이미지는 `/tmp/workspace`을 설정합니다. |
| `FILES_STORAGE_PATH` | `./data/files` | 영구 사용자 파일(업로드한 이미지, 저장한 결과)을 두는 디렉터리입니다. 이미지는 `/data/files`을 설정합니다. |

### S3 오브젝트 스토리지 {#s3-object-storage}

`STORAGE_MODE=s3`일 때만 읽습니다. 필수 변수 세 가지 중 하나라도 빠지면 시작에 실패하며, 빠뜨린 변수의 이름이 표시됩니다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `S3_BUCKET` | (비어 있음) | 업로드와 출력을 보관하는 버킷입니다. 필수입니다. |
| `S3_ACCESS_KEY_ID` | (비어 있음) | 액세스 키입니다. 필수입니다. 컨테이너에서는 `S3_ACCESS_KEY_ID_FILE`을 통해 마운트할 수도 있습니다. |
| `S3_SECRET_ACCESS_KEY` | (비어 있음) | 시크릿 키입니다. 필수입니다. 같은 파일 규칙을 따릅니다: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | 버킷 리전입니다. |
| `S3_ENDPOINT` | (비어 있음) | MinIO, R2, Backblaze 등 S3 호환 스토어를 위한 사용자 지정 엔드포인트입니다. 비어 있으면 AWS를 뜻합니다. |
| `S3_FORCE_PATH_STYLE` | `false` | MinIO처럼 가상 호스트 방식 대신 `endpoint/bucket/key`을 요구하는 경우 `true`로 설정하세요. |
| `S3_PREFIX` | (비어 있음) | 키 접두사입니다. 버킷 하나에 여러 인스턴스를 둘 수 있습니다. |

### 저장 시 암호화 {#encryption-at-rest}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (비어 있음) | 16진수 64자(32바이트)입니다. 데이터베이스에 저장되는 민감한 설정을 암호화합니다. 16진수 64자가 아니면 시작할 때 거부됩니다. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (비어 있음) | 교체하려는 이전 키이며 형식은 같습니다. 키를 교체하는 동안에는 기존 행을 계속 복호화할 수 있도록 두 변수를 모두 설정하고, 이후에 이 변수를 제거하세요. |

### 임베디드 모드 {#embedded-mode}

`DATABASE_URL`과 `REDIS_URL` 없이 이미지를 실행하면 컨테이너 안에서 PostgreSQL 17과 Redis를 직접 시작합니다. 둘 다 루프백에 바인딩되며 모든 데이터는 `/data` 볼륨에 저장됩니다. 이렇게 하면 빠른 시작, 홈랩, 1.x에서의 업그레이드를 위한 한 줄 `docker run` 환경이 되살아납니다. 이것은 편의를 위한 경로이며 프로덕션 배포용이 아닙니다. 프로덕션에서는 PostgreSQL과 Redis를 분리한 3컨테이너 Compose 스택을 실행하세요. 임베디드 모드는 컨테이너를 root로 실행해야 하며, 임의 UID 런타임(OpenShift, Kubernetes `runAsNonRoot`)과는 호환되지 않으므로 그런 환경에서는 Compose를 사용하세요.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `EMBEDDED` | `auto` | `DATABASE_URL`와 `REDIS_URL`가 둘 다 설정되지 않았을 때 자동으로 켜집니다. `0`로 설정하면 끌 수 있으며, 이 경우 외부 `DATABASE_URL`/`REDIS_URL`가 없으면 앱이 컨테이너 내부 데이터베이스를 조용히 시작하는 대신 즉시 실패합니다. |
| `REDIS_MAXMEMORY` | `512mb` | 임베디드 Redis의 메모리 상한입니다(임베디드 모드 전용). Raspberry Pi처럼 메모리가 제한된 호스트에서는 값을 낮추세요. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | 부팅 시 임베디드 Redis가 `PING`에 응답하기를 기다리는 시간(초)이며, 이 시간이 지나면 포기합니다. 시간이 초과되면 컨테이너는 멈춘 채로 있지 않고 중지되어 원인을 로그에 남깁니다. 1에서 999999 사이의 정수 초이며 무제한 값은 없습니다. 무한정 기다리는 것이 바로 이 제한이 막으려는 장애이기 때문입니다. 느린 호스트에서 시간이 초과될 때만 늘리세요. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | 임베디드 PostgreSQL에 대한 같은 설정입니다. 시계는 최초 부팅 시 `initdb`가 끝난 뒤부터 시작하므로, 초기 데이터베이스 생성이 아니라 서버 시작과 충돌 복구에 걸리는 시간을 다룹니다. |

1.x에서 업그레이드하는 경우: 이전 `snapotter.db`를 볼륨의 `/data/snapotter.db`에 두면 임베디드 모드가 첫 부팅 때 이를 임베디드 PostgreSQL로 가져옵니다. 가져오기는 한 번만 실행되며 이후 부팅에서는 건너뜁니다.

원격 분석 참고: 임베디드 모드도 다른 구성과 마찬가지로 이미지의 분석 기본값을 그대로 따릅니다. 배포 이미지는 분석이 켜진 상태로 제공됩니다. 끄려면 `--build-arg SNAPOTTER_ANALYTICS=off`로 빌드하거나 앱 내 관리자 옵트아웃을 사용하세요.

### 처리 제한 {#processing-limits}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (무제한) | 업로드당 최대 파일 크기(MB)입니다. 0으로 설정하면 무제한입니다. 배포 이미지는 `0`을 사용하고, 소스 빌드는 100에서 시작합니다. |
| `MAX_BATCH_SIZE` | `0` (무제한) | 단일 일괄 요청에 포함할 수 있는 최대 파일 수입니다. 0으로 설정하면 무제한입니다. 배포 이미지는 `0`을 사용하고, 소스 빌드는 100에서 시작합니다. |
| `CONCURRENT_JOBS` | `0` (자동) | 병렬로 실행하는 일괄 작업 수입니다. 0으로 설정하면 사용 가능한 CPU 코어 수에 따라 자동으로 정합니다. |
| `MAX_MEGAPIXELS` | `0` (무제한) | 허용하는 최대 이미지 해상도(메가픽셀)입니다. 0으로 설정하면 무제한입니다. |
| `MAX_WORKER_THREADS` | `0` (자동) | 이미지 처리에 사용하는 최대 워커 스레드 수입니다. 0으로 설정하면 사용 가능한 CPU 코어 수에 따라 자동으로 정합니다. |
| `PROCESSING_TIMEOUT_S` | `0` (제한 없음) | 요청당 최대 처리 시간(초)입니다. 0으로 설정하면 시간 제한이 없습니다. |
| `MAX_PIPELINE_STEPS` | `20` | 파이프라인의 최대 단계 수입니다. 0으로 설정하면 제한이 없습니다. |
| `MAX_CANVAS_PIXELS` | `0` (제한 없음) | 출력 이미지의 최대 캔버스 크기(픽셀)입니다. 0으로 설정하면 제한이 없습니다. |
| `MAX_SVG_SIZE_MB` | `50` | 정리(sanitize)하기 전에 허용하는 가장 큰 SVG의 크기(MB)입니다. `0`은 이 변수에서만 주변 행과 다르게 동작합니다. 상한을 높이는 것이 아니라 파싱 전 크기 제한을 아예 없애므로, 이 변수는 값을 설정한 채로 두세요. |
| `MAX_PDF_PAGES` | `0` (무제한) | PDF를 이미지로 변환할 때 처리하는 최대 PDF 페이지 수입니다. 0으로 설정하면 무제한입니다. |

### 엔진 {#engines}

SnapOtter는 컨테이너 안의 `$PATH`에서 각 처리 바이너리를 찾으므로, 직접 빌드한 바이너리를 마운트하지 않는 한 아래 변수는 비워 둡니다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `FFMPEG_PATH` | (비어 있음) | 비디오 및 오디오 도구가 사용하는 `ffmpeg` 바이너리의 경로입니다. |
| `FFPROBE_PATH` | (비어 있음) | 처리 전에 미디어 파일을 읽는 `ffprobe`의 경로입니다. `FFMPEG_PATH`와 같은 빌드를 가리키게 하세요. |
| `QPDF_PATH` | (비어 있음) | PDF 도구와 업로드된 PDF 검사에 사용하는 `qpdf`의 경로입니다. |
| `SOFFICE_PATH` | (비어 있음) | 오피스 문서 변환에 사용하는 LibreOffice의 `soffice` 경로입니다. |
| `PDFCPU_PATH` | (비어 있음) | 일부 PDF 도구가 사용하는 `pdfcpu`의 경로입니다. |
| `SNAPOTTER_HW_ACCEL` | (비어 있음) | 하드웨어 비디오 인코더 계열이며 `nvenc` 또는 `vaapi`입니다. 비워 두면 소프트웨어로 인코딩합니다. |

`SNAPOTTER_HW_ACCEL`을 사용하려면 해당 인코더 계열로 빌드한 ffmpeg가 필요한데, 이미지에 포함된 ffmpeg는 둘 다 지원하지 않습니다. 이미지에 들어 있는 바이너리를 쓰면 이 설정은 소프트웨어 인코딩으로 대체되며 시작 로그에 그 사실이 기록됩니다. 사용하려면 직접 빌드한 ffmpeg를 마운트하고, `FFMPEG_PATH`와 `FFPROBE_PATH`가 이를 가리키게 한 다음, 컨테이너에 GPU 장치를 제공하세요. `nvenc`의 경우 `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`도 설정해야 합니다. 이미지는 `compute,utility`만 요청하는데, `video`가 없으면 NVIDIA 런타임이 인코드 라이브러리를 마운트하지 않아서 인코더는 목록에 나타나지만 모든 인코딩이 실패합니다. 존재하지 않거나 실행할 수 없는 경로 재정의도 시작 로그에 표시되며, 경로를 고치거나 설정을 해제할 때까지 해당 바이너리가 필요한 모든 작업이 실패합니다.

배포된 Compose 파일은 여섯 가지 모두를 `.env`에서 전달하므로 거기에 설정하면 충분합니다.

### 정리 {#cleanup}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | 저장하지 않은 처리 결과(원본 업로드와 도구 출력)를 자동 삭제하기 전까지 보관하는 기간입니다. 파일 라이브러리에 직접 저장한 파일은 영향을 받지 않으며 삭제할 때까지 유지됩니다. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | 정리 작업을 실행하는 주기입니다. |

### 모양 {#appearance}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `DEFAULT_THEME` | `light` | 새 세션의 기본 테마입니다. `light`, `dark`, `system` 중 하나입니다. |
| `DEFAULT_LOCALE` | `en` | 기본 인터페이스 언어입니다. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | 기본 도구 레이아웃입니다. `sidebar` 또는 `fullscreen`입니다. |

### Docker 권한 {#docker-permissions}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PUID` | `999` | 컨테이너 프로세스를 이 UID로 실행합니다. 바인드 마운트를 쓸 때는 호스트 사용자와 맞추세요(`id -u`). |
| `PGID` | `999` | 컨테이너 프로세스를 이 GID로 실행합니다. 바인드 마운트를 쓸 때는 호스트 그룹과 맞추세요(`id -g`). |

## Docker 예시 {#docker-example}

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
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
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

Docker Compose 스택은 볼륨 네 개를 사용합니다.

- `/data` (app) - AI 모델, Python venv, 사용자 파일입니다. 재시작 후에도 업로드한 파일과 설치한 AI 번들을 유지하려면 마운트하세요.
- `/tmp/workspace` (app) - 처리 중인 파일을 위한 임시 저장소입니다. 휘발성이어도 되지만, 마운트하면 컨테이너의 쓰기 가능 레이어가 가득 차는 것을 막을 수 있습니다.
- `SnapOtter-pgdata` (postgres) - PostgreSQL 데이터 디렉터리입니다. 모든 관계형 데이터(사용자, 설정, 파이프라인, 작업, 감사 로그)가 여기에 있습니다. `pg_dump` 또는 볼륨 스냅샷으로 백업하세요.
- `SnapOtter-redisdata` (redis) - 내구성 있는 작업 큐를 위한 Redis append-only 파일입니다.
