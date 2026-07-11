---
description: "SnapOtter 보안 강화 가이드. 컨테이너 보안, 네트워크 격리, Docker 시크릿, Kubernetes 배포, 컴플라이언스 산출물."
i18n_source_hash: 986f7658430c
i18n_provenance: machine
i18n_output_hash: 6386fbda69b4
---

# 보안 및 강화 {#security-hardening}

SnapOtter는 파일을 전적으로 사용자의 인프라에서 처리한다. 프로젝트 개선에 도움이 되도록 익명의, 콘텐츠 없는 제품 애널리틱스와 크래시 리포트를 기본으로 전송한다. 사용자의 파일, 파일 이름, 파일 내용, OCR 출력, 이미지 메타데이터, 문서 텍스트는 절대 전송하지 않는다. 선택적 피드백은 사용자가 제출한 뒤에만, 애널리틱스가 활성화된 경우에만 전송되며, 연락처 필드는 명시적 연락 동의가 있을 때만 포함된다. 관리자는 Settings > System > Privacy에서 리빌드 없이 원클릭으로 애널리틱스와 피드백 수집을 끌 수 있다. 파일 처리는 항상 컨테이너 안에 머문다.

컨테이너는 최소 필수 집합을 제외한 모든 Linux 기능(capability)을 제거한 전용 비root 사용자(`snapotter`)로 실행된다. 전체 취약점 공개 정책과 보안 아키텍처는 GitHub의 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md)를 참고하라.

## 컨테이너 강화 {#container-hardening}

[기본 docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml)에는 프로덕션 보안 강화가 포함되어 있다. 각 옵션과 그것이 중요한 이유를 정리하면 다음과 같다:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      # Bind to localhost only for internet-facing deployments:
      - "127.0.0.1:1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_PASSWORD=change-me-immediately
      - RATE_LIMIT_PER_MIN=1000
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

    # --- Resource limits ---
    mem_limit: 6g            # Prevents runaway memory from crashing the host
    memswap_limit: 6g        # No swap - fail fast instead of degrading the host
    cpus: 4                  # Cap CPU usage to 4 cores
    pids_limit: 512          # Prevents fork bombs

    # --- Capability restrictions ---
    cap_drop:
      - ALL                  # Drop ALL Linux capabilities first
    cap_add:
      - CHOWN                # Needed for volume permission setup
      - SETUID               # Needed for gosu privilege drop (root -> snapotter)
      - SETGID               # Needed for gosu privilege drop
      - DAC_OVERRIDE         # Needed for volume permission setup
      - FOWNER               # Needed for volume permission setup

    # --- Logging ---
    logging:
      driver: json-file
      options:
        max-size: "50m"      # Rotate logs at 50 MB
        max-file: "5"        # Keep 5 rotated log files

    # --- Health check ---
    healthcheck:
      test: ["CMD", "curl", "-sf", "--max-time", "5", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3

    shm_size: "2gb"          # Required for Python ML shared memory
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
      start_period: 15s

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
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

### `no-new-privileges`를 설정하지 않는 이유 {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]`은 의도적으로 생략된다. 엔트리포인트는 볼륨 소유권을 수정하기 위해 root로 시작한 뒤, setuid가 필요한 [gosu](https://github.com/tianon/gosu)를 통해 `snapotter` 사용자로 강등한다. 권한 강등이 완료되면 프로세스는 위에 나열된 다섯 개를 제외한 모든 기능이 제거된 상태로 `snapotter`로 실행된다.

Kubernetes 또는 Docker의 `--user` 플래그를 사용해 비root로 직접 실행한다면(gosu를 우회), `no-new-privileges`를 활성화해도 안전하다.

### `read_only`를 설정하지 않는 이유 {#why-read-only-is-not-set}

`read_only: true`이 설정되지 않은 것은 PUID/PGID 리매핑이 시작 시 `/etc/passwd`과 `/etc/group`에 쓰기 때문이다. PUID/PGID 대신 Docker의 `--user` 플래그나 Kubernetes `runAsUser`을 사용한다면 읽기 전용 루트 파일 시스템을 안전하게 활성화할 수 있다.

## 네트워크 격리 {#network-isolation}

정상 작동 중에는 컨테이너가 **아웃바운드 네트워크 연결을 전혀 하지 않는다**. 모든 파일 처리는 번들된 라이브러리를 사용해 로컬에서 이루어진다.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

유일한 예외는 **AI 모델 다운로드**다. 사용자가 UI를 통해 AI 기능 번들을 설치하면, 컨테이너는 사전 빌드된 번들 아카이브를 Hugging Face에서, 그리고 몇몇 개별 모델 파일을 GitHub Releases, Google Storage, PyPI에서 다운로드한다. 이 다운로드는 번들당 한 번 발생하며 `/data` 볼륨에 저장된다.

**방화벽 권장 사항:**

| 시나리오 | 아웃바운드 규칙 |
|---|---|
| 에어갭 (AI 없음) | 컨테이너의 모든 아웃바운드 트래픽 차단 |
| AI 번들 필요 | 설치 중 `huggingface.co`, `*.xethub.hf.co`, `cdn-lfs.huggingface.co`, `github.com`, `objects.githubusercontent.com`, `storage.googleapis.com`, `pypi.org`, `files.pythonhosted.org`에 대한 HTTPS를 허용한 뒤 차단 |
| AI 설치 후 | 모든 아웃바운드 트래픽 차단 - 모델이 로컬에 캐시됨 |

번들 아카이브는 Hugging Face의 Xet 스토리지에서 제공되며, 이는 `*.xethub.hf.co` 엔드포인트를 통해 병렬로 전송되어 수 GB 번들 다운로드를 빠르게 만든다. 방화벽이 `huggingface.co`을 허용하지만 `*.xethub.hf.co`를 차단하면, 설치는 여전히 성공하지만 더 느린 단일 스트림 다운로드로 폴백하므로, 빠른 경로를 유지하려면 Xet 호스트를 허용 목록에 추가하라. 완전 오프라인 설치는 이 모든 것을 건너뛰고 대신 [오프라인 번들 임포트](/ko/guide/deployment)를 사용할 수 있다.

리버스 프록시 구성(Nginx, Traefik, Caddy, Cloudflare Tunnels)은 [배포 가이드](/ko/guide/deployment#reverse-proxy)를 참고하라.

## Docker 시크릿 {#docker-secrets}

프로덕션 배포에서는 시크릿을 평문 환경 변수로 전달하지 마라. 엔트리포인트는 Docker의 `_FILE` 규약을 지원한다. 시크릿을 파일로 마운트하고 대응하는 `_FILE` 변수를 그 경로로 설정하면 된다.

**지원되는 시크릿:**

| 변수 | `_FILE` 등가물 |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Docker Compose 시크릿 예제:**

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD_FILE=/run/secrets/snapotter_password
      - COOKIE_SECRET_FILE=/run/secrets/cookie_secret
    secrets:
      - snapotter_password
      - cookie_secret

secrets:
  snapotter_password:
    file: ./secrets/snapotter_password.txt
  cookie_secret:
    file: ./secrets/cookie_secret.txt
```

::: tip 
Docker Compose 시크릿(Swarm 없이)에는 Compose v2.23 이상이 필요하다.
:::

## Kubernetes 배포 {#kubernetes-deployment}

엔트리포인트는 컨테이너가 이미 비root로 실행 중인 경우(예: Kubernetes `runAsUser`을 통해)를 감지해 gosu 권한 강등을 자동으로 건너뛴다. 그 경우 볼륨을 스스로 chown할 수 없으므로, 쓰기 가능 여부를 확인하고 그렇지 않으면 실행 가능한 안내와 함께 조기에 종료한다. `fsGroup` 및 외부 UID 설정(TrueNAS, OpenShift)은 [스토리지 권한](/ko/guide/deployment#storage-permissions)을 참고하라.

**권장 Pod SecurityContext:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: snapotter
spec:
  replicas: 1
  selector:
    matchLabels:
      app: snapotter
  template:
    metadata:
      labels:
        app: snapotter
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        runAsGroup: 999
        fsGroup: 999
      containers:
        - name: snapotter
          image: snapotter/snapotter:latest
          ports:
            - containerPort: 1349
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
          resources:
            requests:
              cpu: "1"
              memory: 2Gi
            limits:
              cpu: "4"
              memory: 6Gi
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 60
            periodSeconds: 30
            timeoutSeconds: 5
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
          volumeMounts:
            - name: data
              mountPath: /data
            - name: workspace
              mountPath: /tmp/workspace
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: snapotter-data
        - name: workspace
          emptyDir:
            medium: Memory
            sizeLimit: 2Gi
```

`runAsUser: 999`이 파드 수준에서 설정되므로 엔트리포인트는 gosu를 완전히 건너뛴다. 이로써 `allowPrivilegeEscalation: false`과 `drop: [ALL]` 기능을 충돌 없이 사용할 수 있다.

리소스 산정은 [하드웨어 요구 사항](/ko/guide/deployment#hardware-requirements)을 참고하라.

## 백업 및 복구 {#backup-and-recovery}

영속 상태는 두 볼륨에 나뉘어 있다:

| 볼륨 | 내용 | 필수 여부? |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL 데이터베이스 (사용자, 설정, 파이프라인, 작업, 감사 로그) | 예 |
| `/data` (app 볼륨) | 사용자가 업로드한 파일, AI 모델, Python venv | 부분적 (아래 참고) |

`/data` 볼륨 내부:

| 경로 | 내용 | 필수 여부? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | 사용자 파일 및 처리 결과 | 예 |
| `/data/ai/` | 다운로드된 AI 모델 파일 | 아니요 (재다운로드 가능) |
| `/data/venv/` | Python 가상 환경 | 아니요 (시작 시 재빌드됨) |

### 데이터베이스 백업 {#database-backup}

스택이 실행되는 동안 데이터베이스를 백업하려면 `pg_dump`을 사용하라:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

또는 스택을 중지하고 `SnapOtter-pgdata` 볼륨을 스냅샷하라:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### 사용자 파일 백업 {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

AI 모델은 모든 번들을 합쳐 최대 약 24 GB에 이른다. 재다운로드가 가능하므로, 공간을 절약하려면 백업에서 `/data/ai/`와 `/data/venv/`을 제외하라. 데이터베이스와 사용자 파일만 필수적이다.

## 컴플라이언스 산출물 {#compliance-artifacts}

각 SnapOtter 릴리스에는 다음 보안 산출물이 포함된다:

| 산출물 | 형식 | 찾을 수 있는 곳 |
|---|---|---|
| SBOM (CycloneDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 자산: `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 자산: `snapotter-v{version}-sbom.spdx.json` |
| 취약점 스캔 | Trivy JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 자산: `snapotter-v{version}-trivy.json` |
| 취약점 스캔 | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 탭 |
| 정적 분석 | CodeQL (JS/TS + Python) | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 탭, 매주 + PR마다 실행 |
| 의존성 리뷰 | GitHub 네이티브 | PR별 검사, 고위험 추가 시 실패 |
| Python 의존성 감사 | pip-audit | 모든 푸시의 CI 실행 로그 |
| 보안 정책 | Markdown | 저장소의 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| 의존성 업데이트 | Dependabot | npm, pip, Docker, Actions에 대한 자동 주간 PR |

**직접 스캔 실행하기:**

릴리스에서 SBOM을 다운로드하고 원하는 도구로 스캔하라:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM과 취약점 스캔은 해당 릴리스로 게시된 정확한 이미지를 반영한다. 배포 후 설치되는 AI 모델 번들은 런타임에 다운로드되므로 SBOM에 포함되지 않는다.
:::
