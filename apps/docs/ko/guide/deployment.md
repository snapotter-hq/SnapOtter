---
description: "Docker로 SnapOtter를 프로덕션에 배포. 하드웨어 요구 사항, GPU 설정, Nginx, Traefik, Cloudflare용 리버스 프록시 구성."
i18n_source_hash: 6b6957060fa6
i18n_provenance: machine
i18n_output_hash: 6f74c9877d90
---

# 배포 {#deployment}

SnapOtter는 SnapOtter 앱 이미지, PostgreSQL 17, Redis 8로 구성된 3-컨테이너 Docker Compose 스택으로 배포된다. 앱 이미지는 **linux/amd64**(AI 가속용 NVIDIA CUDA 포함)와 **linux/arm64**(CPU)를 지원하므로, Intel/AMD 서버, Apple Silicon Mac, 그리고 Raspberry Pi 4/5 같은 ARM 기기에서 네이티브로 실행된다. VA-API, Quick Sync, OpenCL을 통한 Intel/AMD iGPU 가속은 현재 AI 추론에 지원되지 않는다.

GPU 설정, Docker Compose 예제, 버전 고정에 대해서는 [Docker 이미지](./docker-tags)를 참고하라.

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

이후 앱은 `http://localhost:1349`에서 사용할 수 있다.

> **Docker Hub 속도 제한이 걸리나요?** `snapotter/snapotter:latest`을 `ghcr.io/snapotter-hq/snapotter:latest`로 바꿔 GitHub Container Registry에서 대신 가져오세요. 두 레지스트리 모두 릴리스마다 동일한 이미지를 받습니다.

## 빠른 시작 (NVIDIA CUDA) {#quick-start-nvidia-cuda}

AI 도구(배경 제거, 업스케일링, 얼굴 보정, OCR)에 NVIDIA CUDA 가속을 사용하려면:

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

로그에서 CUDA 감지 여부를 확인하라:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## 하드웨어 요구 사항 {#hardware-requirements}

이 수치는 NVIDIA RTX 4070을 탑재한 최신 amd64 워크스테이션부터 Raspberry Pi에 이르기까지 다양한 시스템에서, 각각 전체 도구 카탈로그를 실행하고 Docker 리소스 제한을 조정하며 실제 하한선을 찾는 벤치마크에서 나온 것이다.

### 빠른 참조 {#quick-reference}

| 등급 | 사용 사례 | CPU | RAM | GPU | 스토리지 |
|------|----------|-----|-----|-----|---------|
| 최소 | 이미지, 파일, 가벼운 PDF 도구; 단일 사용자; 소규모 배치 | 2 코어 | 2 GB | 없음 | ~7 GB |
| 권장 | CPU에서 비디오, PDF, AI를 포함한 다섯 모달리티 전체; 배치; 소수 사용자 | 4 코어 | 4 GB | 없음 | ~25 GB |
| 완전 | GPU AI를 포함한 모든 것을 빠르게; 대규모 배치; 다수 사용자 | 6-8 코어 | 8 GB | NVIDIA 8 GB+ VRAM (12 GB 여유) | ~35 GB |

**아키텍처: 64비트 전용** (`linux/amd64` 또는 `linux/arm64`). SnapOtter는 Intel/AMD 서버, Apple Silicon Mac, 그리고 **Raspberry Pi 4 및 5**(4-8 GB)를 포함한 64비트 ARM 보드에서 네이티브로 실행된다. 32비트 ARM(`armv7`/`armhf`)에서는 **실행되지 않으며**(해당 이미지가 빌드되지 않음), 메모리 하한선 아래인 Pi Zero 같은 512 MB급 보드에서도 실행되지 않는다(아래 참고).

### 최소 (이미지, 파일, 가벼운 PDF 도구; AI 없음) {#minimum-image-files-and-light-pdf-tools-no-ai}

| 리소스 | 요구 사항 |
|---|---|
| CPU | 2 코어 |
| RAM | 2 GB |
| 디스크 | ~5.5 GB (이미지) + 데이터 볼륨 |
| GPU | 필요 없음 |

222개의 비AI 카탈로그 도구 전부, 즉 이미지(크기 조정, 자르기, 변환, 압축, 조정, 워터마크), 비디오(트림, 음소거, 리먹스), 오디오(변환, 노멀라이즈, 트림), PDF(병합, 분할, 압축, 회전, 보호), 파일 변환, 그리고 전용 변환 프리셋은 모두 소박한 하드웨어에서 실행된다. 대부분의 작업은 큰 파일에서도 1초를 크게 밑돌며 끝난다. 2.7 MB 이미지는 ~0.05초 만에 크기가 조정되고 ~2초 만에 WebP로 다시 인코딩된다.

메모리 하한선은 Docker 리소스 제한 조정 실험에서 확인된 실제 값이다. **512 MB로는 스택을 시작할 수 없고**(단일 이미지 크기 조정조차 강제 종료됨), **1 GB**는 단일 파일 작업은 처리하지만 다중 파일 배치에서 메모리가 부족해지며, **2 GB / 2 코어**는 배치를 편안하게 처리하는 가장 작은 구성이다.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**CPU를 많이 쓰는 유일한 예외는 비디오 재인코딩이다.** 스트림 복사 작업(트림, 음소거, 컨테이너 리먹스)은 즉각적이지만, 다른 코덱으로 트랜스코딩하는 것은 CPU에 의존한다. 1080p / 45초 클립을 VP9(WebM)로 재인코딩하는 데 빠른 최신 CPU에서는 약 **~40초**, Apple Silicon에서는 ~45초, 구형 모바일 4코어에서는 ~80초, 구형 4코어 서버에서는 **~130초**가 걸린다. 워크로드가 비디오 중심이라면 CPU 코어와 클럭 속도를 우선하거나 컨테이너의 `cpus:` 제한을 높여라. 기본 제공되는 compose는 앱을 기본 4코어로 제한한다(GPU compose에서는 8코어).

### 권장 (CPU에서의 AI 도구) {#recommended-ai-tools-on-cpu}

| 리소스 | 요구 사항 |
|---|---|
| CPU | 4 코어 |
| RAM | 4 GB |
| 디스크 | 3 GB (이미지) + 24 GB (AI 모델) + 작업 공간 |
| GPU | 필요 없음 (CPU 폴백) |

**RAM을 4 GB로 끌어올리는 것은 AI 번들 설치다.** AI를 설치하지 않으면 앱은 대략 360 MB에서 유휴 상태로 있지만, 7개 번들을 모두 설치하면 ~2.6 GB의 상주 메모리를 유지한다. Python AI 사이드카가 시작 시 모델(배경 제거, 업스케일링, OCR, 전사, 얼굴 감지, 복원)을 미리 로드하기 때문이다. 비AI 설치는 가볍게 유지되지만, AI 설치에는 4 GB 이상이 필요하다.

대부분의 AI 도구는 CPU에서도 충분히 사용할 수 있으나, 일부는 GPU가 절실하다. 최신 4코어 CPU에서 측정한 값:

| AI 도구 | CPU 시간 | CPU에서 사용 가능? |
|---|---|---|
| 얼굴 감지(얼굴 블러, 스마트 크롭, 적목), 노이즈 제거 | 1초 미만 | 예 |
| OCR, 전사, 자막 | 1-3초 | 예 |
| 컬러화, 얼굴 보정 | ~10초 | 예 |
| 배경 제거 / 교체 / 블러 | ~29초 | 예 (기다려야 함) |
| AI 업스케일 (RealESRGAN) | 작은 이미지 ~33초; 큰 이미지는 수 분 | 애매함 (GPU 강력 권장) |
| 사진 복원 (전체 파이프라인) | 수 분 | 아니요 (GPU 또는 빠른 다코어 CPU 필요) |

SnapOtter는 의도적으로 이러한 모델 다운로드를 Docker 이미지에 굽지 않는다. AI 번들은 관리자가 관련 도구를 활성화할 때만 가져오며, 상시 유지되는 `/data/ai` 볼륨에 저장되고, 동일한 모델 스택에 의존하는 모든 도구가 공유한다. 이렇게 하면 최종 컨테이너 이미지가 작게 유지되면서도, 전체 AI 설치 시 아래의 더 큰 스토리지 수치에 도달할 수 있다.

일부 도구는 둘 이상의 공유 번들에 의존한다. 예를 들어 여권 사진은 `background-removal`와 `face-detection`가 모두 필요하다. `background-removal`가 이미 설치되어 있다면, 여권 사진을 활성화할 때 누락된 `face-detection` 번들만 다운로드한다. 동일한 재사용이 모든 AI 도구에 적용된다.

AI 모델 다운로드 크기:

| 번들 | 디스크 크기 |
|---|---|
| 배경 제거 | 4-5 GB |
| 업스케일 + 얼굴 보정 + 노이즈 제거 | 5-6 GB |
| 얼굴 감지 | 200-300 MB |
| 객체 지우기 + 컬러화 | 1-2 GB |
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

### 완전 (NVIDIA CUDA에서의 AI 도구) {#full-ai-tools-on-nvidia-cuda}

| 리소스 | 요구 사항 |
|---|---|
| CPU | 6-8 코어 (GPU AI를 쓰더라도 비디오 준비 + 동시성은 CPU에서 실행됨) |
| RAM | 8 GB |
| GPU | 8+ GB VRAM을 갖춘 NVIDIA (12 GB 권장) |
| 디스크 | 총 ~35 GB |

NVIDIA GPU(CUDA)는 무거운 AI 모델의 속도를 극적으로 높인다. RTX 4070 대 최신 CPU에서 측정한 값:

| AI 도구 | GPU 사용 시 속도 향상 | 비고 |
|---|---|---|
| AI 업스케일 (RealESRGAN 2×) | **~47×** | 가장 큰 이득으로, ~33초(큰 이미지는 수 분) 대비 1초 미만 |
| 얼굴 보정 (CodeFormer) | **~12×** | ~11초 대비 ~0.9초 |
| 전사 (Whisper) | ~4.5× | |
| 배경 제거 / 교체 / 블러 | ~4× | CPU ~29초 대비 GPU ~7초 |
| 컬러화 | ~1.8× | |
| OCR, 얼굴 감지, 적목, 노이즈 제거 | ~1× | CPU에서 이미 빠름 (GPU가 도움 되지 않음) |
| 사진 복원 | 없음 | GPU에서도 CPU에 의존(GPU 사용률 0%); 여기서는 GPU보다 빠른 CPU가 더 중요함 |

GPU가 값어치를 하는 도구는 **업스케일, 얼굴 보정, 전사, 배경 제거**다. 얼굴 감지, OCR, 적목은 CPU에 의존하며 이미 빠르므로 GPU가 아무것도 더해 주지 않는다.

VRAM 최대 사용량은 얼굴 보정을 함께 하는 업스케일 도중 7.5 GB에 이른다. 6 GB NVIDIA GPU는 대부분의 AI 도구를 개별적으로는 처리하지만 업스케일에서는 실패한다. 8-12 GB VRAM은 모든 것을 처리한다.

VA-API, Quick Sync, OpenCL을 통한 Intel/AMD iGPU 가속은 현재 AI 추론에 지원되지 않는다. `/dev/dri`를 컨테이너에 매핑해도 AI GPU 가속은 활성화되지 않는다. NVIDIA CUDA를 사용할 수 없는 한 SnapOtter는 AI 도구를 CPU에서 실행한다.

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

기본 4코어 제한 앱 컨테이너에 대한 병렬 이미지 크기 조정 요청:

| 동시 요청 | 평균 응답 시간 | 오류 |
|---|---|---|
| 1 | 0.4초 | 0 |
| 5 | 1.2초 | 0 |
| 10 | 2.1초 | 0 |

워커 풀이 포화되면서 응답 시간은 오류 없이 준선형으로 저하된다. 앱 컨테이너의 `cpus:` 제한을 높이거나(또는 더 많은 코어를 갖춘 호스트를 사용하면) 상한선이 올라간다. 무거운 작업(비디오 트랜스코딩, CPU AI)은 전체 실행 동안 워커 하나를 점유하므로, 단순 요청 수가 아니라 예상되는 동시 무거운 작업 수에 맞춰 CPU를 산정하라.

### 지원 이미지 형식 {#supported-image-formats}

SnapOtter는 20+ 카메라 브랜드의 RAW 파일, 전문 형식(PSD, EPS, OpenEXR, HDR), 최신 코덱(JPEG XL, AVIF, HEIC, QOI), 과학/게임 형식(FITS, DDS)을 포함해 **55+ 입력 형식**과 **14 출력 형식**을 지원한다.

지원되는 모든 형식, 사용된 디코더, 사용 가능한 품질 제어에 대한 자세한 내용은 [전체 형식 목록](/ko/guide/supported-formats)을 참고하라.

### 알려진 제한 사항 {#known-limitations}

- **콘텐츠 인식 크기 조정**은 caire 바이너리의 한계 때문에 큰 이미지(>5 MP)에서 충돌한다. 더 작은 이미지에서는 정상 작동한다.
- **HEIF 디코드**는 13-23초가 걸린다. HEIC(Apple 변형)는 0.3-0.9초로 훨씬 빠르다.
- **OCR 일본어**는 PaddlePaddle MKLDNN 버그 때문에 CPU에서 실패한다. GPU에서는 작동한다.
- **업스케일**은 작은 이미지를 넘어서면 CPU에서 타임아웃된다. 실용적으로 쓰려면 GPU가 필요하다.
- **CodeFormer** 얼굴 보정은 GFPGAN보다 상당히 느리다(GPU에서 53초 대 2초). 대부분의 사용 사례에는 GFPGAN이 권장된다.

## 볼륨 {#volumes}

| 마운트 / 볼륨 | 용도 | 필수 여부 |
|---|---|---|
| `/data` (app) | AI 모델, Python venv, 사용자 파일 | **예** - 없으면 파일 손실 |
| `/tmp/workspace` (app) | 임시 처리 파일 (자동 정리됨) | 권장 |
| `SnapOtter-pgdata` (postgres) | PostgreSQL 데이터 디렉터리 (사용자, 설정, 파이프라인, 작업) | **예** - 없으면 데이터 손실 |
| `SnapOtter-redisdata` (redis) | 내구성 있는 작업 큐를 위한 Redis append-only 파일 | 권장 |

### 바인드 마운트 vs. 명명된 볼륨 {#bind-mounts-vs-named-volumes}

**명명된 볼륨**(권장). Docker가 권한을 자동으로 관리한다:
```yaml
volumes:
  - SnapOtter-data:/data
```

**바인드 마운트**. 권한을 직접 관리한다. 호스트 사용자에 맞게 `PUID`/`PGID`를 설정하라:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### 스토리지 권한 {#storage-permissions}

SnapOtter는 런타임에 두 위치에 쓴다. `/data`(사용자 파일, 로그, AI 모델 및 Python venv)와 `/tmp/workspace`(임시 처리 스크래치)이다. 둘 다 컨테이너가 실행되는 사용자가 쓸 수 있어야 한다. 어느 하나라도 쓸 수 없으면, 컨테이너는 "정상" 상태로 부팅한 뒤 첫 업로드에서 알 수 없는 오류로 실패하는 대신, 해당 디렉터리, 실행 중인 UID/GID, 그리고 해결 방법을 알려주는 메시지와 함께 **시작 시 즉시 실패한다**.

권한이 처리되는 방식은 컨테이너가 어떻게 실행되는지에 따라 달라진다:

**기본 (root로 시작해 `snapotter`로 강등):** 엔트리포인트는 root로 시작해 마운트된 볼륨의 소유권을 수정한 뒤, `gosu`를 통해 권한 없는 `snapotter` 사용자로 강등한다. 명명된 볼륨은 별도 구성 없이 작동한다. 바인드 마운트의 경우, 이것이 쓰는 파일이 사용자 소유가 되도록 `PUID`/`PGID`를 호스트 사용자로 설정하라(위 참고).

**Kubernetes / OpenShift (`runAsUser`를 통한 비root):** 비root 사용자로 직접 실행되면 컨테이너가 볼륨을 스스로 chown할 수 없으므로, 오케스트레이터가 쓰기 가능하게 만들어야 한다. `fsGroup`을 설정하라:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

이미지의 쓰기 가능 디렉터리는 GID 0이 그룹 소유하며 그룹 쓰기가 가능하므로, **임의 UID**에 root 보조 그룹(OpenShift 기본값)을 더해 실행되는 파드는 `chown` 없이도 쓸 수 있다.

**TrueNAS Scale (및 기타 "외부 UID" 설정):** TrueNAS는 앱을 비root 사용자(대개 `568:568`)로 실행하고 다른 사용자가 소유한 호스트 데이터셋을 마운트하므로, 엔트리포인트도 `fsGroup`도 스스로 이를 쓰기 가능하게 만들지 못한다. 다음 중 하나를 선택하라:

- **앱을 root로 실행**(권장): 앱의 사용자를 설정하지 않고 두거나 `0`로 설정한 뒤, 기본 엔트리포인트가 권한을 수정하고 `snapotter`로 강등하도록 둔다.
- **UID `999`로 실행**: 앱의 사용자/그룹을 `999:999`(SnapOtter 내장 `snapotter` 사용자)로 설정해 이미지의 소유권과 일치시킨다.
- 컨테이너가 실행되는 UID로 호스트 데이터셋을 **`chown`**하라. TrueNAS 셸에서:

  ```bash
  # 시작 오류에서 나온 UID를 사용하라(또는 컨테이너 안에서 `id` 실행)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

시작 오류는 사용할 정확한 UID를 알려주므로, 가장 빠른 방법은 앱을 한 번 시작해 메시지를 읽은 뒤 그에 맞춰 `chown`(또는 사용자 조정)하는 것이다.

## 환경 변수 {#environment-variables}

| 변수 | 기본값 | 설명 |
|---|---|---|
| `AUTH_ENABLED` | `true` | 로그인 요구 활성화/비활성화 |
| `DEFAULT_USERNAME` | `admin` | 초기 관리자 사용자 이름 |
| `DEFAULT_PASSWORD` | `admin` | 초기 관리자 비밀번호 (첫 로그인 시 강제 변경) |
| `MAX_UPLOAD_SIZE_MB` | `100` | 파일당 업로드 제한 |
| `MAX_BATCH_SIZE` | `100` | 배치 요청당 최대 파일 수 |
| `RATE_LIMIT_PER_MIN` | `1000` | IP당 분당 API 요청 수 (0으로 설정 시 비활성화) |
| `MAX_USERS` | `0` (무제한) | 최대 사용자 계정 수 |
| `TRUST_PROXY` | `true` | 리버스 프록시의 X-Forwarded-For 헤더 신뢰 |
| `PUID` | `999` | 이 UID로 실행 (바인드 마운트 권한용) |
| `PGID` | `999` | 이 GID로 실행 (바인드 마운트 권한용) |
| `LOG_LEVEL` | `info` | 로그 상세도: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (자동) | 최대 병렬 AI 처리 작업 수 |
| `SESSION_DURATION_HOURS` | `168` | 로그인 세션 수명 (7일) |
| `CORS_ORIGIN` | (비어 있음) | 쉼표로 구분된 허용 오리진, 동일 오리진이면 비워 둠 |

## 헬스 체크 {#health-check}

컨테이너에는 내장 헬스 체크가 포함되어 있다:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## 리버스 프록시 {#reverse-proxy}

SnapOtter는 속도 제한과 로깅이 `X-Forwarded-For` 헤더에서 실제 클라이언트 IP를 사용하도록 기본적으로 `TRUST_PROXY=true`를 설정한다.

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

1. 새 Proxy Host를 추가한다
2. Domain Name을 도메인으로 설정한다
3. Scheme을 `http`로, Forward Hostname을 `SnapOtter`(또는 컨테이너 IP)로, Forward Port를 `1349`로 설정한다
4. WebSocket 지원을 활성화한다
5. Advanced에서 `client_max_body_size 500M;`와 `proxy_buffering off;`을 추가한다

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

`flush_interval -1`는 응답 버퍼링을 비활성화하며, 이는 SSE 진행 이벤트(배치 처리, AI 도구, 기능 설치)에 필요하다. 확장된 타임아웃은 Caddy가 연결을 일찍 닫지 않고 대용량 파일 업로드가 완료되도록 한다.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

참고: Cloudflare는 무료 요금제에서 100 MB 업로드 제한이 있다. 이에 맞춰 `MAX_UPLOAD_SIZE_MB=100`를 설정하라.

## CI/CD {#ci-cd}

GitHub 저장소에는 세 개의 워크플로가 있다:

- **ci.yml** - 모든 푸시와 PR에서 자동으로 실행된다. 린트, 타입 체크, 테스트, 빌드를 수행하고 (푸시 없이) Docker 이미지를 검증한다.
- **release.yml** - `workflow_dispatch`를 통해 수동으로 트리거된다. semantic-release를 실행해 버전 태그와 GitHub 릴리스를 만든 뒤, 멀티 아키텍처 Docker 이미지(amd64 + arm64)를 빌드해 Docker Hub(`snapotter/snapotter`)와 GitHub Container Registry(`ghcr.io/snapotter-hq/snapotter`)에 푸시한다.
- **deploy-docs.yml** - `main`에 푸시할 때 이 문서 사이트를 빌드해 Cloudflare Pages에 배포한다.

릴리스를 만들려면 GitHub UI에서 **Actions > Release > Run workflow**로 이동하거나 다음을 실행하라:

```bash
gh workflow run release.yml
```

semantic-release는 커밋 히스토리에서 버전을 결정한다. `latest` Docker 태그는 항상 가장 최근 릴리스를 가리킨다.

## 애널리틱스 {#analytics}

SnapOtter에는 버그를 잡아내고 기능을 개선하는 데 도움이 되는 익명 제품 애널리틱스(도구 사용 패턴, 오류 보고)가 포함되어 있다. 기본적으로 켜져 있다. 사용자의 파일, 파일 이름, 개인 데이터는 이에 절대 포함되지 않는다. SnapOtter는 애널리틱스를 비활성화해도 정상적으로 작동한다.

### 애널리틱스 비활성화 {#disabling-analytics}

런타임 옵트아웃은 원클릭 관리자 토글이다. Settings > System > Privacy를 열고 Anonymous Product Analytics를 끄면 된다. 리빌드 없이 전체 인스턴스에 대해 즉시 중지된다.

애널리틱스를 절대 내보낼 수 없는 이미지를 원한다면, 저장소를 복제하고 다시 빌드해 빌드 타임 하드 오프를 설정하라:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

또는 기존 `docker-compose.yml`에 빌드 인수를 추가하라:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
