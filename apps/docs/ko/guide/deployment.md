---
description: "Docker로 SnapOtter를 프로덕션에 배포합니다. 하드웨어 요구 사항, GPU 설정, Nginx, Traefik, Cloudflare용 리버스 프록시 설정을 다룹니다."
i18n_source_hash: 3821f105f4ba
i18n_provenance: machine
i18n_output_hash: 7d5cd09b73d9
i18n_hash_version: 2
---

# 배포 {#deployment}

SnapOtter는 SnapOtter 앱 이미지, PostgreSQL 17, Redis 8로 이루어진 3개 컨테이너 Docker Compose 스택으로 배포됩니다. 앱 이미지는 **linux/amd64**(AI 가속을 위한 NVIDIA CUDA 지원)와 **linux/arm64**(CPU)를 지원하므로 Intel/AMD 서버, Apple Silicon Mac, Raspberry Pi 4/5 같은 ARM 기기에서 네이티브로 실행됩니다. VA-API, Quick Sync, OpenCL을 통한 Intel/AMD iGPU 가속은 현재 AI 추론에서 지원되지 않습니다.

GPU 설정, Docker Compose 예시, 버전 고정은 [Docker 이미지](./docker-tags)를 참고하세요.

## 빠른 시작 (CPU) {#quick-start-cpu}

```yaml
# docker-compose.yml - Copy this file and run: docker compose up -d
services:
  SnapOtter:
    image: snapotter/snapotter:latest    # or ghcr.io/snapotter-hq/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"                # Web UI + API
    volumes:
      - SnapOtter-data:/data           # AI models, user files (PERSISTENT)
      - SnapOtter-workspace:/tmp/workspace  # Temp processing files (can be tmpfs)
    environment:
      # --- Authentication ---
      - AUTH_ENABLED=true          # Set to false to disable login entirely
      - DEFAULT_USERNAME=admin     # First-run admin username
      - DEFAULT_PASSWORD=admin     # First-run admin password (you'll be forced to change it)

      # --- Database + Queue ---
      # Requests are served by a role that can only read and write rows. The
      # owner connects only during boot, to migrate and to grant. Set
      # POSTGRES_APP_PASSWORD and POSTGRES_PASSWORD for any non-local deployment.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=loopback,linklocal,uniquelocal  # Which peers may set the client IP via X-Forwarded-For (default shown)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)

      # --- Engines (empty = the image's own binaries, see Configuration) ---
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"            # Needed for Python ML shared memory
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:       # Named volume - Docker manages permissions automatically
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose up -d
```

그러면 앱은 `http://localhost:1349`에서 사용할 수 있습니다.

위 스택은 데이터베이스 소유자로 연결합니다. SnapOtter 2.3.0부터는 행을 읽고 쓰기만 하는 역할로 요청을 처리할 수 있습니다. [최소 권한 역할](./database#least-privilege-roles)을 참고하세요.

> **Docker Hub 요청 제한에 걸리셨나요?** `snapotter/snapotter:latest`를 `ghcr.io/snapotter-hq/snapotter:latest`로 바꾸면 GitHub Container Registry에서 이미지를 가져옵니다. 두 레지스트리는 릴리스할 때마다 같은 이미지를 받습니다.

## 빠른 시작 (NVIDIA CUDA) {#quick-start-nvidia-cuda}

지원되는 AI 도구(배경 제거, 업스케일, 얼굴 보정)에서 NVIDIA CUDA 가속을 사용하려면 다음과 같이 하세요.

```yaml
# docker-compose-gpu.yml - Requires: NVIDIA GPU + nvidia-container-toolkit
# Install toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      # Runtime role (rows only) and the boot-only owner connection. See the CPU
      # example above.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Engines (empty = the image's own binaries, see Configuration)
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"                # Required for PyTorch CUDA shared memory
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all           # Or set to 1 for a specific GPU
              capabilities: [gpu]
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose -f docker-compose-gpu.yml up -d
```

### GPU 가속 확인 {#verify-gpu-acceleration}

로그에서 CUDA 감지 여부를 확인하세요.

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

`--gpus all`와 NVIDIA Container Toolkit을 올바르게 설정했는데도 AI 도구가 CPU에서 실행된다면 **Settings → AI Features**에서 해당 번들(예: Background Removal)을 다시 설치하세요. 설치 프로그램이 ONNX Runtime의 GPU 빌드를 복원합니다. 다른 번들(예: 전사)이 가져온 CPU 전용 빌드가 공유 AI 환경에서 GPU 빌드를 가릴 수 있기 때문입니다. 이전 이미지에서 UI로 다시 설치해도 GPU가 복원되지 않으면 [이슈 #490](https://github.com/snapotter-hq/SnapOtter/issues/490)의 수동 복구 방법을 참고하세요.

## 하드웨어 요구 사항 {#hardware-requirements}

이 수치는 NVIDIA RTX 4070이 장착된 최신 amd64 워크스테이션부터 Raspberry Pi까지 다양한 시스템에서 전체 도구 카탈로그를 실행하고, Docker 리소스 제한을 바꿔 가며 실제 하한선을 찾은 벤치마크에서 나온 것입니다.

이 등급 중 낮은 쪽(Pi, 오래된 노트북, 2 GB VPS)에서 실행하시나요? [저사양 환경 설정](/ko/guide/low-resource)에서 이 수치를 조정된 제한값과 함께 구체적인 순서로 안내합니다.

### 빠른 참조 {#quick-reference}

| 등급 | 사용 사례 | CPU | RAM | GPU | 저장 공간 |
|------|----------|-----|-----|-----|---------|
| 최소 | AI가 아닌 도구(이미지, 파일, 가벼운 PDF)와 내장 Fast OCR 및 얼굴 감지, 단일 사용자, 소규모 배치 | 2코어 | 2 GB | 없음 | 약 7 GB |
| 권장 | 비디오, PDF, CPU 기반 표준 AI 번들을 포함한 다섯 가지 모달리티 전체, 배치, 소수의 사용자 | 4코어 | 4 GB (HQ 인페인팅은 8 GB) | 없음 | 약 25 GB |
| 최대 | GPU AI를 포함해 모든 기능을 빠르게, 대규모 배치, 다수의 사용자 | 6-8코어 | 8 GB | NVIDIA 8 GB 이상 VRAM (12 GB면 여유로움) | 약 35 GB |

**아키텍처: 64비트만 지원** (`linux/amd64` 또는 `linux/arm64`). SnapOtter는 Intel/AMD 서버, Apple Silicon Mac, 그리고 **Raspberry Pi 4와 5**(4-8 GB)를 포함한 64비트 ARM 보드에서 네이티브로 실행됩니다. 32비트 ARM(`armv7`/`armhf`)에서는 실행되지 **않으며**, 해당 이미지는 빌드되지 않습니다. 메모리 하한에 미치지 못하는 Pi Zero 같은 512 MB급 보드에서도 실행되지 않습니다(아래 참고).

### 최소 (이미지, 파일, 가벼운 PDF 도구, AI 없음) {#minimum-image-files-and-light-pdf-tools-no-ai}

| 리소스 | 요구 사항 |
|---|---|
| CPU | 2코어 |
| RAM | 2 GB |
| 디스크 | 약 5.5 GB (이미지) + 데이터 볼륨 |
| GPU | 필요 없음 |

AI가 아닌 카탈로그 도구 222개 전체가 보급형 하드웨어에서 실행됩니다. 이미지(크기 조정, 자르기, 변환, 압축, 조정, 워터마크), 비디오(자르기, 음소거, 리먹스), 오디오(변환, 정규화, 자르기), PDF(병합, 분할, 압축, 회전, 보호), 파일 변환, 전용 변환 프리셋이 포함됩니다. 대부분의 작업은 큰 파일이라도 1초 이내에 끝납니다. 2.7 MB 이미지는 약 0.05초에 크기가 조정되고 약 2초에 WebP로 다시 인코딩됩니다.

메모리 하한은 Docker 리소스 제한 실험에서 확인된 실제 값입니다. **512 MB로는 스택을 시작할 수 없고**(이미지 크기 조정 한 번도 강제 종료됩니다), **1 GB**에서는 단일 파일 작업은 처리하지만 여러 파일 배치에서는 메모리가 부족해집니다. **2 GB / 2코어**가 AI가 아닌 배치를 무리 없이 처리할 수 있는 가장 작은 구성입니다. 내장 Fast OCR과 `face-detection` 번들도 2 GB 안에 들어가지만, 더 큰 AI 번들(Whisper, LaMa/DDColor, rembg, RealESRGAN, 사진 복원, SD1.5 HQ 인페인팅)은 4~8 GB RAM이 필요하며 사용 가능한 메모리가 번들별 하한보다 적으면 처음부터 실행이 거부됩니다.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**CPU 부하가 큰 유일한 예외는 비디오 재인코딩입니다.** 스트림 복사 작업(자르기, 음소거, 컨테이너 리먹스)은 즉시 끝나지만 다른 코덱으로 트랜스코딩하는 작업은 CPU에 좌우됩니다. 1080p / 45초 클립을 VP9(WebM)로 재인코딩하는 데 빠른 최신 CPU에서는 약 **40초**, Apple Silicon에서는 약 45초, 오래된 모바일 4코어에서는 약 80초, 오래된 4코어 서버에서는 약 **130초**가 걸립니다. 비디오 작업이 많다면 CPU 코어 수와 클럭 속도를 우선하거나 컨테이너의 `cpus:` 제한을 높이세요. 기본으로 제공되는 compose는 앱을 4코어로 제한합니다(GPU compose는 8코어).

### 권장 (CPU에서 AI 도구 실행) {#recommended-ai-tools-on-cpu}

| 리소스 | 요구 사항 |
|---|---|
| CPU | 4코어 |
| RAM | 4 GB |
| 디스크 | 3 GB (이미지) + 약 20 GB (선택 AI 팩 전체) + 작업 공간 |
| GPU | 필요 없음 (CPU 대체) |

**더 큰 AI 번들을 설치하고 실행하는 것이 RAM 4 GB를 권장하는 이유입니다.** 선택 팩을 하나도 설치하지 않으면 앱은 유휴 상태에서 약 360 MB를 사용합니다. 기존 Python 도구는 하나의 사이드카를 공유하고, 정확한 OCR은 활성 상태의 불변 세대에 고정된 전용 장기 실행 디스패처를 사용합니다. 활성화하기 전에 설치 프로그램은 후보에 대해 스모크 테스트를 실행합니다. 그런 다음 새 디스패처로 원자적으로 전환하고, 가비지 컬렉션 전에 이전 디스패처를 비웁니다. 공식 정확한 OCR 아티팩트는 모두 4 GiB cgroup 안에서 최악의 경우를 가정한 릴리스 테스트를 통과해야 하며, 호스트 권장 사양인 4 GB는 Node.js 애플리케이션, Postgres, Redis, 큐, 동시 작업을 위한 여유를 남겨 둡니다.

대부분의 AI 도구는 CPU에서도 충분히 쓸 만하지만, 몇몇은 GPU가 정말 필요합니다. 최신 4코어 CPU에서 측정한 결과입니다.

| AI 도구 | CPU 소요 시간 | CPU에서 사용 가능? |
|---|---|---|
| 얼굴 감지(blur-faces, smart-crop, red-eye), noise-removal | 1초 미만 | 예 |
| OCR, 전사, 자막 | 1-3초 | 예 |
| 컬러화, 얼굴 보정 | 약 10초 | 예 |
| 배경 제거 / 교체 / 흐림 | 약 29초 | 예 (기다려야 합니다) |
| AI 업스케일 (RealESRGAN) | 작은 이미지는 약 33초, 큰 이미지는 수 분 | 한계적: GPU 강력 권장 |
| 사진 복원 (전체 파이프라인) | 수 분 | 아니요: GPU 또는 빠른 다코어 CPU 필요 |

SnapOtter는 이러한 모델 다운로드를 Docker 이미지에 의도적으로 포함하지 않습니다. AI 번들은 관리자가 관련 도구를 활성화할 때만 내려받으며, 영구 `/data/ai` 볼륨에 저장되고 같은 모델 스택에 의존하는 모든 도구가 공유합니다. 덕분에 최종 컨테이너 이미지는 작게 유지하면서도, 전체 AI를 설치하면 아래의 더 큰 저장 공간 수치에 이를 수 있습니다.

일부 도구는 둘 이상의 공유 번들에 의존합니다. 예를 들어 Passport Photo에는 `background-removal`와 `face-detection`가 모두 필요합니다. `background-removal`가 이미 설치되어 있다면 Passport Photo를 활성화할 때 부족한 `face-detection` 번들만 내려받습니다. 모든 AI 도구에서 같은 재사용 방식이 적용됩니다.

선택 AI 팩의 저장 공간과 CPU 메모리 하한입니다(SnapOtter는 Python 사이드카로 보내기 전에 사용 가능한 메모리를 확인하며, 번들의 여유 메모리 하한보다 적으면 즉시 실행을 거부합니다).

| 번들 | 디스크 크기 | CPU 메모리 하한 |
|---|---|---|
| 얼굴 감지 | 200-300 MB | 호스트 RAM 2 GB (여유 약 0.5 GB) |
| 전사 | 약 600 MB | 호스트 RAM 4 GB (여유 약 2 GB) |
| 개체 지우개 + 컬러화 | 1-2 GB | 호스트 RAM 4 GB (여유 약 2 GB) |
| 정확한 OCR (`balanced`/`best`) | 다운로드 약 208-234 MiB / 설치 약 409-488 MiB | 구성된 유효 메모리 4 GiB (`fast`는 2 GB에서 실행) |
| 배경 제거 | 4-5 GB | 호스트 RAM 4 GB (여유 약 2.5 GB) |
| 업스케일 + 얼굴 보정 + 노이즈 제거 | 5-6 GB | 호스트 RAM 4 GB (여유 약 2.5 GB) |
| 사진 복원 | 4-5 GB | 호스트 RAM 4 GB (여유 약 3 GB) |
| 고품질 인페인팅 (`inpaint-hq`) | 5-7 GB | 호스트 RAM 8 GB (여유 약 6 GB) |
| **전체 번들** | **설치 시 약 25 GB** | **4 GB (`inpaint-hq` 사용 시 8 GB)** |

Fast OCR은 Tesseract를 통해 이미지에 내장되어 있고, 약 25 MiB를 차지하며, 선택 OCR 팩이나 4 GiB 메모리 요구 사항이 필요하지 않습니다. Fast는 `auto`, `en`, `de`, `es`, `fr`, `zh`, `ja`를 지원하지만 한국어(`ko`)와 아랍어(`ar`)는 지원하지 않습니다. 이 둘은 `balanced` 또는 `best`를 사용하므로 정확한 팩이 필요합니다. 정확한 팩은 공식 Linux amd64 및 arm64 컨테이너에서 사용할 수 있으며 CPU에서 ONNX Runtime을 실행합니다. NVIDIA 호스트도 같은 CPU OCR 런타임을 사용하므로 OCR은 CUDA 버전이나 GPU 아키텍처에 의존하지 않습니다. 정확한 런타임에는 최소 4 GiB의 유효 메모리가 필요합니다. 구성된 컨테이너 cgroup 제한이 있으면 그 값이고, 없으면 호스트 메모리입니다. SnapOtter는 서명된 호환성 최소 요건에 못 미치는 시스템을 팩을 내려받기 전에 거부합니다. libc와 Python ABI를 보장할 수 없는 베어메탈/사전 빌드 아카이브에서도 정확한 팩 설치는 거부됩니다. 지원되지 않는 호스트에서 한국어와 아랍어 OCR은 호환되지 않는다는 명시적 오류를 반환하며 Fast로 조용히 대체되지 않습니다. 한국어에 대해 Fast를 명시적으로 요청하면 작업이 큐에 들어가기 전에 `fast-korean-unsupported` 사유와 함께 `FEATURE_INCOMPATIBLE`를 반환합니다.

같은 `DATA_DIR`를 공유하는 복제본은 동일한 CPU 아키텍처를 사용해야 합니다. 여러 복제본을 배포할 때는 노드 어피니티로 고정하세요. amd64와 arm64가 섞인 복제본은 별도의 데이터 볼륨과 독립된 SnapOtter 배포가 필요합니다.

정확한 런타임은 활성 세대를 하나만 유지하고 활성화한 후 다운로드 캐시를 비웁니다. 이번 릴리스에서 첫 설치는 아카이브와 스테이징을 위해 일시적으로 약 620-720 MiB가 필요하며, 업그레이드는 이전 세대가 활성 상태로 남아 있는 동안 최대 약 1.2 GiB까지 늘어날 수 있습니다. 설치 프로그램은 다운로드나 압축 해제 전에 서명된 인덱스와 현재 세대를 바탕으로 정확한 요구량을 계산하며, 데이터 볼륨이 너무 작으면 일찍 실패합니다.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### 최대 (NVIDIA CUDA에서 AI 도구 실행) {#full-ai-tools-on-nvidia-cuda}

| 리소스 | 요구 사항 |
|---|---|
| CPU | 6-8코어 (GPU AI를 쓰더라도 비디오 준비와 동시 처리는 CPU에서 실행) |
| RAM | 8 GB |
| GPU | VRAM 8 GB 이상의 NVIDIA (12 GB 권장) |
| 디스크 | 총 약 35 GB |

NVIDIA GPU(CUDA)는 무거운 AI 모델을 크게 가속합니다. RTX 4070과 최신 CPU를 비교해 측정한 결과입니다.

| AI 도구 | GPU 속도 향상 | 참고 |
|---|---|---|
| AI 업스케일 (RealESRGAN 2×) | **약 47배** | 가장 큰 효과: 1초 미만 대 약 33초 (큰 이미지는 수 분) |
| 얼굴 보정 (CodeFormer) | **약 12배** | 약 0.9초 대 약 11초 |
| 전사 (Whisper) | 약 4.5배 | |
| 배경 제거 / 교체 / 흐림 | 약 4배 | GPU 약 7초 대 CPU 약 29초 |
| 컬러화 | 약 1.8배 | |
| OCR, 얼굴 감지, red-eye, noise-removal | 약 1배 | CPU에서도 이미 빠름: GPU가 도움이 되지 않음 |
| 사진 복원 | 없음 | GPU에서도 CPU에 좌우됨 (GPU 사용률 0%). 여기서는 GPU보다 빠른 CPU가 더 중요 |

GPU를 쓸 만한 도구는 **업스케일, 얼굴 보정, 전사, 배경 제거**입니다. 얼굴 감지, OCR, red-eye는 CPU에 좌우되며 이미 빠르므로 GPU를 써도 이점이 없습니다.

얼굴 보정을 포함한 업스케일 중에는 VRAM 사용량이 최대 7.5 GB에 이릅니다. 6 GB NVIDIA GPU는 대부분의 AI 도구를 개별적으로는 실행할 수 있지만 업스케일에서는 실패합니다. VRAM 8-12 GB면 모든 것을 처리합니다.

VA-API, Quick Sync, OpenCL을 통한 Intel/AMD iGPU 가속은 현재 AI 추론에서 지원되지 않습니다. 컨테이너에 `/dev/dri`를 매핑해도 AI GPU 가속은 활성화되지 않으며, NVIDIA CUDA를 사용할 수 없으면 SnapOtter는 AI 도구를 CPU에서 실행합니다.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

### 동시 사용자 {#concurrent-users}

기본 4코어 제한 앱 컨테이너에 대한 병렬 이미지 크기 조정 요청입니다.

| 동시 요청 수 | 평균 응답 시간 | 오류 |
|---|---|---|
| 1 | 0.4초 | 0 |
| 5 | 1.2초 | 0 |
| 10 | 2.1초 | 0 |

워커 풀이 포화되어도 응답 시간은 선형보다 완만하게 늘어나며 오류는 없습니다. 앱 컨테이너의 `cpus:` 제한을 높이거나(또는 코어가 더 많은 호스트를 사용하면) 상한이 올라갑니다. 무거운 작업(비디오 트랜스코딩, CPU AI)은 실행되는 동안 워커를 계속 점유하므로, 요청 수만이 아니라 동시에 실행될 무거운 작업의 수에 맞춰 CPU를 산정하세요.

### 지원하는 이미지 형식 {#supported-image-formats}

SnapOtter는 **55개 이상의 입력 형식**과 **14개의 출력 형식**을 지원하며, 20개 이상 카메라 브랜드의 RAW 파일, 전문가용 형식(PSD, EPS, OpenEXR, HDR), 최신 코덱(JPEG XL, AVIF, HEIC, QOI), 과학/게임 형식(FITS, DDS)을 포함합니다.

지원하는 모든 형식, 사용하는 디코더, 사용할 수 있는 품질 옵션은 [전체 형식 목록](/ko/guide/supported-formats)을 참고하세요.

### 알려진 제한 사항 {#known-limitations}

- **콘텐츠 인식 크기 조정**은 caire 바이너리의 제한 때문에 큰 이미지(5 MP 초과)에서 충돌합니다. 작은 이미지에서는 정상 작동합니다.
- **HEIF 디코딩**에는 13-23초가 걸립니다. HEIC(Apple의 변형)는 0.3-0.9초로 훨씬 빠릅니다.
- **업스케일**은 CPU에서 작은 이미지를 넘어가면 시간 초과가 발생합니다. 실용적으로 사용하려면 GPU가 필요합니다.
- **CodeFormer** 얼굴 보정은 GFPGAN보다 훨씬 느립니다(GPU에서 53초 대 2초). 대부분의 경우 GFPGAN을 권장합니다.

## 볼륨 {#volumes}

| 마운트 / 볼륨 | 용도 | 필수 여부 |
|---|---|---|
| `/data` (app) | AI 모델, Python venv, 사용자 파일 | **필수** - 없으면 파일이 사라집니다 |
| `/tmp/workspace` (app) | 임시 처리 파일 (자동 정리) | 권장 |
| `SnapOtter-pgdata` (postgres) | PostgreSQL 데이터 디렉터리 (사용자, 설정, 파이프라인, 작업) | **필수** - 없으면 데이터가 사라집니다 |
| `SnapOtter-redisdata` (redis) | 내구성 있는 작업 큐를 위한 Redis append-only 파일 | 권장 |

### 바인드 마운트와 명명된 볼륨 {#bind-mounts-vs-named-volumes}

**명명된 볼륨**(권장): Docker가 권한을 자동으로 관리합니다.
```yaml
volumes:
  - SnapOtter-data:/data
```

**바인드 마운트**: 권한은 직접 관리해야 합니다. 호스트 사용자에 맞게 `PUID`/`PGID`를 설정하세요.
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### 저장소 권한 {#storage-permissions}

SnapOtter는 실행 중에 두 위치에 씁니다. `/data`(사용자 파일, 로그, AI 모델, Python venv)와 `/tmp/workspace`(임시 처리 작업 공간)입니다. 두 곳 모두 컨테이너를 실행하는 사용자가 쓸 수 있어야 합니다. 그렇지 않으면 컨테이너는 디렉터리 이름, 실행 중인 UID/GID, 해결 방법을 알려 주는 메시지와 함께 **시작 시점에 즉시 실패**합니다. 정상으로 부팅된 뒤 첫 업로드에서 원인을 알기 어려운 오류로 실패하는 일을 막기 위해서입니다. 로그 디렉터리(`LOG_DIR`, 이미지에서는 `/data/logs`)는 파일이 S3에 있더라도 로그는 로컬에 남으므로 모든 저장 모드에서 같은 방식으로 확인합니다.

권한 처리 방식은 컨테이너를 어떻게 시작하느냐에 따라 달라집니다.

**기본값(root로 시작해서 `snapotter`로 전환)**: 엔트리포인트는 root로 시작해 마운트된 볼륨의 소유권을 고친 다음, `gosu`를 통해 권한이 없는 `snapotter` 사용자로 전환합니다. 명명된 볼륨은 별도 설정 없이 작동합니다. 바인드 마운트의 경우 `PUID`/`PGID`를 (위와 같이) 호스트 사용자로 설정해야 SnapOtter가 쓰는 파일의 소유자가 본인이 됩니다.

**Kubernetes / OpenShift(`runAsUser`를 통한 non-root)**: root가 아닌 사용자로 직접 실행되면 컨테이너가 스스로 볼륨의 소유자를 바꿀 수 없으므로 오케스트레이터가 볼륨을 쓰기 가능하게 만들어야 합니다. `fsGroup`를 설정하세요.

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

이미지의 쓰기 가능한 디렉터리는 GID 0이 그룹 소유자이고 그룹 쓰기가 가능하므로, **임의의 UID**와 root 보조 그룹(OpenShift 기본값)으로 실행되는 파드는 `chown` 없이도 쓸 수 있습니다.

**TrueNAS Scale(및 기타 "외부 UID" 환경)**: TrueNAS는 앱을 root가 아닌 사용자(대개 `568:568`)로 실행하고 다른 사용자가 소유한 호스트 데이터셋을 마운트하므로, 엔트리포인트나 `fsGroup`만으로는 쓰기 가능하게 되지 않습니다. 다음 중 하나를 선택하세요.

- **앱을 root로 실행**(권장): 앱의 사용자를 설정하지 않거나 `0`으로 설정하고, 기본 엔트리포인트가 권한을 고친 뒤 `snapotter`로 전환하도록 두세요.
- **UID `999`로 실행**: 앱의 사용자/그룹을 `999:999`(SnapOtter에 내장된 `snapotter` 사용자)로 설정해 이미지의 소유권과 일치시키세요.
- 호스트 데이터셋을 컨테이너가 실행되는 UID로 **`chown`**하세요. TrueNAS 셸에서 다음과 같이 합니다.

  ```bash
  # 시작 오류에 표시된 UID를 사용하세요 (또는 컨테이너 안에서 `id` 실행)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

시작 오류에 사용할 정확한 UID가 표시되므로, 앱을 한 번 시작해서 메시지를 읽은 다음 그에 맞게 `chown`(또는 사용자를 조정)하는 것이 가장 빠릅니다.

## 환경 변수 {#environment-variables}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `AUTH_ENABLED` | `true` | 로그인 필수 여부 활성화/비활성화 |
| `DEFAULT_USERNAME` | `admin` | 초기 관리자 사용자 이름 |
| `DEFAULT_PASSWORD` | `admin` | 초기 관리자 비밀번호 (첫 로그인 시 변경 강제) |
| `MAX_UPLOAD_SIZE_MB` | `0` (무제한) | 파일당 업로드 제한(MB). 이미지는 `0`로 제공되며, 소스 빌드는 100에서 시작합니다 |
| `MAX_BATCH_SIZE` | `0` (무제한) | 배치 요청당 최대 파일 수. 이미지는 `0`로 제공되며, 소스 빌드는 100에서 시작합니다 |
| `RATE_LIMIT_PER_MIN` | `1000` | IP당 분당 API 요청 수 (0으로 설정하면 비활성화) |
| `MAX_USERS` | `0` (무제한) | 최대 사용자 계정 수 |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | `X-Forwarded-For`를 통해 클라이언트 IP를 설정할 수 있는 피어입니다. 기본값은 사설 네트워크만 허용 |
| `PUID` | `999` | 이 UID로 실행 (바인드 마운트 권한용) |
| `PGID` | `999` | 이 GID로 실행 (바인드 마운트 권한용) |
| `LOG_LEVEL` | `info` | 로그 상세 수준: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (자동) | 최대 병렬 AI 처리 작업 수 |
| `SESSION_DURATION_HOURS` | `168` | 로그인 세션 유지 시간 (7일) |
| `CORS_ORIGIN` | (비어 있음) | 허용할 출처를 쉼표로 구분한 목록, 비워 두면 동일 출처 |

### 아웃바운드 프록시와 사설 CA {#outbound-proxy-and-private-ca}

공식 컨테이너는 Node의 환경 변수 기반 프록시 지원을 활성화합니다. SnapOtter가 기업 프록시를 통해 OCR 런타임 저장소나 다른 HTTPS 서비스에 접근해야 한다면 `HTTPS_PROXY`를 설정하세요(필요하면 `HTTP_PROXY`도). `NO_PROXY`에는 Postgres, Redis, 내부 객체 스토리지처럼 직접 접근해야 하는 호스트를 쉼표로 구분해 지정하세요.

프록시나 내부 서비스가 사설 인증 기관으로 서명되어 있다면 CA 인증서를 읽기 전용으로 마운트하고 `NODE_EXTRA_CA_CERTS`가 이를 가리키도록 하세요. 이 파일은 Node 프로세스가 시작될 때 존재해야 합니다.

```yaml
services:
  app:
    environment:
      HTTPS_PROXY: http://proxy.example.internal:3128
      HTTP_PROXY: http://proxy.example.internal:3128
      NO_PROXY: postgres,redis,minio,localhost,127.0.0.1
      NODE_EXTRA_CA_CERTS: /etc/snapotter/custom-ca.pem
    volumes:
      - ./company-ca.pem:/etc/snapotter/custom-ca.pem:ro
```

프록시 자격 증명은 Compose 파일 밖에 보관하세요(예: 보호된 `.env` 파일이나 시크릿). TLS 검증을 비활성화하지 마세요. 서명된 OCR 인덱스는 릴리스 메타데이터를 인증하지만, 일반 TLS 검증은 전송 구간과 그 밖의 모든 아웃바운드 요청을 계속 보호합니다.

## 상태 확인 {#health-check}

컨테이너에는 기본 상태 확인이 포함되어 있습니다.

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## 리버스 프록시 {#reverse-proxy}

`TRUST_PROXY`의 기본값은 `loopback,linklocal,uniquelocal`이므로 SnapOtter는 사설 네트워크에 있는 피어가 보낸 `X-Forwarded-For`만 신뢰합니다. 같은 호스트, Docker 네트워크, LAN에 있는 리버스 프록시는 기본적으로 신뢰되므로, 속도 제한, 로그인 무차별 대입 제한기, 감사 로그, 엔터프라이즈 IP 허용 목록이 별도 설정 없이 실제 클라이언트 IP를 확인합니다.

앞단의 프록시가 **공용** 주소에서 SnapOtter에 접속할 때만(예를 들어 다른 네트워크에 있는 클라우드 로드 밸런서) `TRUST_PROXY=true`를 설정하세요. 직접 노출된 인스턴스에서 그 값을 설정하면 헤더를 계속 바꾸는 호출자는 요청마다 새로운 속도 제한 버킷을 얻으므로 `request.ip`를 공격자가 조작할 수 있게 됩니다.

클라이언트 IP를 측정하기 전에 알아 둘 점이 두 가지 있습니다. macOS와 Windows의 Docker Desktop은 게시된 포트를 사용자 영역 프록시로 처리하며 모든 소스 주소를 VM 게이트웨이 `192.168.65.1`로 바꿔 쓰므로, `TRUST_PROXY` 값이 무엇이든 그곳에서는 실제 클라이언트를 알아낼 수 없습니다. 인터넷에 노출할 서비스는 Linux에 배포하세요. 또한 어떤 플랫폼에서든 `localhost`을 통해 게시된 포트에 접속하면 클라이언트가 아니라 브리지 게이트웨이로 관찰되므로, localhost 테스트로는 실제 클라이언트가 어떻게 식별되는지 알 수 없습니다. `TRUST_PROXY` 값의 전체 표와 Docker Desktop 관련 주의 사항은 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy)에 있습니다.

아래 모든 프록시에서 중요한 점이 두 가지 있습니다. 큰 요청 본문(업로드)을 허용하고, 응답을 버퍼링하지 마세요. 응답을 버퍼링하는 프록시는 SSE 진행 상황을 깨뜨리고, 더 눈에 띄게는 프록시가 전체 파일을 붙잡고 있다가 전달하기 때문에 큰 파일 다운로드가 "시작되지만 끝나지 않는" 문제를 일으킵니다. SnapOtter는 다운로드에 `X-Accel-Buffering: no`를 보내므로 다른 곳에서 버퍼링이 켜져 있어도 nginx는 스트리밍하지만, nginx 이외의 프록시는 응답 버퍼링을 명시적으로 꺼야 합니다(아래 각 설정에 나와 있습니다). 다운로드가 중간에 멈춘다면 앞단의 버퍼링 프록시를 가장 먼저 확인하세요.

HSTS에 대한 참고 사항입니다. API는 모든 응답에 `Strict-Transport-Security`를 직접 보내므로 응답 헤더를 그대로 전달하는 프록시(아래 설정은 모두 해당)는 별도의 HSTS 설정이 필요 없습니다. 프록시가 업스트림 응답 헤더를 제거하거나 덮어쓰도록 설정된 경우에만 그 헤더를 보존하거나 엣지에서 다시 추가해야 합니다.

### Nginx {#nginx}

```nginx
server {
    # Plain HTTP shown for brevity. Terminate TLS in your own `listen 443 ssl`
    # server block; the Strict-Transport-Security header the API sends passes
    # through with every proxied response, so no add_header is needed there.
    listen 80;
    server_name images.example.com;

    # Match MAX_UPLOAD_SIZE_MB (0 = nginx default 1M, so set high for unlimited)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:1349;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Stream responses instead of buffering: needed for SSE progress
        # (batch, AI, feature installs) and for large file downloads.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### 하위 경로에 배포하기 {#subpath}

`https://example.com/snapotter`에서 서비스하려면 SnapOtter 컨테이너 환경에 `BASE_PATH=/snapotter`를 설정하고 다시 시작하세요. 공식 CPU 및 GPU Compose 파일은 셸이나 Compose `.env` 파일에서 `BASE_PATH`도 받을 수 있습니다. 같은 이미지가 어떤 경로에서도 작동하며 프런트엔드를 다시 빌드할 필요가 없습니다.

`BASE_PATH`는 문자, 숫자, `_` 또는 `-`를 포함하는 슬래시로 구분된 세그먼트를 받으며, `/apps/snapotter` 같은 중첩 경로도 가능합니다. 마지막 슬래시는 선택 사항입니다. 루트 배포에서는 비워 두거나(기본값) `/`로 설정하세요.

기존 Nginx HTTPS 서버 블록에서 다음을 사용하세요.

```nginx
location = /snapotter {
    return 308 /snapotter/$is_args$args;
}
location /snapotter/ {
    proxy_pass http://localhost:1349;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 500M;
    proxy_buffering off;
    proxy_read_timeout 300s;
}
```

이 예시는 접두사를 유지합니다. 전달하기 전에 `/snapotter`를 제거하는 프록시도 지원됩니다. 내부 상태 확인은 계속 `/api/v1/health`를 사용할 수 있습니다. OIDC 또는 SAML의 경우 `EXTERNAL_URL=https://example.com/snapotter`도 설정하고, ID 공급자의 콜백 URL을 각각 `/snapotter/api/auth/oidc/callback` 또는 `/snapotter/api/auth/saml/callback`를 포함하도록 업데이트하세요.

API 스크립트는 변경 없이 계속 작동합니다. 도구의 `downloadUrl` 같은 API 응답의 URL은 `BASE_PATH` 값과 관계없이 `/api/`로 시작합니다. 이를 도메인 루트를 기준으로 해석하지 말고 인스턴스의 기본 URL(`https://example.com/snapotter` + `/api/v1/download/...`)에 이어 붙이세요.

접두사가 포함된 URL(`https://example.com/snapotter`)로 UI를 여세요. 접두사 없이 도착한 브라우저는 자동으로 해당 주소로 이동하며, 접두사 없이 앱에 도달하리라 예상되는 것은 API 요청뿐입니다. 로그에 `Requests arrive under /snapotter/ but BASE_PATH is empty`라고 표시된다면 프록시가 `BASE_PATH`에 선언되지 않은 접두사를 전달하고 있는 것입니다. `BASE_PATH`에 해당 접두사를 설정하거나 프록시에서 접두사를 제거하세요.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. 새 Proxy Host를 추가합니다
2. Domain Name을 사용하는 도메인으로 설정합니다
3. Scheme을 `http`로, Forward Hostname을 `SnapOtter`(또는 컨테이너 IP)로, Forward Port를 `1349`로 설정합니다
4. WebSocket 지원을 활성화합니다
5. Advanced에서 `client_max_body_size 500M;`와 `proxy_buffering off;`를 추가합니다

API의 `Strict-Transport-Security` 헤더는 NPM을 그대로 통과합니다. SSL 탭의 HSTS 토글은 그 위에 추가하는 선택 사항입니다.

### Traefik {#traefik}

```yaml
# Add these labels to the SnapOtter service in docker-compose.yml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.snapotter.rule=Host(`images.example.com`)"
  - "traefik.http.routers.snapotter.entrypoints=websecure"
  - "traefik.http.routers.snapotter.tls.certresolver=letsencrypt"
  - "traefik.http.services.snapotter.loadbalancer.server.port=1349"
  # Increase upload limit (default 2MB is too low)
  - "traefik.http.middlewares.snapotter-body.buffering.maxRequestBodyBytes=524288000"
  - "traefik.http.routers.snapotter.middlewares=snapotter-body"
```

Traefik은 업스트림 응답 헤더를 변경 없이 전달하므로 API의 `Strict-Transport-Security` 헤더는 `headers` 미들웨어 없이도 브라우저에 도달합니다. 응답 헤더를 다시 쓰는 미들웨어를 이미 사용 중이라면 해당 헤더를 건드리지 않는지 확인하세요.

### Caddy {#caddy}

```txt
images.example.com {
    reverse_proxy localhost:1349 {
        flush_interval -1
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }
}
```

`flush_interval -1`는 응답 버퍼링을 끄며, 이는 SSE 진행 이벤트(배치 처리, AI 도구, 기능 설치)와 큰 파일 다운로드가 멈추지 않고 스트리밍되기 위해 필요합니다. 확장된 타임아웃은 Caddy가 연결을 일찍 닫지 않고 큰 파일 업로드를 끝낼 수 있게 해 줍니다. Caddy는 API의 `Strict-Transport-Security` 헤더도 그대로 전달하므로 HSTS를 위한 `header` 지시어가 필요 없습니다.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

참고: Cloudflare는 무료 플랜에서 업로드를 100 MB로 제한합니다. 이에 맞게 `MAX_UPLOAD_SIZE_MB=100`를 설정하세요.

터널은 `Strict-Transport-Security`를 포함한 API의 응답 헤더를 그대로 전달하므로 대시보드에서 HSTS를 따로 설정할 필요가 없습니다(Cloudflare 자체 엣지 HSTS 설정은 그 위에 추가하는 선택 사항입니다).

## 문제 해결 {#troubleshooting}

### 첫 시작 실패 직후 "Postgres not reachable: EAI_AGAIN" {#eai-again-after-failed-first-start}

맨 처음 `docker compose up -d`가 중간에 실패한 경우(포트가 이미 사용 중인 것이 흔한 이유입니다), 단순한 `up -d` 재시도는 앱 컨테이너를 compose 네트워크에 연결하지 않은 채 시작할 수 있습니다. 그러면 앱이 다음 오류와 함께 계속 충돌하며 재시작합니다.

```
Postgres not reachable: EAI_AGAIN
```

한편 `docker ps`에서는 postgres가 정상으로 표시됩니다. 오류는 실제이지만 엉뚱한 컨테이너를 가리킵니다. 네트워크가 없으면 `postgres` 호스트 이름에 대한 DNS를 전혀 해석할 수 없고, 재시작 정책이 같은 실패를 영원히 반복합니다.

처음 시작을 망친 원인을 해결한 다음(대개 포트를 비우면 됩니다), 앱 컨테이너를 강제로 다시 만들어 네트워크에 다시 연결되게 하세요.

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: 다른 기기에서는 접속되지만 PC 자체에서는 접속되지 않음 {#windows-wsl2-loopback}

WSL2 안에서 Docker를 실행하는 일반적인 Windows 환경에서는, WSL의 미러링 네트워킹 모드를 켜도 네트워크의 다른 모든 컴퓨터에서는 스택에 접속되는데 Windows 호스트 자체에서는 `http://localhost:1349`가 시간 초과되는 일이 생길 수 있습니다. 포트는 Windows의 `netstat`에 나타나지 않으며, 컨테이너에는 아무 문제가 없습니다.

다른 기기에서 앱을 열거나, 배포판 내부에서 자체 주소(WSL 셸의 `hostname -I`)로 여세요. 사용 중인 WSL 버전에서 localhost 포워딩이 우연히 작동한다면 의존할 대상이 아니라 덤으로 생각하세요.

## CI/CD {#ci-cd}

GitHub 저장소에는 세 가지 워크플로가 있습니다.

- **ci.yml** - 모든 push와 PR에서 자동으로 실행됩니다. 린트, 타입 검사, 테스트, 빌드를 수행하고 Docker 이미지를 (푸시하지 않고) 검증합니다.
- **release.yml** - `workflow_dispatch`를 통해 수동으로 실행합니다. semantic-release를 실행해 버전 태그와 GitHub 릴리스를 만든 다음, 멀티 아키텍처 Docker 이미지(amd64 + arm64)를 빌드해 Docker Hub(`snapotter/snapotter`)와 GitHub Container Registry(`ghcr.io/snapotter-hq/snapotter`)에 푸시합니다.
- **deploy-docs.yml** - 이 문서 사이트를 빌드하고 `main`에 push할 때 Cloudflare Pages에 배포합니다.

릴리스를 만들려면 GitHub UI에서 **Actions > Release > Run workflow**로 이동하거나 다음을 실행하세요.

```bash
gh workflow run release.yml
```

Semantic-release는 커밋 기록으로 버전을 결정합니다. `latest` Docker 태그는 항상 가장 최근 릴리스를 가리킵니다.

## 분석 {#analytics}

SnapOtter에는 버그를 찾고 기능을 개선하는 데 도움이 되는 익명 제품 분석(도구 사용 패턴, 오류 보고서)이 포함되어 있으며 기본적으로 켜져 있습니다. 파일, 파일 이름, 개인 데이터는 절대 포함되지 않습니다. 분석을 끄더라도 SnapOtter는 정상적으로 작동합니다.

### 분석 끄기 {#disabling-analytics}

런타임 옵트아웃은 관리자가 한 번 클릭하는 토글입니다. Settings > System > Privacy를 열고 Anonymous Product Analytics를 끄세요. 인스턴스 전체에서 즉시 중단되며 다시 빌드할 필요가 없습니다.

분석을 절대 내보낼 수 없는 이미지가 필요하다면 저장소를 클론해 다시 빌드하면서 빌드 시점의 완전 비활성화를 설정하세요.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

또는 기존 `docker-compose.yml`에 빌드 인수를 추가하세요.

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
