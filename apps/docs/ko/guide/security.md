---
description: "SnapOtter 보안 강화 가이드. 컨테이너 보안, 네트워크 격리, Docker 시크릿, Kubernetes 배포, 컴플라이언스 산출물."
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: e582b375b53e
i18n_hash_version: 2
---

# 보안 및 강화 {#security-hardening}

SnapOtter는 파일을 전적으로 사용자의 인프라에서 처리한다. 프로젝트 개선에 도움이 되도록 익명의, 콘텐츠 없는 제품 애널리틱스와 크래시 리포트를 기본으로 전송한다. 사용자의 파일, 파일 이름, 파일 내용, OCR 출력, 이미지 메타데이터, 문서 텍스트는 절대 전송하지 않는다. 선택적 피드백은 사용자가 제출한 뒤에만, 애널리틱스가 활성화된 경우에만 전송되며, 연락처 필드는 명시적 연락 동의가 있을 때만 포함된다. 관리자는 Settings > System > Privacy에서 리빌드 없이 원클릭으로 애널리틱스와 피드백 수집을 끌 수 있다. 파일 처리는 항상 컨테이너 안에 머문다.

컨테이너는 최소 필수 집합을 제외한 모든 Linux 기능(capability)을 제거한 전용 비root 사용자(`snapotter`)로 실행된다. 전체 취약점 공개 정책과 보안 아키텍처는 GitHub의 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md)를 참고하라.

## 컨테이너 경화 {#container-hardening}

표준 [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) 및 [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) Compose 파일이 정보의 소스입니다. 축약된 예제를 프로덕션에 복사하지 마십시오. 확인한 릴리스 태그에서 파일을 배포합니다.

두 스택 모두 다음 컨트롤을 적용합니다.

- 메모리, 스왑, CPU 및 PID 제한에는 런어웨이 기본 처리가 포함됩니다.
- 모든 서비스는 모든 Linux 기능을 삭제합니다. 애플리케이션은 볼륨 소유권, 단방향 `gosu` ID 삭제 및 정상적인 신호 전달을 위해 `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL`만 다시 추가합니다. PostgreSQL 및 Redis는 공식 진입점에 필요한 하위 집합만 받습니다.
- `security_opt: [no-new-privileges:true]`는 애플리케이션, PostgreSQL 및 Redis 컨테이너의 프로세스가 추가 권한을 얻지 못하도록 방지합니다. 이는 `gosu`와의 호환성을 유지합니다. 진입점은 루트로 시작하고 볼륨을 준비하며 전용 `snapotter` 사용자에게만 전달됩니다.
- PostgreSQL 및 Redis 이미지 입력은 다이제스트에 의해 고정됩니다. 마찬가지로 애플리케이션은 `latest`가 아닌 확인된 릴리스 태그 또는 다이제스트에 고정되어야 합니다.
- 상태 확인, 제한된 JSON 로그 회전, 내구성 있는 Redis AOF 및 다시 시작 정책이 정식 파일에 중앙에서 정의됩니다.

인터넷 연결 배포의 경우 포트 1349를 루프백에 바인딩하고 유지 관리되는 역방향 프록시에서 TLS를 종료합니다. 고유한 PostgreSQL 및 Redis 자격 증명을 생성하고, 보호된 파일이나 비밀 관리자에 비밀을 저장하고, 초기 관리자 비밀번호를 즉시 변경하세요.

### `read_only`가 {#why-read-only-is-not-set}로 설정되지 않은 이유

PUID/PGID 재매핑은 시작 시 `/etc/passwd` 및 `/etc/group`에 쓰기 때문에 `read_only: true`가 설정되지 않았습니다. PUID/PGID 대신 Docker의 `--user` 플래그 또는 Kubernetes `runAsUser`를 사용하는 경우 읽기 전용 루트 파일 시스템을 안전하게 활성화할 수 있습니다.

## 네트워크 격리 {#network-isolation}

파일 처리는 로컬이지만 기본 설치는 **송신 방지 시스템이 아닙니다**. 원격 측정이 활성화된 경우 익명 제품 분석은 PostHog를 사용하고 충돌 보고는 Sentry를 사용합니다. `SNAPOTTER_TELEMETRY=0`를 설정하거나 설정 > 시스템 > 개인 정보 보호에서 분석을 비활성화하여 둘 다 끄십시오. SnapOtter에는 해당 이벤트에 업로드된 파일, 파일 이름, OCR 출력, 문서 텍스트 또는 기타 파일 콘텐츠가 포함되지 않습니다.

기타 아웃바운드 트래픽은 기능 중심입니다. AI 번들/모델 설치는 서명된 릴리스 입력을 다운로드합니다. URL 가져오기는 사용자가 요청한 공개 URL을 가져옵니다. 명시적으로 구성된 OIDC, SAML, OpenTelemetry, 웹훅, S3 호환 스토리지 또는 유사한 통합은 관리자가 선택한 대상에 연결됩니다. 런타임 모델 다운로드는 기본적으로 비활성화되어 있습니다. 자동 대체 다운로드를 명시적으로 사용하려는 경우에만 `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1`을 설정하세요. [오프라인 번들 가져오기](/ko/guide/deployment)는 런타임 모델 송신 없이 AI 기능을 프로비저닝할 수 있습니다.

**방화벽 권장사항:**

|대본|아웃바운드 규칙|
|---|---|
|에어 갭|`SNAPOTTER_TELEMETRY=0` 및 `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0` 설정, 오프라인 AI 번들 가져오기 사용, URL 가져오기 및 외부 통합 비활성화, 송신 차단|
|기본 원격 측정|브라우저/네트워크 로그에 나열된 PostHog 및 Sentry 엔드포인트를 허용하십시오. 정책에서 허용하지 않는 경우 원격 측정을 비활성화합니다.|
|AI 번들이 필요함|설치 중에 HTTPS를 `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`로 허용하십시오. 그런 다음 해당 호스트를 차단하세요.|
|외부 통합|관리자가 구성한 정확한 OIDC/SAML/OTLP/webhook/객체 저장소 대상만 허용|

번들 아카이브는 `*.xethub.hf.co` 엔드포인트를 통해 병렬로 전송되고 다중 GB 번들 다운로드를 빠르게 만드는 Hugging Face의 Xet 스토리지에서 제공됩니다. 방화벽이 `huggingface.co`를 허용하지만 `*.xethub.hf.co`를 차단하는 경우 설치는 성공하지만 느린 단일 스트림 다운로드로 돌아가므로 Xet 호스트가 빠른 경로를 유지하도록 허용 목록에 추가하세요. 완전 오프라인 설치에서는 이 모든 과정을 건너뛰고 대신 [오프라인 번들 가져오기](/ko/guide/deployment)를 사용할 수 있습니다.

역방향 프록시 구성(Nginx, Traefik, Caddy, Cloudflare Tunnels)은 [배포 가이드](/ko/guide/deployment#reverse-proxy)를 참조하세요.

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

프로덕션 Compose 스택은 4개의 볼륨을 정의합니다. PostgreSQL, Redis 및 파일 상태가 동일한 시점을 설명하도록 조정된 백업을 수행하기 전에 수신을 중지하고 활성 작업이 완료되도록 하세요.

|용량|내용물|회복치료|
|---|---|---|
|`SnapOtter-pgdata`|PostgreSQL 사용자, 설정, 파이프라인, 작업, 파일 메타데이터 및 감사 로그|비판적인; 휴대용 복구를 위해 빠른 실패 논리 덤프 사용|
|`SnapOtter-data`|저장된 라이브러리 개체, 로그 및 AI 상태(`/data/files, /data/logs, /data/ai, /data/ai/venv`)|전체 볼륨을 백업하십시오. 공간을 절약하기 위해 의도적으로 모든 AI 상태를 생략하고 해당 번들을 다시 설치합니다.|
|`SnapOtter-redisdata`|내구성 있는 BullMQ 대기열 상태를 위한 Redis AOF|앱을 일시 중지하고 `SAVE`를 강제 실행한 후 백업하세요. 대기 중인 작업을 정확하게 재개하는 데 필요|
|`SnapOtter-workspace`|임시 객체 스토리지 키(`/tmp/workspace/uploads, /tmp/workspace/outputs`)|모든 작업이 소진되거나 취소된 후에는 백업하지 마십시오. 작업이 활성 상태인 동안에는 절대 버리지 마세요.|

Compose는 일반적으로 볼륨 이름 앞에 프로젝트 이름을 붙입니다. `SnapOtter-data`와 같은 표시 이름이 Docker 볼륨 이름이라고 가정하는 대신 탑재된 컨테이너에서 실제 소스 볼륨을 확인합니다.

### 데이터베이스 백업 {#database-backup}

PostgreSQL의 사용자 정의 아카이브 형식을 사용하고 백업을 완전한 것으로 처리하기 전에 아카이브를 확인하십시오.

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

모든 백업을 격리된 스택으로 복원하고, 데이터베이스 레코드와 파일 체크섬을 확인하고, 애플리케이션을 시작하여 테스트합니다. 저장소의 `tests/qa/backup-restore-drill.sh`는 명시적인 `QA_IMAGE`에 대해 해당 릴리스 게이트를 자동화합니다.

플랫폼이 대신 충돌 일관성이 있는 볼륨 스냅샷을 생성하는 경우 먼저 전체 스택을 중지하고 모든 중요한 볼륨을 하나의 세트로 스냅샷하십시오. 실행 중인 컨테이너의 원시 PostgreSQL 데이터 디렉터리 복사본은 지원되는 논리적 백업이 아닙니다.

### 파일 및 큐 백업 {#file-and-queue-backup}

파일 및 대기열 볼륨을 캡처하기 전에 애플리케이션을 일시 중지하십시오. `docker inspect`를 사용하여 실제 볼륨 이름을 확인하고 Redis가 현재 상태를 유지하도록 강제하며 소유권과 권한이 보존된 상태로 보관합니다.

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

애플리케이션을 적용하기 전에 Redis를 다시 시작하십시오. `/data/ai`를 의도적으로 제외하는 경우 모델이나 가상 환경 없이 `installed.json` 레코드를 보존하는 대신 전체 AI 하위 트리를 제거하십시오. 백업 파일을 암호화하고 액세스를 제어하며 SnapOtter를 실행하는 호스트와 별도로 보관하세요.

## 규정 준수 아티팩트 {#compliance-artifacts}

각 SnapOtter 릴리스에는 다음 보안 아티팩트가 포함되어 있습니다.

| 인공물 | 체재 | 어디서 찾을 수 있나요? |
|---|---|---|
| 릴리스 주제 바인딩 | 정식 JSON + GitHub 증명 | [GitHub 출시](https://github.com/snapotter-hq/SnapOtter/releases) 자산: `snapotter-v{version}-release-subjects.json` |
| 아카이브 SBOM | CycloneDX 및 SPDX JSON | 릴리스 자산: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| 이미지 SBOM | CycloneDX 및 SPDX JSON | 릴리스 자산: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| 취약점 스캔 | Trivy JSON | `archive-linux-{arch}` 또는 `image-linux-{arch}` 접두사가 일치하는 자산 릴리스 |
| 취약점 스캔 | SARIF | [GitHub 보안](https://github.com/snapotter-hq/SnapOtter/security) 탭 |
| 정적 분석 | CodeQL(JS/TS + Python) | [GitHub 보안](https://github.com/snapotter-hq/SnapOtter/security) 탭, 매주 + PR별로 실행 |
| 의존성 검토 | GitHub 네이티브 | PR별 검사, 심각도가 높은 추가 시 실패 |
| Python 종속성 감사 | pip-audit | 푸시할 때마다 CI 실행 로그 |
| 보안정책 | Markdown | 저장소의 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| 종속성 업데이트 | Dependabot | npm, pip, Docker, Actions에 대한 자동 주간 PR |

**자체 스캔 실행:**

릴리스 주제 매니페스트를 다운로드하고 릴리스 워크플로에서 증명되었는지 확인합니다.

```bash
gh attestation verify snapotter-v2.2.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

매니페스트는 `releaseTag`, `releaseCommit` 및 `workflowTriggerCommit`를 별도로 기록합니다. `releaseCommit`가 불변 태그에서 벗겨낸 커밋인지 확인한 다음 아카이브, 이미지, SBOM의 SHA-256 다이제스트를 확인하거나 `subjects`의 해당 항목에 대해 사용하는 스캔을 확인하세요. 이러한 구분은 의도적인 것입니다. 새로 생성된 릴리스 커밋을 체크아웃해도 워크플로의 OIDC 자격 증명에서 커밋 ID가 변경되지 않습니다.

다운로드한 SBOM 또는 이미지를 직접 스캔할 수도 있습니다.

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.2.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.2.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.2.0
```

::: info
이미지 SBOMs 및 스캔은 해당 릴리스에 게시된 정확한 아키텍처별 이미지를 반영합니다. SBOMs 아카이브와 스캔은 사전 구축된 아카이브를 별도로 설명합니다. 배포 후 설치된 AI 모델 번들은 런타임 시 다운로드되므로 이러한 SBOMs에는 포함되지 않습니다.
:::
