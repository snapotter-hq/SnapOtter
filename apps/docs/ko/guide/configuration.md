---
description: "기본값과 함께 정리한 SnapOtter 환경 변수 전체 목록입니다. 인증, 스토리지, AI 모델, 분석 등을 설정합니다."
i18n_source_hash: 0a7a78fd254c
i18n_provenance: machine
i18n_output_hash: fa3437777f6c
i18n_hash_version: 2
---

# 구성 {#configuration}

모든 구성은 환경 변수로 합니다. 모든 변수에 적절한 기본값이 있으므로 아무것도 설정하지 않아도 SnapOtter는 바로 동작합니다.

## 환경 변수 {#environment-variables}

### 서버 {#server}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `1349` | 서버가 수신 대기하는 포트입니다. |
| `HOST` | `0.0.0.0` | 서버가 수신 대기하는 IP 주소입니다. 브리지 네트워크(`docker run`과 Compose의 기본값)에서는 `0.0.0.0`(또는 `::`)을 유지하세요. 그렇지 않으면 게시된 포트가 동작하지 않게 됩니다. 네이티브 설치나 호스트 네트워크의 컨테이너에서는 `127.0.0.1`을 사용하면 API가 네트워크에 노출되지 않습니다. 원격으로 접근하려면 앞단에 리버스 프록시를 두세요. [임베디드 모드](#embedded-mode)는 `0.0.0.0`, `::` 또는 `127.0.0.1`에서만 동작하는데, 시작 확인이 `127.0.0.1`을 호출하기 때문입니다. `::1`을 포함한 그 밖의 주소에서는 컨테이너가 시작된 것으로 간주되지 않으며, 이후 충돌이 발생하면 서버를 재시작하는 대신 컨테이너가 중지됩니다. `localhost`를 포함해 IP 주소가 아닌 값은 시작 시 서버를 중지시킵니다. |
| `BASE_PATH` | (비어 있음) | 공개 배포 경로입니다. 예: `/snapotter`. 비어 있거나 `/`이면 도메인 루트에서 서비스합니다. 런타임에 적용되며 이미지를 다시 빌드할 필요가 없습니다. |
| `RATE_LIMIT_PER_MIN` | `1000` | IP당 분당 최대 요청 수입니다. 0으로 설정하면 속도 제한이 꺼집니다. |
| `API_KEYS_RATE_LIMIT_PER_MIN` | `30` | API 키 관리 엔드포인트(목록, 생성, 폐기)에 대한 IP당 분당 최대 요청 수입니다. 도구 호출에 사용 중인 키는 영향을 받지 않습니다. 제한을 없애려면 `0`으로 설정하세요. |
| `CORS_ORIGIN` | (비어 있음) | CORS에 허용할 출처를 쉼표로 구분한 목록입니다. 비워 두면 동일 출처만 허용합니다. |
| `LOG_LEVEL` | `info` | 로그 상세 수준입니다. 다음 중 하나입니다: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | `X-Forwarded-For`를 통해 클라이언트 IP를 지정할 수 있는 피어를 정합니다. 기본값은 사설 네트워크 피어만 신뢰하므로, Docker 네트워크나 LAN에 있는 리버스 프록시는 신뢰하고 공개 클라이언트가 위조한 헤더는 신뢰하지 않습니다. `true`는 직접 관리하는 프록시가 공개 주소 앞단에 있을 때만 설정하세요. |
| `SNAPOTTER_ANALYTICS_DEFAULT` | `on` | `off`로 설정하면 새 인스턴스가 "Anonymous Product Analytics"가 꺼진 상태로 시작하여 첫 부팅부터 아무것도 전송하지 않습니다. 이 변수는 아직 아무도 값을 선택하지 않았을 때만 해당 설정을 채웁니다. 관리자나 이 변수에 의해 설정이 한 번 저장되면 변수를 바꿔도 아무 효과가 없습니다. 관리자는 여전히 Settings > System > Privacy에서 분석을 켤 수 있습니다. |

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
| `LOGIN_ATTEMPT_LIMIT` | `30` | IP당 분당 최대 로그인 요청 수입니다. 이후 시도는 해당 1분이 지날 때까지 `429`를 받습니다. 한 사용자 이름에 대한 반복 실패는 보통 `LOGIN_THROTTLE_MAX_FAILURES`에 먼저 도달합니다. 관리자는 Settings > System에서 재정의할 수 있습니다. 제한을 없애려면 `0`으로 설정하세요. 소스 빌드는 10에서 시작합니다. |
| `LOGIN_THROTTLE_MAX_FAILURES` | `10` | 한 사용자 이름이 `LOGIN_THROTTLE_WINDOW_S` 동안 가질 수 있는 비밀번호 로그인 실패 횟수입니다. 이를 넘으면 어떤 IP에서 오든 해당 사용자 이름에 대한 이후 시도가 `429`를 받습니다. 가장 오래된 실패가 구간 밖으로 밀려나면 다시 허용됩니다. 0으로 설정하면 제한이 꺼집니다. |
| `LOGIN_THROTTLE_WINDOW_S` | `900` | 해당 구간의 길이(초)입니다. 최소 1이어야 하며, 0이면 서버가 시작을 거부합니다. |

### 스토리지 {#storage}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` 또는 `s3`입니다. S3와 MinIO를 쓰려면 s3_storage 기능이 포함된 라이선스와 아래의 `S3_*` 변수가 필요합니다. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL 연결 문자열이며, 모든 요청이 처리되는 연결입니다. 2.3.0 이상에서는 `DATABASE_MIGRATION_URL`도 함께 설정하면 이 변수가 최소 권한 런타임 역할이 되어, 앱 테이블에 대한 DML 권한만 가집니다. Compose 스택은 이 변수를 `postgres` 서비스로 연결합니다. 임베디드 모드를 쓰려면 이 변수를 (`REDIS_URL`과 함께) 설정하지 않은 채로 두세요. 유닉스 소켓으로 연결하려면 `host`에 소켓 디렉터리를 지정하고(예: `postgres://user:pass@localhost/snapotter?host=/var/run/postgresql`) 그 디렉터리를 컨테이너에 마운트하세요. |
| `DATABASE_MIGRATION_URL` | (비어 있음) | 부팅 중에만 마이그레이션을 실행하고 런타임 역할에 권한을 부여하는 데 쓰는 권한 있는 연결이며, 첫 요청 전에 닫힙니다. 비워 두면 SnapOtter는 단일 역할로 실행되며 `DATABASE_URL`이 두 작업을 모두 맡습니다. [최소 권한 역할](/ko/guide/database#least-privilege-roles)을 참고하세요. |
| `REDIS_URL` | `redis://localhost:6379` | Redis 연결 문자열입니다(BullMQ 작업 큐에 사용). Compose는 이 변수를 `redis` 서비스로 연결합니다. 유닉스 소켓에는 `unix:///run/redis/redis.sock?db=5`을 사용하고(Redis에 필요하면 `&password=...` 추가) 소켓을 컨테이너에 마운트하세요. |
| `WORKSPACE_PATH` | `./tmp/workspace` | 처리 중 임시 파일을 두는 디렉터리입니다. 자동으로 정리됩니다. 이미지는 `/tmp/workspace`을 설정합니다. |
| `FILES_STORAGE_PATH` | `./data/files` | 영구 사용자 파일(업로드한 이미지, 저장한 결과)을 두는 디렉터리입니다. 이미지는 `/data/files`을 설정합니다. |
| `MAX_STORAGE_PER_USER_MB` | `5000` | 각 사용자가 파일 라이브러리에 보관할 수 있는 양의 상한(MB)입니다. 이를 넘는 저장은 사용량과 한도를 알려 주며 거부됩니다. 사용자에게 설정된 할당량이 있으면 그 값이 우선합니다. 0으로 설정하면 무제한입니다. |

### S3 오브젝트 스토리지 {#s3-object-storage}

`STORAGE_MODE=s3`일 때만 읽습니다. 필수 변수 세 가지 중 하나라도 빠지면 시작에 실패하며, 빠뜨린 변수의 이름이 표시됩니다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `S3_BUCKET` | (비어 있음) | 업로드와 출력을 보관하는 버킷입니다. 필수입니다. |
| `S3_ACCESS_KEY_ID` | (비어 있음) | 액세스 키입니다. 필수입니다. 컨테이너에서는 `S3_ACCESS_KEY_ID_FILE`을 통해 마운트할 수도 있습니다. |
| `S3_SECRET_ACCESS_KEY` | (비어 있음) | 시크릿 키입니다. 필수입니다. 같은 파일 규칙을 따릅니다: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | 버킷 리전입니다. |
| `S3_ENDPOINT` | (비어 있음) | MinIO, R2, Backblaze 등 S3 호환 스토어를 위한 사용자 지정 엔드포인트입니다. 비어 있으면 AWS를 뜻합니다. |
| `S3_FORCE_PATH_STYLE` | `false` | `true`로 설정하면 MinIO 등 가상 호스트 방식 대신 `endpoint/bucket/key` 방식을 요구하는 스토어에 사용할 수 있습니다. |
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
| `EMBEDDED_PG_PORT` | `5432` | 임베디드 PostgreSQL의 루프백 포트입니다(임베디드 모드 전용). `--network host`처럼 5432번 포트가 이미 사용 중인 네트워크를 컨테이너가 공유할 때만 변경하세요. PostgreSQL은 호스트 네트워크에서 특권 포트에 바인딩할 수 없는 비특권 사용자로 실행되므로, 이 값은 `EMBEDDED_REDIS_PORT`와 달라야 하며 1023보다 커야 합니다. |
| `EMBEDDED_REDIS_PORT` | `6379` | 임베디드 Redis에 대한 같은 설정입니다. Redis도 비특권 사용자로 실행됩니다. |
| `EMBEDDED_DB_PASSWORDS` | (비어 있음) | `1`로 설정하면 다음 부팅 때 임베디드 PostgreSQL 역할과 Redis용 무작위 비밀번호를 생성하여 `/data/.embedded-db-secrets`에 보관합니다. 이후 TCP 로그인에는 이 비밀번호가 필요합니다. 2.3.0 이상에서 처음 생성된 볼륨에서는 PostgreSQL 슈퍼유저가 TCP로 아예 로그인할 수 없습니다. 이전 볼륨에서는 데이터베이스 소유자가 슈퍼유저이며, 그 비밀번호가 이를 보호합니다. `--network host`처럼 다른 프로그램이 컨테이너의 네트워크를 공유할 때는 언제든 이 변수를 사용하세요. 이 설정은 해당 볼륨에서 계속 유지됩니다. 이 변수를 해제해도 비밀번호는 매 부팅 때 사용되며, `/data/.embedded-db-secrets`를 삭제하면 새 비밀번호가 만들어질 뿐이고, 변수가 설정되지 않은 경우에는 부팅이 실패합니다. 이 파일 중 하나가 손상되어 컨테이너가 시작되지 않으면 `docker run --rm -v <volume>:/data --entrypoint rm snapotter/snapotter:<your tag> -r /data/.embedded-db-secrets/<name>`로 해당 파일을 삭제하고 컨테이너를 다시 시작하세요. 다음 부팅 때 새 파일이 만들어집니다. 이 변수는 `1`, `0` 또는 빈 값을 받으며, 그 밖의 값은 부팅을 중지시킵니다. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | 부팅 시 임베디드 Redis가 `PING`에 응답하기를 기다리는 시간(초)이며, 이 시간이 지나면 포기합니다. 시간이 초과되면 컨테이너는 멈춘 채로 있지 않고 중지되어 원인을 로그에 남깁니다. 1에서 999999 사이의 정수 초이며 무제한 값은 없습니다. 무한정 기다리는 것이 바로 이 제한이 막으려는 장애이기 때문입니다. 느린 호스트에서 시간이 초과될 때만 늘리세요. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | 임베디드 PostgreSQL에 대한 같은 설정입니다. 시계는 최초 부팅 시 `initdb`가 끝난 뒤부터 시작하므로, 초기 데이터베이스 생성이 아니라 서버 시작과 충돌 복구에 걸리는 시간을 다룹니다. |

1.x에서 업그레이드하는 경우: 이전 `snapotter.db`를 볼륨의 `/data/snapotter.db`에 두면 임베디드 모드가 첫 부팅 때 이를 임베디드 PostgreSQL로 가져옵니다. 가져오기는 한 번만 실행되며 이후 부팅에서는 건너뜁니다.

원격 분석 참고: 임베디드 모드도 다른 구성과 마찬가지로 이미지의 분석 기본값을 그대로 따릅니다. 배포 이미지는 분석이 켜진 상태로 제공됩니다. 끄려면 `--build-arg SNAPOTTER_ANALYTICS=off`로 빌드하거나, 첫 부팅 전에 `SNAPOTTER_ANALYTICS_DEFAULT=off`를 설정하거나, 앱 내 관리자 옵트아웃을 사용하세요.

### 처리 제한 {#processing-limits}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (무제한) | 업로드당 최대 파일 크기(MB)입니다. 0으로 설정하면 무제한입니다. 배포 이미지는 `0`을 사용하고, 소스 빌드는 100에서 시작합니다. |
| `MAX_BATCH_SIZE` | `0` (무제한) | 단일 일괄 요청에 포함할 수 있는 최대 파일 수입니다. 0으로 설정하면 무제한입니다. 배포 이미지는 `0`을 사용하고, 소스 빌드는 100에서 시작합니다. |
| `CONCURRENT_JOBS` | `0` (자동) | 병렬로 실행하는 일괄 작업 수입니다. 0으로 설정하면 사용 가능한 CPU 코어 수에 따라 자동으로 정합니다. |
| `MAX_MEGAPIXELS` | `0` (앱 제한 없음) | 허용하는 최대 이미지 해상도(메가픽셀)입니다. 0으로 설정하면 SnapOtter 자체의 제한을 없앱니다. 그래도 이미지 디코더는 약 268 MP(16383 x 16383 픽셀)를 넘는 이미지를 거부하므로, 268보다 큰 값은 추가 효과가 없습니다. |
| `MAX_CPU_UPSCALE_MP` | `4` | GPU가 없는 호스트에서 AI 업스케일링이 받아들이는 최대 입력 크기(메가픽셀)입니다. 업스케일된 출력도 이 값의 16배(기본값 64 MP)로 제한되므로, 배율이 높으면 입력 한도가 더 낮아집니다. 더 큰 이미지는 업스케일링 전에 맞게 축소됩니다. 그렇게 해도 결과가 원본보다 커지지 않는다면 요청이 거부됩니다. Lanczos는 입력 한도는 건너뛰지만 출력 상한은 적용됩니다. 0으로 설정하면 제한이 없지만 RAM이 많이 필요합니다. RealESRGAN은 내부적으로 항상 4배 버퍼를 만듭니다. |
| `MAX_WORKSPACE_SIZE_GB` | `0` (무제한) | 워크스페이스의 업로드와 저장된 결과를 합친 크기의 상한(GB)입니다. 이를 넘으면 `FILE_MAX_AGE_HOURS` 후에 파일이 만료될 때까지 업로드와 도구 요청이 503을 받습니다. 0으로 설정하면 무제한이며, 로컬 스토리지는 디스크 여유 공간이 0.5 GB 미만이 되면 여전히 503으로 쓰기를 거부합니다. 배포 이미지는 `0`을 사용하고, 소스 빌드는 10에서 시작합니다. |
| `MAX_WORKER_THREADS` | `0` (자동) | 이미지 처리에 사용하는 최대 워커 스레드 수입니다. 0으로 설정하면 사용 가능한 CPU 코어 수에 따라 자동으로 정합니다. |
| `PROCESSING_TIMEOUT_S` | `0` (제한 없음) | AI 도구를 실행하는 Python 사이드카에 대한 각 호출의 시간 제한(초)입니다. 0으로 설정하면 제한이 없습니다. 이미지, PDF, 미디어 작업에는 상한을 두지 않으며, 이는 `JOB_TIMEOUT_FAST_S`와 `JOB_TIMEOUT_LONG_S`가 담당합니다. |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Python AI 사이드카와 정확한 OCR 런타임이 유휴 상태로 있다가 종료하여 메모리를 해제하기까지의 시간(초)입니다(웜 상태에서 각각 약 1.3 GB와 0.7 GB). 둘 다 다음 요청 때 다시 시작되므로, 유휴 종료 후 첫 AI 호출에는 라이브러리 시작 비용으로 몇 초가 걸립니다. 0으로 설정하면 계속 실행 상태로 유지됩니다. 기본값은 `AI_SESSION_IDLE_TIMEOUT`과 같으므로, 로드된 모델이 해당 설정보다 일찍 해제되지 않습니다. `AI_SESSION_IDLE_TIMEOUT`을 늘리면 이 값도 맞춰 늘리세요. |
| `AI_SESSION_IDLE_TIMEOUT` | `0` (자동) | 로드된 AI 모델이 마지막 사용 후 사이드카에 캐시된 채로 남아 있는 시간(초)입니다. 자동은 600입니다. Python 사이드카가 읽으며, 이 사이드카는 `AI_SIDECAR_IDLE_TIMEOUT` 후 종료할 때 캐시된 모델도 모두 버립니다. |
| `AI_SESSION_CACHE_BYTES` | `0` (자동) | 캐시된 AI 모델의 메모리 예산(바이트)입니다. 자동은 GPU 메모리의 40%이며, CPU 전용 호스트에서는 캐시를 전혀 하지 않습니다. CPU 호스트에서 모델을 RAM에 캐시하려면 이 값을 설정하고, GPU 호스트에서 캐시를 끄려면 1로 설정하세요. Python 사이드카가 읽습니다. |
| `MAX_AI_JOBS_PER_USER` | `5` | 한 사용자가 동시에 대기열에 두거나 실행할 수 있는 단일 파일 AI 작업 수입니다. 초과분은 하나가 끝날 때까지 `429`를 받습니다. AI 풀은 한 번에 작업 하나를 실행하므로, 이 값은 한 사용자가 풀을 독점하지 못하게 합니다. 일괄 처리와 파이프라인의 AI 실행은 포함되지 않습니다. 0으로 설정하면 무제한입니다. |
| `JOB_TIMEOUT_FAST_S` | `120` | 빠른 풀(이미지 및 문서 도구)에서 작업 하나에 허용되는 기한(초)입니다. 이보다 오래 실행되는 작업은 시간 초과 오류로 실패합니다. 0으로 설정하면 제한이 없습니다. |
| `JOB_TIMEOUT_LONG_S` | `7200` | 긴 풀(AI 및 미디어 도구, 그리고 장시간 실행으로 표시된 모든 도구)에서 작업 하나에 허용되는 기한(초)입니다. 0으로 설정하면 제한이 없습니다. Balanced 및 Best PDF OCR은 페이지 수에 따라 자체 기한을 최대 6시간까지 연장하므로(페이지당 각각 2분과 5분), 큰 PDF라도 이 값을 늘릴 필요가 없습니다. |
| `SYNC_WAIT_MS` | `8000` | API가 기다림을 멈추고 SSE로 추적할 작업 ID와 함께 `202`를 반환하기 전까지 도구 요청이 작업을 기다리는 시간(밀리초)입니다. 작업 자체를 중지하지는 않습니다. 0으로 설정하면 작업이 얼마나 걸리든 기다립니다. |
| `MAX_PIPELINE_STEPS` | `20` | 파이프라인의 최대 단계 수입니다. 0으로 설정하면 제한이 없습니다. |
| `MAX_PIPELINE_STEP_PIXELS` | `67108864` | 파이프라인 단계 하나가 요청할 수 있는 최대 출력 크기로, 가로 곱하기 세로 픽셀 수입니다(기본값은 8192 x 8192). 설정이 이보다 큰 크기를 요청하는 단계는 파이프라인이 실행되기 전에 거부됩니다. 0으로 설정하면 제한이 없습니다. |
| `MAX_CANVAS_PIXELS` | `0` (제한 없음) | 출력 이미지의 최대 캔버스 크기(픽셀)입니다. 0으로 설정하면 제한이 없습니다. |
| `MAX_SVG_SIZE_MB` | `50` | 정리(sanitize)하기 전에 허용하는 가장 큰 SVG의 크기(MB)입니다. `0`은 이 변수에서만 주변 행과 다르게 동작합니다. 상한을 높이는 것이 아니라 파싱 전 크기 제한을 아예 없애므로, 이 변수는 값을 설정한 채로 두세요. |
| `MAX_PDF_PAGES` | `0` (무제한) | PDF를 이미지로 변환할 때 처리하는 최대 PDF 페이지 수입니다. 0으로 설정하면 무제한입니다. |
| `MAX_VIDEO_DURATION_S` | `0` (무제한) | 동영상 도구가 받아들이는 가장 긴 동영상의 길이(초)입니다. 더 긴 파일은 처리 전에 거부되며, 오류에 동영상 길이와 한도가 표시됩니다. 0으로 설정하면 무제한입니다. |
| `MAX_AUDIO_DURATION_S` | `0` (무제한) | 오디오 도구에 대한 같은 한도입니다. |
| `MAX_VIDEO_BITRATE_KBPS` | `0` (무제한) | 동영상 도구가 받아들이는 전체 비트레이트의 최댓값(킬로비트/초)입니다. 0으로 설정하면 무제한입니다. |
| `PREVIEW_TIMEOUT_S` | `300` | 동영상 또는 오디오 파일의 브라우저 내 미리보기 클립 하나를 인코딩하는 제한 시간(초)입니다. 문서 미리보기는 대신 `LIBREOFFICE_TIMEOUT_S`를 사용합니다. 0으로 설정하면 제한이 없습니다. |
| `LIBREOFFICE_TIMEOUT_S` | `120` | LibreOffice 변환 한 번(Word, Excel, PowerPoint에서 PDF로의 변환, 문서 변환기, 문서 미리보기)의 제한 시간(초)입니다. 제한을 없애려면 `0`으로 설정하세요. |
| `GIF_BG_MAX_FRAMES` | `150` | Remove GIF Background가 애니메이션 하나에서 받아들이는 최대 프레임 수입니다. 더 긴 애니메이션은 프레임 수를 알려 주는 `400`를 받습니다. 0으로 설정하면 프레임 수 제한이 없으며, 별도의 픽셀 예산은 계속 적용됩니다. |
| `SUBPROCESS_MEMORY_LIMIT_MB` | `0` (꺼짐) | 다음 보조 프로세스 각각의 주소 공간 상한(MB)입니다. 미디어 엔진과 문서 엔진의 ffmpeg, ffprobe, Ghostscript, qpdf, LibreOffice, pandoc, pdfcpu, 그리고 이미지의 경우 exiftool, HEIF, JPEG XL, JPEG 2000 디코더와 인코더, RAW 디코더, ffmpeg 대체 디코더가 해당합니다. ImageMagick은 자체 메모리 제한이 있으므로 제한되지 않으며, AI 사이드카도 제한되지 않습니다. 이 한도를 넘은 프로세스는 컨테이너 전체를 메모리 부족 킬러로 몰아넣는 대신 종료됩니다. 상주 메모리가 아니라 가상 메모리를 제한하므로, 프로세스가 실제로 사용하는 양보다 훨씬 넉넉하게 설정하세요. JPEG XL 인코더가 가장 많이 필요합니다. 24 MP 이미지에 약 1.8 GB가 필요했고 1 GB에서는 실패했으며, 스레드나 CPU를 늘려도 크게 달라지지 않습니다. 이 한도를 설정한 동안에는 HEIF 인코더가 워커 스레드 두 개로 제한되어, 24 MP 인코딩이 약 0.8 GB로 줄어드는 대신 인코딩이 느려집니다. `2048`에서 시작하고, 가장 큰 파일로 테스트한 뒤에만 낮추세요. 0으로 설정하면 꺼지며 컨테이너 메모리 제한에 맡깁니다. |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | 도구 요청에 담을 수 있는 `settings` 필드의 최대 크기(킬로바이트)이며, UTF-8 바이트 기준으로 계산합니다. 한도를 넘는 요청은 `400`를 받습니다. 0으로 설정하면 제한이 없습니다. 실제 도구 설정은 64 KB보다 훨씬 작으므로, 클라이언트가 비정상적으로 큰 설정을 보내는 경우에만 이 값을 늘리세요. |
| `MAX_SUBTITLE_SIZE_MB` | `1` | Burn Subtitles와 Embed Subtitles가 받아들이는 가장 큰 자막 파일(`.srt`, `.vtt`, `.ass`)의 크기(MB)입니다. 더 큰 파일은 파일 크기와 한도를 알려 주는 `400`를 받습니다. 0으로 설정하면 제한이 없습니다. 장편 영화 자막 파일은 보통 1 MB보다 훨씬 작습니다. |
| `MAX_METADATA_TAG_LENGTH` | `10000` | Edit Metadata가 태그 하나(아티스트, 설명, 키워드 등)에 쓸 수 있는 가장 긴 값(글자 수)입니다. 더 긴 값은 태그 이름과 한도를 알려 주는 `400`를 받습니다. 0으로 설정하면 제한이 없습니다. 긴 캡션이나 설명을 저장한다면 이 값을 늘리세요. 태그 값은 `MAX_SETTINGS_PAYLOAD_KB`와 운영 체제의 인수당 한도(Linux에서는 128 KB) 안에도 들어와야 합니다. |

### AI 도구 {#ai-tools}

이 변수는 Python 사이드카가 읽습니다. 컨테이너 환경(게시된 Compose 파일에서는 `.env`)에 설정한 뒤 다시 시작하세요.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `SNAPOTTER_GPU` | (비어 있음) | `0`, `false`, `no` 중 하나로 설정하면 GPU가 있어도 모든 AI 도구가 CPU에서 실행됩니다. 그 밖의 값이거나 비워 두면 SnapOtter가 감지한 GPU를 사용합니다. 작은 GPU가 작업 도중 메모리가 부족해지거나 드라이버 문제로 GPU 실행이 실패할 때 사용하세요. 네이티브 설치와 LXC 설치에서 영향이 나타날 가능성이 더 높으며, 이들은 이제 pip cuDNN wheel이 있으면 GPU를 사용합니다. CPU 실행은 더 느리며, `MAX_CPU_UPSCALE_MP`는 업스케일링에 적용됩니다. |
| `SD15_INPAINT_DIR` | `$MODELS_PATH/sd15-inpainting` | 개체 지우기가 고품질 모드에서 사용하는 Stable Diffusion 1.5 인페인팅 모델(diffusers 레이아웃)이 들어 있는 폴더입니다. `inpaint-hq` 기능 번들이 모델을 여기에 두므로, 모델을 다른 곳에 보관할 때만 변경하세요. `MODELS_PATH`는 SnapOtter가 데이터 디렉터리 아래의 `ai/models`로 설정합니다. |
| `SD15_INPAINT_STEPS` | `28` | 지우기 1회당 디노이징 단계 수입니다. 단계가 많을수록 디테일이 늘어날 수 있지만 시간도 그에 비례해 더 걸립니다. |
| `SD15_INPAINT_STRENGTH` | `0.95` | 모델이 마스크된 영역을 얼마나 다시 그릴 수 있는지를 0에서 1 사이로 지정합니다. 값이 낮을수록 원본 픽셀을 더 많이 유지합니다(영역을 먼저 주변으로 채운 뒤 가볍게 다듬습니다). 값이 높을수록 모델이 더 자유롭게 다시 그리며, `1`은 주변을 무시하고 노이즈에서 그리기 때문에 새로운 개체를 만들어 낼 가능성이 더 큽니다. |
| `SD15_INPAINT_GUIDANCE` | `7.0` | 모델이 프롬프트를 얼마나 강하게 따르는지를 나타냅니다. 값이 높을수록 프롬프트를 더 문자 그대로 따르며, 매우 높은 값은 거칠게 보일 수 있습니다. |
| `SD15_INPAINT_PROMPT` | (비어 있음) | 지워진 영역에 무엇을 그릴지 설명하는 텍스트입니다. 모델이 주변을 이어 그리므로, 제거에는 비워 두는 것이 가장 좋습니다. |
| `SD15_INPAINT_NEGATIVE` | `object, person, text, watermark, artifact, blurry, distorted, extra limbs` | 지워진 영역에 넣지 않을 것을 설명하는 텍스트입니다. 기본값은 빈 곳에 새로운 개체를 그리지 않도록 유도합니다. |
| `SD15_INPAINT_SEED` | `0` | 난수 시드입니다. 시드를 고정하면 같은 이미지와 마스크가 매번 같은 방식으로 지워집니다. 다른 결과를 얻으려면 값을 바꾸세요. |

### 엔진 {#engines}

SnapOtter는 컨테이너 안의 `$PATH`에서 각 처리 바이너리를 찾으므로, 직접 빌드한 바이너리를 마운트하지 않는 한 아래 변수는 비워 둡니다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `FFMPEG_PATH` | (비어 있음) | 비디오 및 오디오 도구가 사용하는 `ffmpeg` 바이너리의 경로입니다. |
| `FFPROBE_PATH` | (비어 있음) | 처리 전에 미디어 파일을 읽는 `ffprobe`의 경로입니다. `FFMPEG_PATH`와 같은 빌드를 가리키게 하세요. |
| `QPDF_PATH` | (비어 있음) | PDF 도구와 업로드된 PDF 검사에 사용하는 `qpdf`의 경로입니다. |
| `SOFFICE_PATH` | (비어 있음) | 오피스 문서 변환에 사용하는 LibreOffice의 `soffice` 경로입니다. |
| `PDFCPU_PATH` | (비어 있음) | 일부 PDF 도구가 사용하는 `pdfcpu`의 경로입니다. |
| `GS_PATH` | (비어 있음) | PDF 도구와 PDF OCR에 사용하는 Ghostscript의 `gs` 경로입니다. |
| `PANDOC_PATH` | (비어 있음) | 문서 변환에 사용하는 `pandoc`의 경로입니다. |
| `SNAPOTTER_FONT_FILE` | (비어 있음) | 비디오에 그려지는 텍스트(자막 입히기, 비디오 워터마크)에 사용할 글꼴 파일입니다. 비워 두면 이미지가 처음 찾은 글꼴을 사용합니다. |
| `SNAPOTTER_FONT_FAMILY` | (비어 있음) | `SNAPOTTER_FONT_FILE`의 글꼴 패밀리 이름입니다. 비어 있으면 `Sans`를 뜻합니다. |
| `SNAPOTTER_HW_ACCEL` | (비어 있음) | 하드웨어 비디오 인코더 계열이며 `nvenc` 또는 `vaapi`입니다. 비워 두면 소프트웨어로 인코딩합니다. |

`SNAPOTTER_HW_ACCEL`을 사용하려면 해당 인코더 계열로 빌드한 ffmpeg가 필요한데, 이미지에 포함된 ffmpeg는 둘 다 지원하지 않습니다. 이미지에 들어 있는 바이너리를 쓰면 이 설정은 소프트웨어 인코딩으로 대체되며 시작 로그에 그 사실이 기록됩니다. 사용하려면 직접 빌드한 ffmpeg를 마운트하고, `FFMPEG_PATH`와 `FFPROBE_PATH`가 이를 가리키게 한 다음, 컨테이너에 GPU 장치를 제공하세요. `nvenc`의 경우 `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`도 설정해야 합니다. 이미지는 `compute,utility`만 요청하는데, `video`가 없으면 NVIDIA 런타임이 인코드 라이브러리를 마운트하지 않아서 인코더는 목록에 나타나지만 모든 인코딩이 실패합니다. 존재하지 않거나 실행할 수 없는 경로 재정의도 시작 로그에 표시되며, 경로를 고치거나 설정을 해제할 때까지 해당 바이너리가 필요한 모든 작업이 실패합니다.

배포된 Compose 파일은 이 변수를 모두 `.env`에서 전달하므로 거기에 설정하면 충분합니다.

### 정리 {#cleanup}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | 저장하지 않은 처리 결과(원본 업로드와 도구 출력)를 자동 삭제하기 전까지 보관하는 기간입니다. 파일 라이브러리에 직접 저장한 파일은 영향을 받지 않으며 삭제할 때까지 유지됩니다. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | 정리 작업을 실행하는 주기입니다. |
| `JOBS_RETENTION_DAYS` | `30` | 완료된 작업 기록(완료, 실패, 취소됨)을 6시간마다 실행되는 보존 정리 작업이 삭제하기 전까지 보관하는 일수입니다. 관리자는 Settings > System에서 재정의할 수 있습니다. 법적 보존 중인 사용자와 팀의 기록은 유지됩니다. 0으로 설정하면 영구 보관합니다. |
| `AUDIT_RETENTION_DAYS` | `0` (영구) | 감사 로그 항목을 보관하는 일수입니다. 재정의와 법적 보존 규칙은 같습니다. 변조 방지 감사 로깅이 켜져 있는 동안에는 아무것도 삭제되지 않습니다. 0으로 설정하면 영구 보관합니다. |

### 엔터프라이즈 라이선스 {#enterprise-license}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `SNAPOTTER_LICENSE_KEY` | (비어 있음) | SAML, SCIM, S3 스토리지 같은 엔터프라이즈 기능을 활성화하는 라이선스 키입니다. 시작할 때 읽으므로 변경한 후에는 다시 시작하세요. 잘못되었거나 만료된 키는 경고를 기록하고, 서버는 해당 기능 없이 실행됩니다. 컨테이너에서는 `SNAPOTTER_LICENSE_KEY_FILE`을 통해 마운트할 수도 있습니다([Docker 시크릿](/ko/guide/security#docker-secrets) 참조). |

### 모양 {#appearance}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `DEFAULT_THEME` | `light` | 새 세션의 기본 테마입니다. `light`, `dark`, `system` 중 하나입니다. |
| `DEFAULT_LOCALE` | `en` | 기본 인터페이스 언어입니다. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | 기본 도구 레이아웃입니다. `sidebar` 또는 `fullscreen`입니다. |

### Docker 권한 {#docker-permissions}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PUID` | `999` | 컨테이너 프로세스를 이 UID로 실행합니다. 바인드 마운트를 쓸 때는 호스트 사용자와 맞추세요(`id -u`). 쓰기 가능한 루트 파일 시스템이 필요합니다. [보안 가이드](/ko/guide/security#why-read-only-is-not-set)를 참고하세요. |
| `PGID` | `999` | 컨테이너 프로세스를 이 GID로 실행합니다. 바인드 마운트를 쓸 때는 호스트 그룹과 맞추세요(`id -g`). 쓰기 가능한 루트 파일 시스템이 필요합니다. [보안 가이드](/ko/guide/security#why-read-only-is-not-set)를 참고하세요. |

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
