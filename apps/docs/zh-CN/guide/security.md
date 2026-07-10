---
description: SnapOtter 的安全加固指南。容器安全、网络隔离、Docker secrets、Kubernetes 部署以及合规性工件。
i18n_source_hash: c682d19a84ce
i18n_provenance: human
i18n_output_hash: 533c618e4eb9
---

# 安全与加固 {#security-hardening}

SnapOtter 完全在你自己的基础设施上处理文件。它默认发送匿名、不含内容的产品分析和崩溃报告，以帮助改进本项目。它绝不发送你的文件、文件名、文件内容、OCR 输出、图像元数据或文档文本。可选的反馈仅在用户提交后发送，且仅在启用了分析时发送，联系字段仅在明确同意提供联系方式后才包含在内。管理员可在 Settings > System > Privacy 下一键关闭分析和反馈收集，无需重新构建。文件处理始终留在你的容器内部。

容器以专用的非 root 用户（`snapotter`）运行，除最低所需集之外，所有 Linux 能力都已被丢弃。有关完整的漏洞披露政策和安全架构，请参阅 GitHub 上的 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md)。

## 容器加固 {#container-hardening}

[默认的 docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) 包含了生产环境的安全加固。以下是每个选项的说明及其重要性：

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

### 为何未设置 `no-new-privileges` {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` 是有意省略的。入口点以 root 身份启动以修复卷的所有权，然后通过 [gosu](https://github.com/tianon/gosu) 降权到 `snapotter` 用户，这需要 setuid。一旦降权完成，进程便以 `snapotter` 身份运行，除上面列出的五项之外的所有能力都已移除。

如果你使用 Kubernetes 或 Docker 的 `--user` 标志直接以非 root 身份运行（绕过 gosu），则可以安全地启用 `no-new-privileges`。

### 为何未设置 `read_only` {#why-read-only-is-not-set}

未设置 `read_only: true`，因为 PUID/PGID 重映射在启动时会写入 `/etc/passwd` 和 `/etc/group`。如果你使用 Docker 的 `--user` 标志或 Kubernetes 的 `runAsUser` 而非 PUID/PGID，则可以安全地启用只读根文件系统。

## 网络隔离 {#network-isolation}

在正常运行期间，容器**不会发起任何出站网络连接**。所有文件处理都使用捆绑的库在本地完成。

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

唯一的例外是 **AI 模型下载**：当用户通过界面安装 AI 功能包时，容器会从 GitHub Releases 和 PyPI 下载模型文件。这些下载每个包只发生一次，并存储在 `/data` 卷中。

**防火墙建议：**

| 场景 | 出站规则 |
|---|---|
| 隔离网络（无 AI） | 阻止容器的所有出站流量 |
| 需要 AI 功能包 | 在安装期间允许 HTTPS 访问 `github.com`、`objects.githubusercontent.com`、`pypi.org`、`files.pythonhosted.org`，然后阻止 |
| AI 安装完成后 | 阻止所有出站流量 - 模型已缓存到本地 |

有关反向代理配置（Nginx、Traefik、Caddy、Cloudflare Tunnels），请参阅[部署指南](/zh-CN/guide/deployment#reverse-proxy)。

## Docker Secrets {#docker-secrets}

对于生产环境部署，请避免将密钥作为纯文本环境变量传递。入口点支持 Docker 的 `_FILE` 约定：将密钥挂载为文件，并将相应的 `_FILE` 变量设置为其路径。

**支持的密钥：**

| 变量 | `_FILE` 等效项 |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**使用 Docker Compose secrets 的示例：**

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
Docker Compose secrets（不使用 Swarm）需要 Compose v2.23 或更高版本。
:::

## Kubernetes 部署 {#kubernetes-deployment}

入口点会检测容器是否已经以非 root 身份运行（例如通过 Kubernetes 的 `runAsUser`），并自动跳过 gosu 降权。在这种情况下，它无法自行 chown 挂载的卷，因此会验证它们是否可写，如果不可写则提前退出并给出可操作的指导 — 有关 `fsGroup` 和外部 UID 设置（TrueNAS、OpenShift），请参阅[存储权限](/zh-CN/guide/deployment#storage-permissions)。

**推荐的 Pod SecurityContext：**

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

由于 `runAsUser: 999` 是在 pod 级别设置的，入口点会完全跳过 gosu。这样便可以在不冲突的情况下使用 `allowPrivilegeEscalation: false` 和 `drop: [ALL]` 能力。

有关资源规格，请参阅[硬件要求](/zh-CN/guide/deployment#hardware-requirements)。

## 备份与恢复 {#backup-and-recovery}

持久状态分布在两个卷中：

| 卷 | 内容 | 是否关键？ |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL 数据库（用户、设置、pipeline、jobs、审计日志） | 是 |
| `/data`（应用卷） | 用户上传的文件、AI 模型、Python venv | 部分（见下文） |

在 `/data` 卷内：

| 路径 | 内容 | 是否关键？ |
|---|---|---|
| `/data/uploads/`、`/data/outputs/` | 用户文件和处理结果 | 是 |
| `/data/ai/` | 下载的 AI 模型文件 | 否（可重新下载） |
| `/data/venv/` | Python 虚拟环境 | 否（启动时重建） |

### 数据库备份 {#database-backup}

在整个技术栈运行时，使用 `pg_dump` 备份数据库：

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

或者，停止技术栈并对 `SnapOtter-pgdata` 卷进行快照：

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### 用户文件备份 {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

所有功能包的 AI 模型总计最多约 24 GB。由于它们可以重新下载，请从备份中排除 `/data/ai/` 和 `/data/venv/` 以节省空间。只有数据库和用户文件才是关键的。

## 合规性工件 {#compliance-artifacts}

每个 SnapOtter 版本都包含以下安全工件：

| 工件 | 格式 | 获取位置 |
|---|---|---|
| SBOM (CycloneDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 资产：`snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 资产：`snapotter-v{version}-sbom.spdx.json` |
| 漏洞扫描 | Trivy JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 资产：`snapotter-v{version}-trivy.json` |
| 漏洞扫描 | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 选项卡 |
| 静态分析 | CodeQL (JS/TS + Python) | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 选项卡，每周及每个 PR 运行 |
| 依赖项审查 | GitHub 原生 | 每个 PR 检查，在添加高危项时失败 |
| Python 依赖项审计 | pip-audit | 每次推送时的 CI 运行日志 |
| 安全策略 | Markdown | 仓库中的 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| 依赖项更新 | Dependabot | 针对 npm、pip、Docker、Actions 的每周自动 PR |

**运行你自己的扫描：**

从版本中下载 SBOM，并用你偏好的工具进行扫描：

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM 和漏洞扫描反映的是该版本发布的确切镜像。部署后安装的 AI 模型包不包含在 SBOM 中，因为它们是在运行时下载的。
:::
