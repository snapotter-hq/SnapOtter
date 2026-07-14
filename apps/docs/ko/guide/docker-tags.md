---
description: "SnapOtter Docker 이미지 태그, GPU 벤치마크, 버전 고정, AMD64 및 ARM64 멀티 플랫폼 지원."
i18n_output_hash: 50cb8fc63997
i18n_source_hash: fda322e78b4b
i18n_provenance: human
---

# Docker Image {#docker-image}

SnapOtter는 단일 Docker 이미지로 제공됩니다. 자체적으로 실행하면 루프백 인터페이스에서 임베디드 PostgreSQL 17과 Redis를 시작합니다(임베디드 모드). 프로덕션 환경에서는 Compose로 별도의 PostgreSQL 17 및 Redis 8 컨테이너와 함께 실행하세요. 앱 이미지는 모든 플랫폼에서 동작합니다.

## Quick start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

`DATABASE_URL`를 설정하지 않으면 임베디드 모드로 실행됩니다. PostgreSQL과 Redis가 컨테이너 내부의 루프백에서 시작되며, 모든 데이터는 `SnapOtter-data` 볼륨 아래에 저장됩니다. 외부 서비스를 대신 사용하려면 [Compose](#docker-compose) 스택이 하는 것처럼 `DATABASE_URL`과 `REDIS_URL`을 설정하세요. [Configuration](/ko/guide/configuration#embedded-mode)을 참고하세요.

## NVIDIA CUDA acceleration {#nvidia-cuda-acceleration}

이 이미지는 amd64에서 NVIDIA CUDA를 지원합니다. [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)이 설치된 NVIDIA GPU가 있다면 `--gpus all`를 추가하세요:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

이 이미지는 런타임에 CUDA를 자동으로 감지합니다. `--gpus all`가 없거나 CUDA를 사용할 수 없는 경우, AI 도구는 CPU에서 실행됩니다. 어느 쪽이든 동일한 이미지입니다.

VA-API, Quick Sync 또는 OpenCL을 통한 Intel/AMD iGPU 가속은 현재 SnapOtter AI 추론에서 지원되지 않습니다. `/dev/dri`을 컨테이너에 매핑하면 렌더 장치를 노출할 수 있지만, CUDA를 사용할 수 없는 한 AI 런타임은 여전히 CPU를 사용합니다.

### Benchmarks {#benchmarks}

572x1024 JPEG 인물 사진으로 NVIDIA RTX 4070(12 GB VRAM)에서 테스트했습니다.

#### Warm performance {#warm-performance}

| Tool | CPU | GPU | Speedup |
|------|-----|-----|---------|
| Background removal (u2net) | 2,415ms | 879ms | 2.7x |
| Background removal (isnet) | 2,457ms | 1,137ms | 2.2x |
| Upscale 2x | 350ms | 309ms | 1.1x |
| Upscale 4x | 910ms | 310ms | 2.9x |
| Face blur | 139ms | 122ms | 1.1x |

#### Cold start (first request after container start) {#cold-start-first-request-after-container-start}

| Tool | CPU | GPU | Speedup |
|------|-----|-----|---------|
| Background removal | 22,286ms | 4,792ms | 4.7x |
| Upscale 2x | 3,957ms | 2,318ms | 1.7x |

OCR 에 포함되지 않습니다 CUDA 비교. 둘 다 내장 Tesseract 계층 및 선택 사항 RapidOCR/ONNX 계층 사용 CPU, 컨테이너에 NVIDIA GPU 액세스 권한이 있는 경우도 포함됩니다.

### CUDA health check {#cuda-health-check}

첫 번째 AI 요청 이후, 관리자 상태 확인 엔드포인트가 CUDA GPU 상태를 보고합니다:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

전체 Compose 스택에는 앱, PostgreSQL 17, Redis 8이 포함됩니다. 전체 `docker-compose.yml`는 [Deployment](/ko/guide/deployment)를 참고하세요. 최소 예시는 다음과 같습니다:

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
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

Docker Compose를 통한 NVIDIA CUDA 가속을 위해서는 SnapOtter 서비스에 deploy 섹션을 추가하세요:

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Version pinning {#version-pinning}

| Tag | Description |
|-----|------------|
| `latest` | 최신 릴리스 |
| `1.11.0` | 정확한 버전 |
| `1.11` | 1.11.x의 최신 패치 |
| `1` | 1.x의 최신 마이너 |

## Platforms {#platforms}

| Architecture | GPU support | Notes |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | AI 도구에 대한 완전한 CUDA 가속 |
| linux/arm64 | CPU only | Raspberry Pi 4/5, Docker Desktop을 통한 Apple Silicon |

## Migration from previous tags {#migration-from-previous-tags}

`:cuda` 태그를 사용하고 있었다면, `:latest`로 전환하고 `--gpus all`를 유지하세요. GPU 지원은 동일하며, 통합된 이미지입니다.

데이터와 설정은 볼륨에 보존됩니다.
