---
description: "Docker로 SnapOtter를 프로덕션에 배포하기. 하드웨어 요구사항, GPU 설정, Nginx, Traefik, Cloudflare용 리버스 프록시 설정."
i18n_source_hash: ecc1b528bc4b
i18n_provenance: human
i18n_output_hash: fc3b3770c28a
---

# 배포 {#deployment}

SnapOtter는 3개 컨테이너로 구성된 Docker Compose 스택으로 배포됩니다: SnapOtter 앱 이미지, PostgreSQL 17, Redis 8. 앱 이미지는 **linux/amd64**(AI 가속을 위한 NVIDIA CUDA 포함)와 **linux/arm64**(CPU)를 지원하므로, Intel/AMD 서버, Apple Silicon Mac, Raspberry Pi 4/5 같은 ARM 장치에서 네이티브로 실행됩니다. VA-API, Quick Sync, OpenCL을 통한 Intel/AMD iGPU 가속은 현재 AI 추론에 지원되지 않습니다.

GPU 설정, Docker Compose 예시, 버전 고정에 대해서는 [Docker 이미지](./docker-tags)를 참고하세요.

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=true         # Trust X-Forwarded-For headers (set false if not behind a proxy)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)
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
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
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

> **Docker Hub 속도 제한이 걸리나요?** `snapotter/snapotter:latest`을 `ghcr.io/snapotter-hq/snapotter:latest`로 바꿔 대신 GitHub Container Registry에서 가져오세요. 두 레지스트리 모두 릴리스마다 동일한 이미지를 받습니다.

## 빠른 시작 (NVIDIA CUDA) {#quick-start-nvidia-cuda}

AI 도구(배경 제거, 업스케일링, 얼굴 향상, OCR)에서 NVIDIA CUDA 가속을 사용하려면:

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
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

로그에서 CUDA 감지를 확인하세요:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## 하드웨어 요구사항 {#hardware-requirements}

이 수치는 NVIDIA RTX 4070이 장착된 최신 amd64 워크스테이션부터 Raspberry Pi에 이르는 다양한 시스템에서 전체 도구 카탈로그를 각각 실행하고 Docker 리소스 제한을 조정해 실제 하한선을 찾는 벤치마크에서 나온 것입니다.

### 빠른 참조 {#quick-reference}

| 등급 | 사용 사례 | CPU | RAM | GPU | 스토리지 |
|------|----------|-----|-----|-----|---------|
| 최소 | 이미지, 파일, 가벼운 PDF 도구; 단일 사용자; 소규모 배치 | 2코어 | 2 GB | 없음 | ~7 GB |
| 권장 | CPU에서 동영상, PDF, AI를 포함한 다섯 가지 모달리티 전체; 배치; 소수 사용자 | 4코어 | 4 GB | 없음 | ~25 GB |
| 풀 | GPU AI를 포함한 모든 것을 빠르게; 대규모 배치; 다수 사용자 | 6-8코어 | 8 GB | NVIDIA 8 GB+ VRAM (12 GB 여유 있음) | ~35 GB |

**아키텍처: 64비트 전용** (`linux/amd64` 또는 `linux/arm64`). SnapOtter는 Intel/AMD 서버, Apple Silicon Mac, 그리고 **Raspberry Pi 4 및 5**(4-8 GB)를 포함한 64비트 ARM 보드에서 네이티브로 실행됩니다. 32비트 ARM(`armv7`/`armhf`)에서는 실행되지 **않으며**(해당 이미지가 빌드되지 않음), 메모리 하한선 아래에 있는 Pi Zero 같은 512 MB급 보드에서도 실행되지 않습니다(아래 참고).

### 최소 (이미지, 파일, 가벼운 PDF 도구; AI 없음) {#minimum-image-files-and-light-pdf-tools-no-ai}

| 리소스 | 요구사항 |
|---|---|
| CPU | 2코어 |
| RAM | 2 GB |
| 디스크 | ~5.5 GB (이미지) + 데이터 볼륨 |
| GPU | 필요 없음 |

222개의 비AI 카탈로그 도구 전체 - 이미지(리사이즈, 자르기, 변환, 압축, 조정, 워터마크), 동영상(트리밍, 음소거, 리먹스), 오디오(변환, 정규화, 트리밍), PDF(병합, 분할, 압축, 회전, 보호), 파일 변환, 전용 변환 프리셋 - 이 소박한 하드웨어에서 실행됩니다. 대부분의 작업은 큰 파일에서도 1초를 훨씬 밑도는 시간에 끝납니다: 2.7 MB 이미지는 ~0.05초에 리사이즈되고 ~2초에 WebP로 재인코딩됩니다.

메모리 하한선은 Docker 리소스 제한 조정 결과로 실제로 존재합니다: **512 MB로는 스택을 시작할 수 없고**(단일 이미지 리사이즈조차 강제 종료됨), **1 GB**는 단일 파일 작업을 처리하지만 다중 파일 배치는 메모리가 부족해지며, **2 GB / 2코어**가 배치를 편안하게 처리하는 가장 작은 구성입니다.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**유일하게 CPU를 많이 쓰는 예외는 동영상 재인코딩입니다.** 스트림 복사 작업(트리밍, 음소거, 컨테이너 리먹스)은 즉각적이지만, 다른 코덱으로 트랜스코딩하는 것은 CPU에 묶입니다. 1080p / 45초 클립을 VP9(WebM)로 재인코딩하는 데 빠른 최신 CPU에서 약 **~40초**, Apple Silicon에서 ~45초, 오래된 모바일 4코어에서 ~80초, 오래된 4코어 서버에서 **~130초**가 걸립니다. 워크로드가 동영상 위주라면 CPU 코어와 클럭 속도를 우선하거나 컨테이너의 `cpus:` 제한을 높이세요. 기본 제공 compose는 앱을 기본 4코어(GPU compose에서는 8코어)로 제한합니다.

### 권장 (CPU에서 AI 도구) {#recommended-ai-tools-on-cpu}

| 리소스 | 요구사항 |
|---|---|
| CPU | 4코어 |
| RAM | 4 GB |
| 디스크 | 3 GB (이미지) + 24 GB (AI 모델) + 작업 공간 |
| GPU | 필요 없음 (CPU 폴백) |

**AI 번들을 설치하는 것이 RAM을 4 GB로 끌어올리는 요인입니다.** AI가 설치되지 않으면 앱은 약 360 MB에서 유휴 상태를 유지하지만, 7개 번들을 모두 설치하면 ~2.6 GB의 상주 메모리를 유지합니다. Python AI 사이드카가 시작 시 모델(배경 제거, 업스케일링, OCR, 전사, 얼굴 감지, 복원)을 미리 로드하기 때문입니다. 비AI 설치는 가볍게 유지되며, AI 설치는 4 GB 이상이 필요합니다.

대부분의 AI 도구는 CPU에서 충분히 사용 가능하며, 몇몇은 GPU가 꼭 필요합니다. 최신 4코어 CPU에서 측정:

| AI 도구 | CPU 시간 | CPU에서 사용 가능? |
|---|---|---|
| 얼굴 감지(blur-faces, smart-crop, red-eye), noise-removal | 1초 미만 | 예 |
| OCR, 전사, 자막 | 1-3초 | 예 |
| Colorize, 얼굴 향상 | ~10초 | 예 |
| 배경 제거 / 교체 / 흐림 | ~29초 | 예 (기다려야 함) |
| AI 업스케일 (RealESRGAN) | 작은 이미지 ~33초; 큰 이미지는 수 분 | 애매함 — GPU를 강력히 권장 |
| 사진 복원 (전체 파이프라인) | 수 분 | 아니요 — GPU 또는 빠른 다중 코어 CPU가 필요 |

AI 모델 다운로드 크기:

| 번들 | 디스크 크기 |
|---|---|
| 배경 제거 | 4-5 GB |
| 업스케일 + 얼굴 향상 + 노이즈 제거 | 5-6 GB |
| 얼굴 감지 | 200-300 MB |
| 오브젝트 지우개 + Colorize | 1-2 GB |
| OCR | 5-6 GB |
| 사진 복원 | 4-5 GB |
| **모든 번들** | **~24 GB** |

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### 풀 (NVIDIA CUDA에서 AI 도구) {#full-ai-tools-on-nvidia-cuda}

| 리소스 | 요구사항 |
|---|---|
| CPU | 6-8코어 (GPU AI를 사용해도 동영상 준비 + 동시성은 CPU에서 실행됨) |
| RAM | 8 GB |
| GPU | 8+ GB VRAM을 갖춘 NVIDIA (12 GB 권장) |
| 디스크 | 총 ~35 GB |

NVIDIA GPU(CUDA)는 무거운 AI 모델을 극적으로 가속합니다. RTX 4070 대 최신 CPU에서 측정:

| AI 도구 | GPU 사용 시 속도 향상 | 비고 |
|---|---|---|
| AI 업스케일 (RealESRGAN 2×) | **~47×** | 가장 큰 이득 — ~33초(큰 이미지는 수 분) 대비 1초 미만 |
| 얼굴 향상 (CodeFormer) | **~12×** | ~0.9초 대 ~11초 |
| 전사 (Whisper) | ~4.5× | |
| 배경 제거 / 교체 / 흐림 | ~4× | GPU에서 ~7초 대 CPU에서 ~29초 |
| Colorize | ~1.8× | |
| OCR, 얼굴 감지, red-eye, noise-removal | ~1× | CPU에서 이미 빠름 — GPU가 도움이 되지 않음 |
| 사진 복원 | 없음 | GPU에서도 CPU에 묶임(GPU 사용률 0%); 여기서는 GPU보다 빠른 CPU가 더 중요 |

GPU를 쓸 가치가 있는 도구는 **업스케일, 얼굴 향상, 전사, 배경 제거**입니다. 얼굴 감지, OCR, red-eye는 CPU에 묶여 있고 이미 빠르므로 GPU가 아무것도 더해주지 않습니다.

최고 VRAM 사용량은 얼굴 향상을 동반한 업스케일 중 7.5 GB에 도달합니다. 6 GB NVIDIA GPU는 대부분의 AI 도구를 개별적으로는 처리하지만 업스케일에서는 실패합니다. 8-12 GB VRAM은 모든 것을 처리합니다.

VA-API, Quick Sync, OpenCL을 통한 Intel/AMD iGPU 가속은 현재 AI 추론에 지원되지 않습니다. `/dev/dri`을 컨테이너에 매핑해도 AI GPU 가속이 활성화되지 않습니다. NVIDIA CUDA를 사용할 수 없으면 SnapOtter는 AI 도구를 CPU에서 실행합니다.

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

기본 4코어 제한 앱 컨테이너에 대한 병렬 이미지 리사이즈 요청:

| 동시 요청 | 평균 응답 시간 | 오류 |
|---|---|---|
| 1 | 0.4초 | 0 |
| 5 | 1.2초 | 0 |
| 10 | 2.1초 | 0 |

워커 풀이 포화됨에 따라 응답 시간은 오류 없이 준선형적으로 저하됩니다. 앱 컨테이너의 `cpus:` 제한을 높이거나(또는 더 많은 코어를 가진 호스트를 사용하면) 상한이 올라갑니다. 무거운 작업(동영상 트랜스코드, CPU AI)은 전체 실행 시간 동안 워커를 점유하므로, 요청 수뿐만 아니라 예상되는 동시 무거운 작업 수에 맞춰 CPU 규모를 정하세요.

### 지원되는 이미지 형식 {#supported-image-formats}

SnapOtter는 20개 이상의 카메라 브랜드의 RAW 파일, 전문 형식(PSD, EPS, OpenEXR, HDR), 최신 코덱(JPEG XL, AVIF, HEIC, QOI), 과학/게임 형식(FITS, DDS)을 포함해 **55개 이상의 입력 형식**과 **14개의 출력 형식**을 지원합니다.

지원되는 모든 형식, 사용된 디코더, 사용 가능한 품질 제어에 대한 자세한 내용은 [전체 형식 목록](/ko/guide/supported-formats)을 참고하세요.

### 알려진 제한사항 {#known-limitations}

- **콘텐츠 인식 리사이즈**는 caire 바이너리의 제한으로 큰 이미지(>5 MP)에서 충돌합니다. 작은 이미지에서는 잘 작동합니다.
- **HEIF 디코드**는 13-23초가 걸립니다. HEIC(Apple의 변형)는 0.3-0.9초로 훨씬 빠릅니다.
- **OCR 일본어**는 PaddlePaddle MKLDNN 버그로 CPU에서 실패합니다. GPU에서는 작동합니다.
- **업스케일**은 작은 이미지를 넘어서는 것에 대해 CPU에서 타임아웃됩니다. 실용적으로 사용하려면 GPU가 필요합니다.
- **CodeFormer** 얼굴 향상은 GFPGAN보다 상당히 느립니다(GPU에서 53초 대 2초). 대부분의 사용 사례에는 GFPGAN이 권장됩니다.

## 볼륨 {#volumes}

| 마운트 / 볼륨 | 용도 | 필수? |
|---|---|---|
| `/data` (앱) | AI 모델, Python venv, 사용자 파일 | **예** - 없으면 파일 손실 |
| `/tmp/workspace` (앱) | 임시 처리 파일 (자동 정리됨) | 권장 |
| `SnapOtter-pgdata` (postgres) | PostgreSQL 데이터 디렉터리 (사용자, 설정, 파이프라인, 작업) | **예** - 없으면 데이터 손실 |
| `SnapOtter-redisdata` (redis) | 내구성 있는 작업 큐를 위한 Redis 추가 전용 파일 | 권장 |

### 바인드 마운트 대 명명된 볼륨 {#bind-mounts-vs-named-volumes}

**명명된 볼륨** (권장) — Docker가 권한을 자동으로 관리합니다:
```yaml
volumes:
  - SnapOtter-data:/data
```

**바인드 마운트** — 여러분이 권한을 관리합니다. 호스트 사용자에 맞게 `PUID`/`PGID`를 설정하세요:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### 스토리지 권한 {#storage-permissions}

SnapOtter는 런타임에 두 위치에 씁니다: `/data`(사용자 파일, 로그, AI 모델, Python venv)와 `/tmp/workspace`(임시 처리 스크래치). 둘 다 컨테이너가 실행되는 사용자가 쓸 수 있어야 합니다. 어느 하나라도 그렇지 않으면, 컨테이너는 "정상"으로 부팅한 뒤 첫 업로드에서 알 수 없는 오류로 실패하는 대신, 디렉터리 이름, 실행 중인 UID/GID, 해결 방법을 알리는 메시지와 함께 **시작 시 빠르게 실패합니다**.

권한 처리 방식은 컨테이너가 어떻게 시작되는지에 따라 다릅니다:

**기본값 (root로 시작해 `snapotter`로 전환)** — 엔트리포인트가 root로 시작해 마운트된 볼륨의 소유권을 수정한 뒤, `gosu`를 통해 권한이 없는 `snapotter` 사용자로 전환합니다. 명명된 볼륨은 설정 없이 작동합니다. 바인드 마운트의 경우, 쓰여지는 파일이 여러분 소유가 되도록 `PUID`/`PGID`을 호스트 사용자로 설정하세요(위 참고).

**Kubernetes / OpenShift (`runAsUser`를 통한 비root)** — 비root 사용자로 직접 시작되면 컨테이너가 스스로 볼륨을 chown할 수 없으므로, 오케스트레이터가 볼륨을 쓸 수 있게 만들어야 합니다. `fsGroup`을 설정하세요:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

이미지의 쓰기 가능 디렉터리는 GID 0으로 그룹 소유이고 그룹 쓰기가 가능하므로, **임의의 UID**에 root 보조 그룹(OpenShift 기본값)이 더해진 파드는 `chown` 없이 쓸 수 있습니다.

**TrueNAS Scale (및 기타 "외부 UID" 설정)** — TrueNAS는 앱을 비root 사용자(종종 `568:568`)로 실행하고 다른 사용자가 소유한 호스트 데이터셋을 마운트하므로, 엔트리포인트도 `fsGroup`도 스스로 이를 쓸 수 있게 만들지 못합니다. 다음 중 하나를 선택하세요:

- **앱을 root로 실행** (권장) — 앱의 사용자를 설정하지 않은 채로 두거나 `0`로 설정하고, 기본 엔트리포인트가 권한을 수정하고 `snapotter`로 전환하게 하세요.
- **UID `999`로 실행** — 앱의 사용자/그룹을 `999:999`(SnapOtter의 내장 `snapotter` 사용자)로 설정해 이미지의 소유권과 일치시키세요.
- 호스트 데이터셋을 컨테이너가 실행되는 UID로 **`chown`**하세요. TrueNAS 셸에서:

  ```bash
  # 시작 오류의 UID를 사용하세요 (또는 컨테이너 내부에서 `id`를 실행하세요)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

시작 오류가 사용할 정확한 UID를 알려주므로, 가장 빠른 방법은 앱을 한 번 시작하고 메시지를 읽은 뒤 그에 맞게 `chown`(또는 사용자 조정)하는 것입니다.

## 환경 변수 {#environment-variables}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `AUTH_ENABLED` | `true` | 로그인 요구사항 활성화/비활성화 |
| `DEFAULT_USERNAME` | `admin` | 초기 관리자 사용자명 |
| `DEFAULT_PASSWORD` | `admin` | 초기 관리자 비밀번호 (첫 로그인 시 변경 강제) |
| `MAX_UPLOAD_SIZE_MB` | `100` | 파일당 업로드 제한 |
| `MAX_BATCH_SIZE` | `100` | 배치 요청당 최대 파일 수 |
| `RATE_LIMIT_PER_MIN` | `1000` | IP당 분당 API 요청 수 (0으로 설정하면 비활성화) |
| `MAX_USERS` | `0` (무제한) | 최대 사용자 계정 수 |
| `TRUST_PROXY` | `true` | 리버스 프록시의 X-Forwarded-For 헤더 신뢰 |
| `PUID` | `999` | 이 UID로 실행 (바인드 마운트 권한용) |
| `PGID` | `999` | 이 GID로 실행 (바인드 마운트 권한용) |
| `LOG_LEVEL` | `info` | 로그 상세도: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (자동) | 최대 병렬 AI 처리 작업 수 |
| `SESSION_DURATION_HOURS` | `168` | 로그인 세션 수명 (7일) |
| `CORS_ORIGIN` | (비어 있음) | 쉼표로 구분된 허용 오리진, 또는 동일 오리진의 경우 비워둠 |

## 헬스 체크 {#health-check}

컨테이너에는 내장 헬스 체크가 포함됩니다:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## 리버스 프록시 {#reverse-proxy}

SnapOtter는 기본적으로 `TRUST_PROXY=true`를 설정하여 속도 제한과 로깅이 `X-Forwarded-For` 헤더의 실제 클라이언트 IP를 사용하게 합니다.

### Nginx {#nginx}

```nginx
server {
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

        # SSE support (batch progress, feature install progress)
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Nginx Proxy Manager {#nginx-proxy-manager}

1. 새 Proxy Host를 추가하세요
2. Domain Name을 여러분의 도메인으로 설정하세요
3. Scheme을 `http`로, Forward Hostname을 `SnapOtter`(또는 컨테이너 IP)로, Forward Port를 `1349`으로 설정하세요
4. WebSocket 지원을 활성화하세요
5. Advanced에서 `client_max_body_size 500M;`과 `proxy_buffering off;`을 추가하세요

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

`flush_interval -1`는 응답 버퍼링을 비활성화하는데, 이는 SSE 진행 이벤트(배치 처리, AI 도구, 기능 설치)에 필요합니다. 연장된 타임아웃은 Caddy가 연결을 조기에 닫지 않고 대용량 파일 업로드를 완료할 수 있게 합니다.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

참고: Cloudflare는 무료 플랜에서 100 MB 업로드 제한이 있습니다. 이에 맞게 `MAX_UPLOAD_SIZE_MB=100`을 설정하세요.

## CI/CD {#ci-cd}

GitHub 저장소에는 세 가지 워크플로우가 있습니다:

- **ci.yml** - 모든 푸시와 PR에서 자동으로 실행됩니다. 린트, 타입체크, 테스트, 빌드를 수행하고 (푸시 없이) Docker 이미지를 검증합니다.
- **release.yml** - `workflow_dispatch`을 통해 수동으로 트리거됩니다. semantic-release를 실행해 버전 태그와 GitHub 릴리스를 만든 뒤, 다중 아키텍처 Docker 이미지(amd64 + arm64)를 빌드하고 Docker Hub(`snapotter/snapotter`)와 GitHub Container Registry(`ghcr.io/snapotter-hq/snapotter`)에 푸시합니다.
- **deploy-docs.yml** - 이 문서 사이트를 빌드하고 `main`로 푸시할 때 Cloudflare Pages에 배포합니다.

릴리스를 만들려면 GitHub UI에서 **Actions > Release > Run workflow**로 이동하거나, 다음을 실행하세요:

```bash
gh workflow run release.yml
```

Semantic-release는 커밋 이력에서 버전을 결정합니다. `latest` Docker 태그는 항상 가장 최근 릴리스를 가리킵니다.

## 분석 {#analytics}

SnapOtter에는 버그를 잡고 기능을 개선하는 데 도움이 되는 익명 제품 분석(도구 사용 패턴, 오류 리포트)이 포함됩니다. 기본적으로 켜져 있습니다. 여러분의 파일, 파일명, 개인 데이터는 여기에 포함되지 않습니다. 분석을 비활성화해도 SnapOtter는 정상적으로 작동합니다.

### 분석 비활성화 {#disabling-analytics}

런타임 옵트아웃은 원클릭 관리자 토글입니다. Settings > System > Privacy를 열고 Anonymous Product Analytics를 끄세요. 인스턴스 전체에 대해 즉시 중지되며, 재빌드가 필요 없습니다.

분석을 절대 방출할 수 없는 이미지를 원한다면, 저장소를 클론하고 재빌드하여 빌드 타임 하드 오프를 설정하세요:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

또는 기존 `docker-compose.yml`에 빌드 인자를 추가하세요:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
