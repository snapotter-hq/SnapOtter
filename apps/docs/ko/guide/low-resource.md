---
i18n_source_hash: f5de74aee1b9
i18n_provenance: machine
i18n_output_hash: 872370570e1a
---
# 저사양 환경 설정 {#low-resource-setups}

SnapOtter는 Raspberry Pi 4나 5, 오래된 노트북, 2 GB VPS 같은 작은 하드웨어에서도 잘 실행된다. 이 페이지는 그런 머신을 위한 실용 가이드다: 무엇을 기대할 수 있는지, 합리적인 상한이 적용된 복사해서 붙여넣는 설정, 그리고 건너뛰어야 할 기능. 이 수치의 근거가 되는 전체 벤치마크 데이터는 [하드웨어 요구 사항](/ko/guide/deployment#hardware-requirements)에 있다.

먼저 두 가지 확실한 제약이 있다:

- **64비트 전용.** 이미지는 `linux/amd64`와 `linux/arm64`용으로 빌드된다. 32비트 ARM(`armv7`/`armhf`)은 지원되지 않으므로 1세대 Pi와 Pi Zero 계열은 사용할 수 없다.
- **메모리 하한선 2 GB.** 512 MB로는 스택이 시작되지 않고, 1 GB는 다중 파일 배치에서 실패한다. 2 GB에 2코어가 무리 없이 동작하는 가장 작은 구성이다.

## 작은 하드웨어에서 잘 실행되는 것 {#what-runs-well}

AI가 아닌 모든 도구는 2 GB / 2코어 머신에서 동작한다: 이미지와 파일 섹션 전체, PDF 도구, 그리고 스트림 복사 방식의 비디오·오디오 작업(트림, 음소거, 컨테이너 리먹스). 대부분 1초 안에 끝난다.

예외는 두 가지 워크로드다:

- **비디오 재인코딩**(코덱 간 변환)은 CPU에 좌우된다. 빠른 데스크톱 CPU에서 약 40초 걸리는 1080p 클립이 Pi급 CPU에서는 몇 분이 걸릴 수 있다. 스트림 복사 작업은 여전히 즉시 끝난다.
- **AI 도구**는 RAM(4 GB 권장)과 디스크(큰 번들은 각각 4-5 GB)가 필요하고, 무거운 도구(업스케일링, 사진 복원, 배경 제거)는 Pi급 CPU에서 실용적이지 않다. 얼굴 감지나 OCR 같은 가벼운 AI는 메모리만 충분하면 쓸 만하다.

둘 다 사용하지 않는 한 설치되거나 실행되지 않는다: AI 번들이 설치되지 않은 상태에서 앱은 약 360 MB로 유휴 상태를 유지하고, AI 번들은 관리자가 활성화할 때만 다운로드된다.

## Raspberry Pi / 오래된 노트북 설치 가이드 {#walkthrough}

[시작하기](/ko/guide/getting-started)의 표준 Compose 설치에 리소스 제한과 보수적인 상한을 더한 구성이다. 64비트 OS를 전제로 한다(Pi에서는 Raspberry Pi OS 64-bit 또는 Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@db:5432/snapotter
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
      - POSTGRES_USER=snapotter
      - POSTGRES_PASSWORD=snapotter
      - POSTGRES_DB=snapotter
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Pi급 머신을 위한 참고 사항:

- **데이터 볼륨과 Postgres에는 SD 카드보다 USB SSD를 사용하라.** 작업 워크스페이스는 실제 디스크 IO를 일으키고, SD 카드는 느린 데다 빨리 마모된다.
- **올인원 단일 컨테이너도 여기서 동작한다**(`DATABASE_URL`/`REDIS_URL`가 설정되지 않으면 임베디드 Postgres와 Redis 사용). 메모리가 부족한 호스트에서는 `REDIS_MAXMEMORY`로 임베디드 Redis 상한을 낮춰야 한다([구성](/ko/guide/configuration) 참고). Compose는 서비스별로 더 세밀한 제어를 제공하며, 이 가이드가 Compose를 사용하는 이유다.
- **2 GB 장치에는 스왑을 추가하라.** 가끔 발생하는 스파이크(큰 PDF, 상한을 걸지 않은 배치)가 메모리 부족으로 인한 강제 종료로 이어지는 것을 막아 준다. zram이 SD 카드에 부담이 적은 선택지다.
- arm64 이미지는 CPU 전용이다. ARM 보드에는 CUDA가 없다.

## 튜닝 옵션 {#tuning-knobs}

모든 상한은 환경 변수이며 [구성](/ko/guide/configuration)에 전부 문서화되어 있다. `0`은 무제한 또는 자동을 의미한다. 작은 하드웨어에서 중요한 항목은 다음과 같다:

| 변수 | 소형 머신 권장값 | 보호 대상 |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | 동시에 실행되는 작업 수. 자동 감지는 CPU 코어 수에서 1을 뺀 값을 사용하는데, 큰 머신에서는 적절하지만 메모리 압박을 받는 2코어 머신에는 과하다. |
| `MAX_WORKER_THREADS` | `2` | 이미지 처리 스레드 풀. |
| `MAX_BATCH_SIZE` | `5` | 1-2 GB 머신이 메모리를 가장 먼저 소진하는 지점이 배치다. |
| `MAX_UPLOAD_SIZE_MB` | `100` | 하나의 거대한 파일이 워크스페이스 전체를 차지하는 것을 막는다. |
| `MAX_MEGAPIXELS` | `50` | 100+ MP 이미지 디코딩은 파일 크기와 무관하게 RAM을 소모한다. |
| `MAX_VIDEO_DURATION_S` | `300` | 긴 트랜스코딩은 작은 CPU를 몇 분에서 몇 시간까지 독점한다. |
| `PROCESSING_TIMEOUT_S` | `600` | 폭주하는 작업이 결국에는 머신을 놓아주게 하는 강제 상한. |

이 상한들은 서버가 받아들이는 것에 적용되므로, 가능한 한 작게가 아니라 실제 사용 방식에 맞게 설정하라. 비디오를 전혀 다루지 않는다면 `MAX_VIDEO_DURATION_S` 상한은 아무 비용이 들지 않고, 매일 문서를 스캔한다면 `MAX_PDF_PAGES`에는 상한을 걸지 마라.

## 건너뛸 것 {#what-to-skip}

- **무거운 AI 번들.** 업스케일링, 사진 복원, 배경 제거는 GPU나 빠른 다중 코어 CPU를 원하고, 번들 하나가 디스크 4-5 GB를 차지한다. 작은 머신에서는 그냥 설치하지 마라. 번들이 없는 도구는 실행되는 대신 설치 안내를 표시한다.
- **일상적인 워크로드로서의 비디오 재인코딩.** 가끔 하는 트랜스코딩은 괜찮다(느릴 뿐이다). 꾸준한 트랜스코딩 큐에는 Pi가 아니라 CPU 코어가 필요하다.
- **사용하지 않는 도구 전반.** 관리자는 Settings에서 개별 도구를 끌 수 있으며, 이렇게 하면 UI에서 사라지고 해당 API 라우트도 등록되지 않는다. 그 자체로 메모리가 절약되지는 않지만, 공유 중인 소형 인스턴스가 하드웨어가 감당하지 못하는 바로 그 워크로드에 쓰이는 것을 막아 준다.

나중에 인스턴스를 더 큰 하드웨어로 옮기면 상한을 제거하고(다시 `0`로 설정) 동일한 데이터 볼륨을 그대로 가져가면 된다.
