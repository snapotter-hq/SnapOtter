---
description: "SnapOtter의 보안 강화 가이드. 컨테이너 보안, 네트워크 격리, Docker 시크릿, Kubernetes 배포, 규정 준수 아티팩트를 다룹니다."
i18n_source_hash: c682d19a84ce
i18n_provenance: human
i18n_output_hash: a45f1cb73dcd
---

# 보안 및 강화 {#security-hardening}

SnapOtter는 파일을 전적으로 여러분의 인프라에서 처리합니다. 프로젝트 개선을 돕기 위해 기본적으로 익명의, 콘텐츠가 포함되지 않은 제품 분석 및 크래시 리포트를 전송합니다. 여러분의 파일, 파일 이름, 파일 내용, OCR 출력, 이미지 메타데이터, 문서 텍스트는 절대 전송하지 않습니다. 선택적 피드백은 사용자가 제출한 후에만, 분석이 활성화된 경우에만 전송되며, 연락처 필드는 명시적인 연락처 동의가 있을 때만 포함됩니다. 관리자는 Settings > System > Privacy에서 한 번의 클릭으로 분석 및 피드백 수집을 끌 수 있으며, 재빌드가 필요하지 않습니다. 파일 처리는 항상 여러분의 컨테이너 내부에 머뭅니다.

컨테이너는 필요한 최소 집합을 제외한 모든 Linux 기능이 제거된 전용 비루트 사용자(`snapotter`)로 실행됩니다. 전체 취약점 공개 정책과 보안 아키텍처는 GitHub의 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md)를 참조하세요.

## 컨테이너 강화 {#container-hardening}

[기본 docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml)에는 프로덕션 보안 강화가 포함되어 있습니다. 각 옵션과 그것이 중요한 이유는 다음과 같습니다:

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

### `no-new-privileges` 를 설정하지 않는 이유 {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` 는 의도적으로 생략됩니다. 엔트리포인트는 볼륨 소유권을 수정하기 위해 root로 시작한 다음, setuid가 필요한 [gosu](https://github.com/tianon/gosu)를 통해 `snapotter` 사용자로 권한을 낮춥니다. 권한 낮춤이 완료되면 프로세스는 위에 나열된 다섯 가지를 제외한 모든 기능이 제거된 `snapotter` 로 실행됩니다.

Kubernetes 또는 Docker의 `--user` 플래그를 사용해 (gosu를 우회하고) 직접 비루트로 실행하는 경우 `no-new-privileges` 를 활성화해도 안전합니다.

### `read_only` 를 설정하지 않는 이유 {#why-read-only-is-not-set}

PUID/PGID 재매핑이 시작 시 `/etc/passwd` 및 `/etc/group` 에 쓰기 때문에 `read_only: true` 는 설정되지 않습니다. PUID/PGID 대신 Docker의 `--user` 플래그 또는 Kubernetes `runAsUser` 를 사용하면 읽기 전용 루트 파일 시스템을 안전하게 활성화할 수 있습니다.

## 네트워크 격리 {#network-isolation}

정상 작동 중에 컨테이너는 **아웃바운드 네트워크 연결을 전혀 하지 않습니다**. 모든 파일 처리는 번들된 라이브러리를 사용해 로컬에서 이루어집니다.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

유일한 예외는 **AI 모델 다운로드**입니다: 사용자가 UI를 통해 AI 기능 번들을 설치하면 컨테이너가 GitHub Releases와 PyPI에서 모델 파일을 다운로드합니다. 이 다운로드는 번들당 한 번 발생하며 `/data` 볼륨에 저장됩니다.

**방화벽 권장 사항:**

| 시나리오 | 아웃바운드 규칙 |
|---|---|
| 에어갭(AI 없음) | 컨테이너의 모든 아웃바운드 트래픽 차단 |
| AI 번들 필요 | 설치 중 `github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org` 로의 HTTPS를 허용한 다음 차단 |
| AI 설치 후 | 모든 아웃바운드 트래픽 차단 - 모델은 로컬에 캐시됩니다 |

리버스 프록시 구성(Nginx, Traefik, Caddy, Cloudflare Tunnels)은 [배포 가이드](/ko/guide/deployment#reverse-proxy)를 참조하세요.

## Docker 시크릿 {#docker-secrets}

프로덕션 배포에서는 시크릿을 평문 환경 변수로 전달하지 마세요. 엔트리포인트는 Docker의 `_FILE` 규칙을 지원합니다: 시크릿을 파일로 마운트하고 해당 `_FILE` 변수를 그 경로로 설정하세요.

**지원되는 시크릿:**

| 변수 | `_FILE` 대응 |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Docker Compose 시크릿 예시:**

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
Docker Compose 시크릿(Swarm 없이)에는 Compose v2.23 이상이 필요합니다.
:::

## Kubernetes 배포 {#kubernetes-deployment}

엔트리포인트는 컨테이너가 이미 비루트로 실행 중인 경우(예: Kubernetes `runAsUser` 를 통해)를 감지하고 gosu 권한 낮춤을 자동으로 건너뜁니다. 이 경우 마운트된 볼륨을 직접 chown할 수 없으므로 볼륨이 쓰기 가능한지 확인하고, 쓰기 불가능하면 실행 가능한 안내와 함께 조기 종료합니다. `fsGroup` 및 외부 UID 설정(TrueNAS, OpenShift)은 [스토리지 권한](/ko/guide/deployment#storage-permissions)을 참조하세요.

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

`runAsUser: 999` 가 파드 수준에서 설정되므로 엔트리포인트는 gosu를 완전히 건너뜁니다. 이를 통해 `allowPrivilegeEscalation: false` 및 `drop: [ALL]` 기능을 충돌 없이 사용할 수 있습니다.

리소스 사이징은 [하드웨어 요구 사항](/ko/guide/deployment#hardware-requirements)을 참조하세요.

## 백업 및 복구 {#backup-and-recovery}

영속 상태는 두 개의 볼륨에 분산됩니다:

| 볼륨 | 내용 | 중요? |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL 데이터베이스(사용자, 설정, 파이프라인, 작업, 감사 로그) | 예 |
| `/data`(앱 볼륨) | 사용자가 업로드한 파일, AI 모델, Python venv | 부분적(아래 참조) |

`/data` 볼륨 내부:

| 경로 | 내용 | 중요? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | 사용자 파일 및 처리 결과 | 예 |
| `/data/ai/` | 다운로드된 AI 모델 파일 | 아니오(재다운로드 가능) |
| `/data/venv/` | Python 가상 환경 | 아니오(시작 시 재빌드) |

### 데이터베이스 백업 {#database-backup}

스택이 실행 중인 동안 데이터베이스를 백업하려면 `pg_dump` 를 사용하세요:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

또는 스택을 중지하고 `SnapOtter-pgdata` 볼륨을 스냅샷으로 만드세요:

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

AI 모델은 모든 번들을 합쳐 최대 약 24 GB에 이릅니다. 재다운로드가 가능하므로 공간 절약을 위해 백업에서 `/data/ai/` 및 `/data/venv/` 를 제외하세요. 데이터베이스와 사용자 파일만이 중요합니다.

## 규정 준수 아티팩트 {#compliance-artifacts}

각 SnapOtter 릴리스에는 다음 보안 아티팩트가 포함됩니다:

| 아티팩트 | 형식 | 찾을 위치 |
|---|---|---|
| SBOM (CycloneDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 에셋: `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 에셋: `snapotter-v{version}-sbom.spdx.json` |
| 취약점 스캔 | Trivy JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 에셋: `snapotter-v{version}-trivy.json` |
| 취약점 스캔 | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 탭 |
| 정적 분석 | CodeQL (JS/TS + Python) | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 탭, 매주 + PR마다 실행 |
| 의존성 검토 | GitHub 네이티브 | PR별 체크, 고위험 추가 시 실패 |
| Python 의존성 감사 | pip-audit | 모든 푸시의 CI 실행 로그 |
| 보안 정책 | Markdown | 저장소의 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| 의존성 업데이트 | Dependabot | npm, pip, Docker, Actions에 대한 자동 주간 PR |

**자체 스캔 실행:**

릴리스에서 SBOM을 다운로드하고 선호하는 도구로 스캔하세요:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM과 취약점 스캔은 해당 릴리스에 게시된 정확한 이미지를 반영합니다. 배포 후 설치된 AI 모델 번들은 런타임에 다운로드되므로 SBOM에 포함되지 않습니다.
:::
