---
description: "SnapOtter Docker 이미지 태그, GPU 벤치마크, 버전 고정, AMD64 및 ARM64 멀티 플랫폼 지원."
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: c9ab590c3dfa
i18n_hash_version: 2
---

# Docker 이미지 {#docker-image}

SnapOtter는 단일 Docker 이미지로 제공됩니다. 단독으로 실행하면 루프백 인터페이스에서 내장 PostgreSQL 17과 Redis가 시작됩니다(내장 모드). 프로덕션에서는 Compose로 별도의 PostgreSQL 17 및 Redis 8 컨테이너와 함께 실행하세요. 앱 이미지는 모든 플랫폼에서 동작합니다.

## 빠른 시작 {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

`DATABASE_URL`를 설정하지 않으면 내장 모드로 실행됩니다. PostgreSQL과 Redis가 컨테이너 안에서 루프백으로 시작되고, 모든 데이터는 `SnapOtter-data` 볼륨에 저장됩니다. 외부 서비스를 사용하려면 [Compose](#docker-compose) 스택처럼 `DATABASE_URL`와 `REDIS_URL`를 설정하세요. [구성](/ko/guide/configuration#embedded-mode)을 참고하세요.

## NVIDIA CUDA 가속 {#nvidia-cuda-acceleration}

이 이미지는 amd64에서 NVIDIA CUDA를 지원합니다. [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)이 설치된 NVIDIA GPU가 있다면 `--gpus all`를 추가하세요.

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

이미지는 런타임에 CUDA를 자동으로 감지합니다. `--gpus all`가 없거나 CUDA를 사용할 수 없으면 AI 도구는 CPU에서 실행됩니다. 어느 경우든 같은 이미지를 사용합니다.

VA-API, Quick Sync, OpenCL을 통한 Intel/AMD iGPU 가속은 현재 SnapOtter AI 추론에서 지원되지 않습니다. `/dev/dri`를 컨테이너에 매핑하면 렌더 장치가 노출될 수 있지만, CUDA를 사용할 수 없으면 AI 런타임은 계속 CPU를 사용합니다.

### 벤치마크 {#benchmarks}

NVIDIA RTX 4070(12 GB VRAM)에서 572x1024 JPEG 인물 사진으로 테스트했습니다.

#### 워밍업 후 성능 {#warm-performance}

| 도구 | CPU | GPU | 속도 향상 |
|------|-----|-----|---------|
| 배경 제거 (u2net) | 2,415ms | 879ms | 2.7x |
| 배경 제거 (isnet) | 2,457ms | 1,137ms | 2.2x |
| 2x 업스케일 | 350ms | 309ms | 1.1x |
| 4x 업스케일 | 910ms | 310ms | 2.9x |
| 얼굴 블러 | 139ms | 122ms | 1.1x |

#### 콜드 스타트 (컨테이너 시작 후 첫 요청) {#cold-start-first-request-after-container-start}

| 도구 | CPU | GPU | 속도 향상 |
|------|-----|-----|---------|
| 배경 제거 | 22,286ms | 4,792ms | 4.7x |
| 2x 업스케일 | 3,957ms | 2,318ms | 1.7x |

OCR은 CUDA 비교에 포함되지 않습니다. 내장 Tesseract 티어와 선택 사항인 RapidOCR/ONNX 티어는 컨테이너에 NVIDIA GPU 접근 권한이 있어도 모두 CPU를 사용합니다.

### CUDA 상태 확인 {#cuda-health-check}

첫 AI 요청 이후에는 관리자 상태 확인 엔드포인트가 CUDA GPU 상태를 보고합니다.

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

전체 Compose 스택에는 앱, PostgreSQL 17, Redis 8이 포함됩니다. 전체 `docker-compose.yml`는 [배포](/ko/guide/deployment)를 참고하세요. 최소 예시는 다음과 같습니다.

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
      # Runtime role (rows only), then the boot-only owner connection.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    environment:
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

Docker Compose로 NVIDIA CUDA 가속을 사용하려면 SnapOtter 서비스에 deploy 섹션을 추가하세요.

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## 버전 고정 {#version-pinning}

| 태그 | 설명 |
|-----|------------|
| `latest` | 최신 릴리스 |
| `2.2.0` | 정확한 버전 |
| `2.2` | 2.2.x의 최신 패치 |
| `2` | 2.x의 최신 마이너 |

## 플랫폼 {#platforms}

| 아키텍처 | GPU 지원 | 참고 |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | AI 도구에 대한 전체 CUDA 가속 |
| linux/arm64 | CPU 전용 | Raspberry Pi 4/5, Docker Desktop을 통한 Apple Silicon |

## 이전 태그에서 마이그레이션 {#migration-from-previous-tags}

`:cuda` 태그를 사용하고 있었다면 `:latest`로 바꾸고 `--gpus all`는 그대로 유지하세요. GPU 지원은 같으며 이미지가 하나로 통합되었습니다.

데이터와 설정은 볼륨에 그대로 보존됩니다.
