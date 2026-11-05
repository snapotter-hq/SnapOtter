---
i18n_source_hash: b859c4f3b301
i18n_provenance: machine
i18n_output_hash: 845478399df6
i18n_hash_version: 2
---
# 저사양 환경 구성 {#low-resource-setups}

SnapOtter는 Raspberry Pi 4 또는 5, 오래된 노트북, 2 GB VPS 같은 작은 하드웨어에서도 잘 동작합니다. 이 페이지는 그런 장비를 위한 실용 가이드로, 기대할 수 있는 성능, 적절한 상한을 적용한 복사해서 쓸 수 있는 설정, 건너뛰어야 할 기능을 다룹니다. 이 수치의 바탕이 된 전체 벤치마크 데이터는 [하드웨어 요구 사항](/ko/guide/deployment#hardware-requirements)에 있습니다.

먼저 두 가지 확실한 제약이 있습니다.

- **64비트 전용.** 이미지는 `linux/amd64`와 `linux/arm64`용으로 빌드됩니다. 32비트 ARM(`armv7`/`armhf`)은 지원되지 않으므로 1세대 Pi와 Pi Zero 계열은 사용할 수 없습니다.
- **2 GB 메모리 하한 (AI가 아닌 도구).** 512 MB로는 스택을 시작할 수 없고, 1 GB는 여러 파일 배치에서 실패합니다. 2 GB와 2코어가 AI가 아닌 도구를 무리 없이 실행할 수 있는 가장 작은 구성입니다.

## 작은 하드웨어에서 잘 동작하는 것 {#what-runs-well}

AI가 아닌 모든 도구는 2 GB / 2코어 장비에서 동작합니다. 이미지 및 파일 섹션 전체, PDF 도구, 스트림 복사 방식의 비디오 및 오디오 작업(자르기, 음소거, 컨테이너 리먹스)이 여기에 해당합니다. 대부분 1초 안에 끝납니다.

예외인 작업은 두 가지입니다.

- **비디오 재인코딩**(코덱 간 변환)은 CPU 부하가 큽니다. 빠른 데스크톱 CPU에서 약 40초 걸리는 1080p 클립이 Pi급 CPU에서는 몇 분 걸릴 수 있습니다. 스트림 복사 작업은 여전히 즉시 끝납니다.
- **AI 도구**에는 번들별 CPU 메모리 하한이 있습니다. 얼굴 감지와 내장 Fast OCR은 호스트 RAM 2 GB(여유 0.5 GB), Accurate OCR은 구성된 유효 메모리 4 GiB, 받아쓰기, 객체 지우개 및 컬러화, 배경 제거, 업스케일 및 보정, 사진 복원은 호스트 RAM 4 GB(여유 2~3 GB), 고품질 인페인팅은 호스트 RAM 8 GB(여유 6 GB)가 필요합니다. 2 GB 장비에서는 Whisper, RealESRGAN, rembg, LaMa를 실행하면 OOM으로 종료되므로, SnapOtter는 Python 사이드카로 작업을 보내기 전에 여유 메모리를 확인하고 번들 하한에 못 미치면 즉시 실행을 거부합니다.

두 가지 모두 사용하지 않으면 설치되거나 실행되지 않습니다. AI 번들이 없으면 앱은 약 360 MB 정도만 사용하며, AI 번들은 관리자가 활성화할 때만 다운로드됩니다.

## Raspberry Pi / 오래된 노트북 안내 {#walkthrough}

[시작하기](/ko/guide/getting-started)의 표준 Compose 설치에 리소스 제한과 보수적인 상한을 더한 구성입니다. 64비트 OS를 전제로 합니다(Pi에서는 Raspberry Pi OS 64-bit 또는 Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@db:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@db:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-snapotter}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      - POSTGRES_DB=${POSTGRES_DB:-snapotter}
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Pi급 장비를 위한 참고 사항입니다.

- 데이터 볼륨과 Postgres에는 **SD 카드보다 USB SSD를 권장합니다.** 작업 공간은 실제 디스크 IO를 많이 쓰며, SD 카드는 느리고 금방 마모됩니다.
- **올인원 단일 컨테이너도 여기서 동작합니다**(`DATABASE_URL`/`REDIS_URL`를 설정하지 않으면 내장 Postgres와 Redis 사용). 메모리가 제한된 호스트에서는 `REDIS_MAXMEMORY`로 내장 Redis 상한을 낮추세요([구성](/ko/guide/configuration) 참고). Compose는 서비스별로 더 세밀하게 제어할 수 있어서 이 안내에서는 Compose를 사용합니다.
- **2 GB 장비에는 스왑을 추가하세요.** 가끔 발생하는 급증(큰 PDF, 상한을 두지 않은 배치)이 메모리 부족으로 인한 종료로 이어지는 것을 막아 줍니다. SD 카드 환경에서는 zram이 적합합니다.
- arm64 이미지는 CPU 전용이며, ARM 보드에서는 CUDA를 사용할 수 없습니다.

## 튜닝 항목 {#tuning-knobs}

모든 상한은 환경 변수이며, 자세한 내용은 [구성](/ko/guide/configuration)에 있습니다. `0`는 무제한 또는 자동을 의미합니다. 작은 하드웨어에서 중요한 항목은 다음과 같습니다.

| 변수 | 작은 장비 권장값 | 보호하는 대상 |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | 병렬로 실행되는 작업 수. 자동 감지는 CPU 코어 수에서 1을 뺀 값을 사용하는데, 큰 장비에서는 괜찮지만 메모리 압박을 받는 2코어 장비에서는 너무 공격적입니다. |
| `MAX_WORKER_THREADS` | `2` | 이미지 처리 스레드 풀. |
| `MAX_BATCH_SIZE` | `5` | 1~2 GB 장비에서 가장 먼저 메모리가 부족해지는 곳이 배치입니다. |
| `MAX_UPLOAD_SIZE_MB` | `100` | 거대한 파일 하나가 작업 공간 전체를 차지하는 것을 막습니다. |
| `MAX_MEGAPIXELS` | `50` | 100 MP 이상 이미지를 디코딩하면 파일 크기와 관계없이 RAM을 소모합니다. |
| `MAX_VIDEO_DURATION_S` | `300` | 긴 트랜스코딩은 작은 CPU를 몇 분에서 몇 시간 동안 독점합니다. |
| `PROCESSING_TIMEOUT_S` | `600` | 폭주한 작업이 결국 장비를 놓아 주도록 하는 하드 상한. |

이 상한은 서버가 받아들이는 항목에 적용되므로, 가능한 한 작게 잡기보다 실제로 사용하는 항목에 맞춰 설정하세요. 비디오를 전혀 쓰지 않는다면 `MAX_VIDEO_DURATION_S` 상한은 손해가 없습니다. 문서를 매일 스캔한다면 `MAX_PDF_PAGES`은 제한하지 마세요.

## 건너뛸 것 {#what-to-skip}

- **무거운 AI 번들.** 업스케일, 사진 복원, 배경 제거에는 GPU 또는 빠른 다중 코어 CPU가 필요하며, 번들마다 디스크 4~5 GB를 차지합니다. 작은 장비에서는 설치하지 않는 것이 좋습니다. 번들이 없는 도구는 실행되는 대신 설치 안내가 표시됩니다.
- **일상적인 작업으로서의 비디오 재인코딩.** 가끔 트랜스코딩하는 것은 괜찮지만(단지 느릴 뿐입니다), 꾸준한 트랜스코딩 대기열에는 Pi가 아니라 CPU 코어가 필요합니다.
- **사용하지 않는 도구 전반.** 관리자는 설정에서 개별 도구를 끌 수 있으며, 그러면 UI에서 사라지고 API 라우트도 등록되지 않습니다. 그것만으로 메모리가 절약되지는 않지만, 공유 중인 작은 인스턴스가 하드웨어가 감당할 수 없는 작업에 쓰이는 것을 막아 줍니다.

나중에 인스턴스를 더 큰 하드웨어로 옮기면 상한을 제거하고(`0`로 되돌리세요) 같은 데이터 볼륨을 그대로 사용할 수 있습니다.
