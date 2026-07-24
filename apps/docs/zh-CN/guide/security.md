---
description: "SnapOtter 的安全加固指南。涵盖容器安全、网络隔离、Docker 密钥、Kubernetes 部署和合规产物。"
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: 5cdae11497f9
i18n_hash_version: 2
---

# 安全与加固 {#security-hardening}

SnapOtter 完全在你自己的基础设施上处理文件。它默认发送匿名、不含内容的产品分析和崩溃报告，以帮助改进项目。它绝不会发送你的文件、文件名、文件内容、OCR 输出、图像元数据或文档文本。可选的反馈仅在用户提交后才会发送，仅在分析启用时发送，且联系字段仅在获得明确的联系同意时才包含在内。管理员可以在 Settings > System > Privacy 下一键关闭分析和反馈采集，无需重新构建。文件处理始终留在你的容器内部。

容器以专用的非 root 用户（`snapotter`）运行，除最低必需集之外的所有 Linux 权能都被丢弃。完整的漏洞披露政策和安全架构，请参阅 GitHub 上的 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md)。

## 容器硬化 {#container-hardening}

规范的 [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) 和 [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) Compose 文件是事实来源。不要将缩写示例复制到生产中；从您验证的发布标签部署文件。

两个堆栈都应用以下控制：

- 内存、交换、CPU 和 PID 限制包含失控的本机处理。
- 每个服务都会放弃所有 Linux 功能。该应用程序仅添加回 `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` 来实现卷所有权、单向 `gosu` 身份删除以及优雅的信号转发。 PostgreSQL 和 Redis 仅接收其官方入口点所需的子集。
- `security_opt: [no-new-privileges:true]` 防止应用程序、PostgreSQL 和 Redis 容器中的进程获得额外权限。这仍然与 `gosu` 兼容：入口点以 root 身份开始，准备卷，并且仅下降到专用的 `snapotter` 用户。
- PostgreSQL 和 Redis 图像输入由摘要固定。应用程序同样应该固定到经过验证的发布标签或摘要，而不是 `latest`。
- 健康检查、有界 JSON 日志轮换、持久的 Redis AOF 和重启策略在规范文件中集中定义。

对于面向互联网的部署，将端口 1349 绑定到环回并在维护的反向代理处终止 TLS。生成唯一的 PostgreSQL 和 Redis 凭据，将机密存储在受保护的文件或机密管理器中，并立即更改初始管理员密码。

### 为什么 `read_only` 没有设置 {#why-read-only-is-not-set}

未设置 `read_only: true`，因为 PUID/PGID 重新映射在启动时写入 `/etc/passwd` 和 `/etc/group`。如果您使用 Docker 的 `--user` 标志或 Kubernetes `runAsUser` 而不是 PUID/PGID，则可以安全地启用只读根文件系统。

## 网络隔离{#network-isolation}

文件处理是本地的，但默认安装**不是无出口系统**。启用遥测功能时，匿名产品分析使用 PostHog，崩溃报告使用 Sentry。设置 `SNAPOTTER_TELEMETRY=0`（或在“设置”>“系统”>“隐私”下禁用分析）以关闭两者。 SnapOtter 绝不会在这些事件中包含上传的文件、文件名、OCR 输出、文档文本或其他文件内容。

其他出站流量是功能驱动的：AI 捆绑包/模型安装下载签名发布输入； URL导入获取用户请求的公共URL；并显式配置的 OIDC、SAML、OpenTelemetry、webhooks、S3 兼容存储或类似集成会联系管理员选择的目标。运行时模型下载默认处于禁用状态。仅在明确选择启用自动回退下载时设置 `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1`。[离线捆绑导入](/zh-CN/guide/deployment) 可以在没有运行时模型出口的情况下提供 AI 功能。

**防火墙建议：**

|设想|出站规则|
|---|---|
|气隙|设置`SNAPOTTER_TELEMETRY=0`和`SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`，使用离线AI捆绑导入，禁用URL导入和外部集成，然后阻止出口|
|默认遥测|允许浏览器/网络日志列出的 PostHog 和 Sentry 端点；如果策略不允许，则禁用遥测|
|需要 AI 捆绑包|安装过程中，允许HTTPS到`huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`；然后阻止这些主机|
|外部集成|仅允许管理员准确配置的 OIDC/SAML/OTLP/webhook/对象存储目标|

捆绑包档案由 Hugging Face 的 Xet 存储提供，该存储通过 `*.xethub.hf.co` 端点并行传输，这使得多 GB 捆绑包下载速度更快。如果您的防火墙允许 `huggingface.co` 但阻止 `*.xethub.hf.co`，安装仍然会成功，但会回退到较慢的单流下载，因此将 Xet 主机列入白名单以保持快速路径。完全离线安装可以跳过所有这些并使用[离线捆绑导入](/zh-CN/guide/deployment)。

有关反向代理配置（Nginx、Traefik、Caddy、Cloudflare Tunnels），请参阅[部署指南](/zh-CN/guide/deployment#reverse-proxy)。

## Docker 密钥 {#docker-secrets}

对于生产部署，请避免将密钥作为明文环境变量传递。入口点支持 Docker 的 `_FILE` 约定：将密钥挂载为文件，并将对应的 `_FILE` 变量设置为其路径。

**支持的密钥：**

| 变量 | `_FILE` 等价项 |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**使用 Docker Compose 密钥的示例：**

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
Docker Compose 密钥（不使用 Swarm）需要 Compose v2.23 或更高版本。
:::

## Kubernetes 部署 {#kubernetes-deployment}

入口点会检测容器是否已经以非 root 运行（例如通过 Kubernetes 的 `runAsUser`），并自动跳过 gosu 降权。在这种情况下，它无法自行 chown 挂载的卷，因此会验证它们是否可写，若不可写则提前退出并给出可操作的指引 - 关于 `fsGroup` 和外来 UID 设置（TrueNAS、OpenShift），请参阅 [存储权限](/zh-CN/guide/deployment#storage-permissions)。

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

由于 `runAsUser: 999` 是在 Pod 层级设置的，入口点会完全跳过 gosu。这样就能在无冲突的情况下使用 `allowPrivilegeEscalation: false` 和 `drop: [ALL]` 权能。

关于资源规格，请参阅 [硬件要求](/zh-CN/guide/deployment#hardware-requirements)。

## 备份与恢复 {#backup-and-recovery}

生产 Compose 堆栈定义了四个卷。在进行协调备份之前停止入口并让活动作业完成，以便 PostgreSQL、Redis 和文件状态描述相同的时间点。

|体积|内容|康复治疗|
|---|---|---|
|`SnapOtter-pgdata`|PostgreSQL 用户、设置、管道、作业、文件元数据和审核日志|批判的;使用快速故障逻辑转储进行可移植恢复|
|`SnapOtter-data`|保存的库对象、日志和 AI 状态 (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|备份整个卷；为了节省空间，故意省略所有 AI 状态并重新安装其捆绑包|
|`SnapOtter-redisdata`|Redis AOF 用于持久的 BullMQ 队列状态|暂停应用程序并强制`SAVE`后备份；需要准确地恢复排队的工作|
|`SnapOtter-workspace`|临时对象存储键 (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|所有作业清空或取消后不要进行备份；当工作处于活动状态时切勿丢弃它|

Compose 通常在卷名称前加上项目名称作为前缀。从已安装的容器中解析真实的源卷，而不是假设显示名称（例如 `SnapOtter-data`）是 Docker 卷名称。

### 数据库备份{#database-backup}

使用 PostgreSQL 的自定义存档格式并在将备份视为完整之前验证存档：

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

通过将每个备份恢复到隔离堆栈、检查数据库记录和文件校验和以及启动应用程序来测试每个备份。存储库的 `tests/qa/backup-restore-drill.sh` 会针对显式 `QA_IMAGE` 自动执行该发布门。

如果您的平台采用崩溃一致的卷快照，请首先停止整个堆栈，并将所有关键卷快照为一组。来自正在运行的容器的原始 PostgreSQL 数据目录副本不是受支持的逻辑备份。

### 文件和队列备份 {#file-and-queue-backup}

在捕获文件和队列卷之前暂停应用程序。使用 `docker inspect` 解析实际卷名称，强制 Redis 保留其当前状态，并在保留所有权和权限的情况下进行归档：

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

应用前重启Redis。如果您有意排除 `/data/ai`，请删除整个 AI 子树，而不是保留不带模型或虚拟环境的 `installed.json` 记录。保持备份文件加密、访问受控，并与运行 SnapOtter 的主机分开。

## 合规工件 {#compliance-artifacts}

每个 SnapOtter 版本都包含以下安全工件：

| 人工制品 | 格式 | 在哪里可以找到它 |
|---|---|---|
| 释放主体绑定 | 规范 JSON + GitHub 证明 | [GitHub发布](https://github.com/snapotter-hq/SnapOtter/releases)资产：`snapotter-v{version}-release-subjects.json` |
| 归档 SBOM | CycloneDX 和 SPDX JSON | 释放资产：`snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| 图片 SBOM | CycloneDX 和 SPDX JSON | 释放资产：`snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| 漏洞扫描 | Trivy JSON | 发布具有匹配 `archive-linux-{arch}` 或 `image-linux-{arch}` 前缀的资产 |
| 漏洞扫描 | SARIF | [GitHub 安全](https://github.com/snapotter-hq/SnapOtter/security) 选项卡 |
| 静态分析 | CodeQL (JS/TS + Python) | [GitHub 安全](https://github.com/snapotter-hq/SnapOtter/security) 选项卡，每周运行 + 每个 PR |
| 依赖性审查 | GitHub 本机 | 按 PR 检查，高严重性添加失败 |
| Python依赖审计 | pip-audit | CI 在每次推送时运行日志 |
| 安全政策 | Markdown | 存储库中的 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| 依赖项更新 | Dependabot | npm、pip、Docker、Actions 的自动每周 PR |

**运行您自己的扫描:**

下载发布主题清单并验证它是否已由发布工作流程证明：

```bash
gh attestation verify snapotter-v2.1.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

清单中分别记录了 `releaseTag`、`releaseCommit` 和 `workflowTriggerCommit`。验证 `releaseCommit` 是否是从不可变标记中剥离的提交，然后验证存档、映像、SBOM 的 SHA-256 摘要，或根据 `subjects` 中的条目进行扫描。这种区别是有意为之的：签出新创建的发布提交不会更改工作流的 OIDC 凭证中的提交标识。

您还可以直接扫描下载的 SBOM 或图像：

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.1.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.1.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.1.0
```

::: info
图像 SBOMs 和扫描反映了针对该版本发布的具体架构特定图像。存档 SBOMs 和扫描分别描述预建存档。部署后安装的 AI 模型包不包含在这些 SBOMs 中，因为它们是在运行时下载的。
:::
