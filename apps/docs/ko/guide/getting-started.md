---
description: "단 한 번의 명령으로 Docker와 함께 SnapOtter를 설치하세요. Docker Compose 설정, 소스에서 빌드하기, 전체 기능 개요를 포함합니다."
i18n_source_hash: d2366a2e051c
i18n_provenance: human
i18n_output_hash: 583cab7798e3
---

# Getting Started {#getting-started}

::: tip 설치 전에 먼저 사용해 보기
[demo.snapotter.com](https://demo.snapotter.com)에서 전체 UI를 살펴보세요. 회원 가입이나 설치가 필요하지 않습니다.
:::

## Quick Start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

이 단일 컨테이너는 필요한 모든 것을 실행합니다. `DATABASE_URL`를 설정하지 않으면, 자체 PostgreSQL과 Redis를 루프백 인터페이스에서 시작하고(임베디드 모드) 모든 데이터를 `SnapOtter-data` 볼륨에 보관합니다. SnapOtter를 사용해 보거나 홈랩에서 셀프 호스팅하는 가장 빠른 방법입니다. 프로덕션 환경에서는 아래의 [Docker Compose](#docker-compose) 스택을 실행하세요. PostgreSQL과 Redis가 각자의 컨테이너에 유지됩니다. 임베디드 모드는 root로 실행되며(기본값), `DATABASE_URL`을 설정하는 즉시 자동으로 꺼집니다.

첫 로그인 시 비밀번호를 변경하라는 요청을 받게 됩니다.

::: tip 익명 제품 분석
SnapOtter에는 기본적으로 익명 제품 분석이 포함되어 있습니다. 이를 끄려면 **Settings → System → Privacy**를 열고 **Anonymous Product Analytics**를 끄세요. 전체 인스턴스에서 즉시 중단됩니다.

무엇이 수집되는지에 대한 자세한 내용은 [What SnapOtter collects](/ko/guide/telemetry)를 참고하세요.
:::

::: tip NVIDIA CUDA 가속
NVIDIA CUDA로 가속되는 배경 제거, 업스케일, OCR, 얼굴 보정, 복원을 위해 `--gpus all`를 추가하세요:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)이 필요합니다. CUDA를 사용할 수 없는 경우 자동으로 CPU로 대체됩니다. VA-API, Quick Sync 또는 OpenCL을 통한 Intel/AMD iGPU 가속은 현재 AI 추론에서 지원되지 않습니다. 벤치마크는 [Docker Tags](/ko/guide/docker-tags)를 참고하세요.
:::

::: details GHCR에서도 제공
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

두 레지스트리 모두 매 릴리스마다 동일한 이미지를 게시합니다.
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

모든 환경 변수는 [Configuration](/ko/guide/configuration)을 참고하세요.

## Build from Source {#build-from-source}

**사전 요구 사항:** Node.js 22+, pnpm 9+, Docker(Postgres + Redis용), Python 3.10+(AI 기능용), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## What You Can Do {#what-you-can-do}

### File Processing (241 Tools) {#file-processing-241-tools}

| Modality | Count | Example Tools |
|----------|-------|---------------|
| **Image** | 105 | Resize, Crop, Compress, Convert, Remove Background, Upscale, OCR, Watermark, Collage, Colorize, GIF Tools, format presets |
| **Video** | 57 | Trim, Crop, Compress, Convert, Merge, Extract Audio, Auto Subtitles, Video to GIF, Resize, Stabilize, format presets |
| **Audio** | 27 | Trim, Merge, Convert, Normalize, Noise Reduction, Transcribe, Pitch Shift, Fade, Ringtone Maker, format presets |
| **PDF / Document** | 42 | Merge, Split, Compress, OCR, Watermark, Redact, Word to PDF, Excel to PDF, Rotate, Protect, Repair |
| **Files** | 10 | CSV to JSON, JSON to XML, Merge CSVs, Split CSV, Create ZIP, Extract ZIP, Chart Maker, YAML/JSON |

### Pipelines {#pipelines}

여러 도구를 다단계 워크플로로 연결하고, 이를 하나의 이미지 또는 전체 배치에 적용하세요:

1. 사이드바에서 **Pipelines**를 엽니다.
2. 단계를 추가합니다(모든 도구, 모든 설정 가능).
3. 단일 파일 또는 전체 배치에 한 번에 실행합니다.
4. 나중에 다시 사용하도록 파이프라인을 저장합니다.

파이프라인은 기본적으로 20단계를 허용합니다. 제한을 무제한으로 만들려면 `MAX_PIPELINE_STEPS=0`을 설정하세요.

### File Library {#file-library}

처리하는 모든 파일은 **Files** 라이브러리에 저장할 수 있습니다. SnapOtter는 전체 버전 기록을 추적하므로, 원본 업로드부터 최종 출력까지 모든 처리 단계를 추적할 수 있습니다.

저장은 명시적입니다. 라이브러리에 저장한 결과는 삭제할 때까지 보관되지만, 처리한 뒤 저장하지 않은 결과는 72시간 후 자동으로 삭제됩니다(`FILE_MAX_AGE_HOURS`로 설정 가능).

### REST API & API Keys {#rest-api-api-keys}

모든 도구는 HTTP를 통해 접근할 수 있습니다:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

**Settings → API Keys**에서 API 키를 생성하세요. 모든 엔드포인트는 [REST API reference](/ko/api/rest)를 참고하거나, 대화형 참조를 보려면 [http://localhost:1349/api/docs](http://localhost:1349/api/docs)를 방문하세요.

### Multi-User & Teams {#multi-user-teams}

역할 기반 접근 제어로 여러 사용자를 활성화하세요:

- **Admin**: 전체 접근 권한 - 사용자, 팀, 설정, 모든 파일/파이프라인/API 키 관리
- **User**: 도구 사용, 본인의 파일/파이프라인/API 키 관리

사용자를 그룹화하려면 **Settings → Teams**에서 팀을 생성하세요.

`AUTH_ENABLED=true`를 설정하세요(로그인 없이 단일 사용자/개인 사용을 위해서는 `false`).
