---
description: "SnapOtter 보안 강화 가이드. 컨테이너 보안, 네트워크 격리, Docker 시크릿, Kubernetes 배포, 규정 준수 산출물."
i18n_source_hash: 630381c08cde
i18n_provenance: machine
i18n_output_hash: afbb3458e03d
i18n_hash_version: 2
---

# 보안 및 강화 {#security-hardening}

SnapOtter는 파일을 전적으로 사용자의 인프라 안에서 처리합니다. 프로젝트 개선을 돕기 위해 기본적으로 내용이 없는 익명 제품 분석과 충돌 보고서를 전송합니다. 파일, 파일 이름, 파일 내용, OCR 출력, 이미지 메타데이터, 문서 텍스트는 절대 전송하지 않습니다. 선택 사항인 피드백은 사용자가 제출한 뒤에만, 분석이 활성화된 경우에만 전송되며, 연락처 필드는 명시적인 연락 동의가 있을 때만 포함됩니다. 관리자는 설정 > 시스템 > 개인정보 보호에서 한 번의 클릭으로 분석과 피드백 수집을 끌 수 있으며 다시 빌드할 필요가 없습니다. 파일 처리는 항상 컨테이너 안에서만 이루어집니다.

컨테이너는 필요한 최소 권한을 제외한 모든 Linux 권한을 제거한 전용 비루트 사용자(`snapotter`)로 실행됩니다. 전체 취약점 공개 정책과 보안 아키텍처는 GitHub의 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md)를 참고하세요.

## 컨테이너 강화 {#container-hardening}

표준 [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) 및 [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) Compose 파일이 기준입니다. 축약된 예시를 프로덕션에 복사하지 말고, 확인한 릴리스 태그의 파일을 배포하세요.

두 스택 모두 다음 제어를 적용합니다.

- 메모리, 스왑, CPU, PID 제한으로 폭주하는 네이티브 처리를 가둡니다.
- 모든 서비스가 모든 Linux 권한을 제거합니다. 애플리케이션은 볼륨 소유권 설정, 단방향 `gosu` 신원 전환, 정상적인 시그널 전달을 위해 `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL`만 다시 추가합니다. PostgreSQL과 Redis는 공식 엔트리포인트에 필요한 일부만 받습니다.
- `security_opt: [no-new-privileges:true]`는 애플리케이션, PostgreSQL, Redis 컨테이너의 프로세스가 추가 권한을 얻지 못하게 합니다. 이는 `gosu`와 호환됩니다. 엔트리포인트는 root로 시작해 볼륨을 준비한 뒤 전용 `snapotter` 사용자로만 전환합니다.
- PostgreSQL과 Redis 이미지 입력은 다이제스트로 고정됩니다. 애플리케이션도 `latest` 대신 확인된 릴리스 태그나 다이제스트로 고정해야 합니다.
- 상태 확인, 크기가 제한된 JSON 로그 로테이션, 내구성 있는 Redis AOF, 재시작 정책은 표준 파일에 중앙에서 정의되어 있습니다.

인터넷에 노출되는 배포에서는 1349 포트를 루프백에 바인딩하고, 유지 관리되는 리버스 프록시에서 TLS를 종료하세요. PostgreSQL과 Redis 자격 증명은 고유하게 생성하고, 시크릿은 보호된 파일이나 시크릿 관리자에 저장하며, 초기 관리자 비밀번호는 즉시 변경하세요.

### `read_only`를 설정하지 않는 이유 {#why-read-only-is-not-set}

PUID/PGID 재매핑이 시작 시 `/etc/passwd`와 `/etc/group`에 쓰기 때문에 `read_only: true`는 설정되어 있지 않습니다. PUID/PGID 대신 Docker의 `--user` 플래그나 Kubernetes `runAsUser`를 사용한다면 읽기 전용 루트 파일 시스템을 안전하게 활성화할 수 있습니다.

## 네트워크 격리 {#network-isolation}

파일 처리는 로컬에서 이루어지지만, 기본 설치는 **외부 송신이 없는 시스템이 아닙니다**. 텔레메트리가 활성화되어 있으면 익명 제품 분석은 PostHog를, 충돌 보고는 Sentry를 사용합니다. 둘 다 끄려면 `SNAPOTTER_TELEMETRY=0`를 설정하세요(또는 설정 > 시스템 > 개인정보 보호에서 분석을 비활성화). SnapOtter는 업로드된 파일, 파일 이름, OCR 출력, 문서 텍스트 등 파일 내용을 해당 이벤트에 절대 포함하지 않습니다.

그 밖의 외부 송신 트래픽은 기능에 따라 발생합니다. AI 번들/모델 설치는 서명된 릴리스 입력을 다운로드하고, URL 가져오기는 사용자가 요청한 공개 URL을 가져오며, 명시적으로 구성된 OIDC, SAML, OpenTelemetry, 웹훅, S3 호환 스토리지 또는 유사한 연동은 관리자가 선택한 대상에 연결합니다. 런타임 모델 다운로드는 기본적으로 비활성화되어 있습니다. 자동 대체 다운로드를 명시적으로 허용하려는 경우에만 `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1`를 설정하세요. [오프라인 번들 가져오기](/ko/guide/deployment)를 사용하면 런타임 모델 송신 없이 AI 기능을 준비할 수 있습니다.

**방화벽 권장 사항:**

| 시나리오 | 아웃바운드 규칙 |
|---|---|
| 에어 갭 | `SNAPOTTER_TELEMETRY=0`와 `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`를 설정하고, 오프라인 AI 번들 가져오기를 사용하며, URL 가져오기와 외부 연동을 비활성화한 뒤 송신을 차단 |
| 기본 텔레메트리 | 브라우저/네트워크 로그에 표시되는 PostHog 및 Sentry 엔드포인트를 허용. 정책상 허용되지 않으면 텔레메트리를 비활성화 |
| AI 번들 필요 | 설치 중에는 `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`로의 HTTPS를 허용한 뒤 해당 호스트를 차단 |
| 외부 연동 | 관리자가 구성한 OIDC/SAML/OTLP/웹훅/오브젝트 스토리지 대상만 정확히 허용 |

번들 아카이브는 Hugging Face의 Xet 스토리지에서 제공되며, `*.xethub.hf.co` 엔드포인트를 통해 병렬로 전송되므로 수 GB 규모의 번들도 빠르게 다운로드됩니다. 방화벽이 `huggingface.co`는 허용하지만 `*.xethub.hf.co`는 차단하면 설치는 성공하지만 더 느린 단일 스트림 다운로드로 대체되므로, 빠른 경로를 유지하려면 Xet 호스트를 허용 목록에 추가하세요. 완전한 오프라인 설치에서는 이 모든 것을 건너뛰고 대신 [오프라인 번들 가져오기](/ko/guide/deployment)를 사용할 수 있습니다.

리버스 프록시 구성(Nginx, Traefik, Caddy, Cloudflare Tunnels)은 [배포 가이드](/ko/guide/deployment#reverse-proxy)를 참고하세요.

## Docker 시크릿 {#docker-secrets}

프로덕션 배포에서는 시크릿을 일반 텍스트 환경 변수로 전달하지 마세요. 엔트리포인트는 Docker의 `_FILE` 규칙을 지원합니다. 시크릿을 파일로 마운트하고 해당 `_FILE` 변수를 그 경로로 설정하세요.

**지원되는 시크릿:**

| 변수 | `_FILE` 대응 항목 |
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
Docker Compose 시크릿(Swarm 없이)을 사용하려면 Compose v2.23 이상이 필요합니다.
:::

## Kubernetes 배포 {#kubernetes-deployment}

엔트리포인트는 컨테이너가 이미 비루트로 실행 중인 것을 감지하면(예: Kubernetes `runAsUser`를 통해) gosu 권한 전환을 자동으로 건너뜁니다. 이 경우 마운트된 볼륨의 소유권을 직접 변경할 수 없으므로, 쓰기 가능한지 확인하고 그렇지 않으면 실행 가능한 안내와 함께 일찍 종료합니다. `fsGroup`와 외부 UID 구성(TrueNAS, OpenShift)은 [스토리지 권한](/ko/guide/deployment#storage-permissions)을 참고하세요.

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

`runAsUser: 999`가 Pod 수준에서 설정되어 있으므로 엔트리포인트는 gosu를 완전히 건너뜁니다. 이로써 `allowPrivilegeEscalation: false`와 `drop: [ALL]` 권한을 충돌 없이 사용할 수 있습니다.

리소스 규모 산정은 [하드웨어 요구 사항](/ko/guide/deployment#hardware-requirements)을 참고하세요.

## 백업 및 복구 {#backup-and-recovery}

프로덕션 Compose 스택은 볼륨 네 개를 정의합니다. PostgreSQL, Redis, 파일 상태가 같은 시점을 나타내도록, 조율된 백업을 만들기 전에 유입을 중단하고 진행 중인 작업이 끝나기를 기다리세요.

| 볼륨 | 내용 | 복구 방법 |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL 사용자, 설정, 파이프라인, 작업, 파일 메타데이터, 감사 로그 | 매우 중요. 이식 가능한 복구를 위해 즉시 실패하는 논리 덤프를 사용 |
| `SnapOtter-data` | 저장된 라이브러리 객체, 로그, AI 상태(`/data/files, /data/logs, /data/ai, /data/ai/venv`) | 볼륨 전체를 백업. 공간을 절약하려면 모든 AI 상태를 의도적으로 제외하고 번들을 다시 설치 |
| `SnapOtter-redisdata` | 내구성 있는 BullMQ 큐 상태를 위한 Redis AOF | 앱을 일시 중지하고 `SAVE`를 강제한 뒤 백업. 대기 중인 작업을 정확히 재개하려면 필요 |
| `SnapOtter-workspace` | 임시 오브젝트 스토리지 키(`/tmp/workspace/uploads, /tmp/workspace/outputs`) | 모든 작업이 완료되거나 취소된 뒤에는 백업하지 않음. 작업이 활성 상태일 때는 절대 버리지 말 것 |

Compose는 보통 볼륨 이름 앞에 프로젝트 이름을 붙입니다. `SnapOtter-data` 같은 표시 이름이 Docker 볼륨 이름일 것이라고 가정하지 말고, 마운트된 컨테이너에서 실제 원본 볼륨을 확인하세요.

### 데이터베이스 백업 {#database-backup}

PostgreSQL의 사용자 지정 아카이브 형식을 사용하고, 백업이 완료되었다고 판단하기 전에 아카이브를 검증하세요.

```bash
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore only into a fresh/disposable target first; any SQL error fails the command.
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

모든 백업은 격리된 스택에 복원하고, 데이터베이스 레코드와 파일 체크섬을 확인하고, 애플리케이션을 시작해 테스트하세요. 저장소의 `tests/qa/backup-restore-drill.sh`는 명시적인 `QA_IMAGE`에 대해 이 릴리스 게이트를 자동화합니다.

플랫폼이 대신 크래시 일관성 있는 볼륨 스냅샷을 만든다면, 먼저 전체 스택을 중지하고 모든 핵심 볼륨을 하나의 세트로 스냅샷하세요. 실행 중인 컨테이너에서 PostgreSQL 데이터 디렉터리를 그대로 복사하는 것은 지원되는 논리 백업이 아닙니다.

### 파일 및 큐 백업 {#file-and-queue-backup}

파일 및 큐 볼륨을 캡처하기 전에 애플리케이션을 일시 중지하세요. `docker inspect`로 실제 볼륨 이름을 확인하고, Redis가 현재 상태를 강제로 저장하게 한 다음, 소유권과 권한을 보존하여 아카이브하세요.

```bash
docker stop SnapOtter
docker exec SnapOtter-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE
docker stop SnapOtter-redis

DATA_VOLUME="$(docker inspect SnapOtter --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
REDIS_VOLUME="$(docker inspect SnapOtter-redis --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"

install -d -m 700 backup
docker run --rm -v "$DATA_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-data.tar.gz -C /source .
docker run --rm -v "$REDIS_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-redis.tar.gz -C /source .
sha256sum backup/snapotter-*.tar.gz > backup/SHA256SUMS
```

애플리케이션보다 먼저 Redis를 다시 시작하세요. `/data/ai`를 의도적으로 제외한다면, 모델이나 가상 환경 없이 `installed.json` 레코드만 남기지 말고 AI 하위 트리 전체를 제거하세요. 백업 파일은 암호화하고, 접근을 제어하며, SnapOtter를 실행하는 호스트와 분리해서 보관하세요.

## 규정 준수 산출물 {#compliance-artifacts}

SnapOtter 릴리스마다 다음 보안 산출물이 포함됩니다.

| 산출물 | 형식 | 위치 |
|---|---|---|
| 릴리스 주체 바인딩 | 표준 JSON + GitHub 증명 | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 자산: `snapotter-v{version}-release-subjects.json` |
| 아카이브 SBOM | CycloneDX 및 SPDX JSON | 릴리스 자산: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| 이미지 SBOM | CycloneDX 및 SPDX JSON | 릴리스 자산: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| 취약점 스캔 | Trivy JSON | 일치하는 `archive-linux-{arch}` 또는 `image-linux-{arch}` 접두사가 붙은 릴리스 자산 |
| 취약점 스캔 | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 탭 |
| 정적 분석 | CodeQL (JS/TS + Python) | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 탭, 매주 및 PR마다 실행 |
| 의존성 검토 | GitHub 기본 기능 | PR별 검사, 심각도 높은 추가 항목이 있으면 실패 |
| Python 의존성 감사 | pip-audit | 모든 푸시의 CI 실행 로그 |
| 보안 정책 | Markdown | 저장소의 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| 의존성 업데이트 | Dependabot | npm, pip, Docker, Actions용 주간 자동 PR |

**직접 스캔 실행하기:**

릴리스 주체 매니페스트를 다운로드하고 릴리스 워크플로가 증명한 것인지 검증하세요.

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

매니페스트는 `releaseTag`, `releaseCommit`, `workflowTriggerCommit`를 각각 따로 기록합니다. `releaseCommit`가 불변 태그에서 얻은 커밋인지 확인한 다음, 사용하는 아카이브, 이미지, SBOM 또는 스캔의 SHA-256 다이제스트를 `subjects`의 해당 항목과 대조해 검증하세요. 이 구분은 의도된 것입니다. 새로 만든 릴리스 커밋을 체크아웃해도 워크플로의 OIDC 자격 증명에 담긴 커밋 ID는 바뀌지 않기 때문입니다.

다운로드한 SBOM이나 이미지를 직접 스캔할 수도 있습니다.

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
이미지 SBOM과 스캔은 해당 릴리스에 게시된 아키텍처별 이미지를 그대로 반영합니다. 아카이브 SBOM과 스캔은 사전 빌드된 아카이브를 별도로 설명합니다. 배포 후 설치되는 AI 모델 번들은 런타임에 다운로드되므로 이 SBOM에 포함되지 않습니다.
:::
