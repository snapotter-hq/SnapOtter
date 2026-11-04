---
description: "SnapOtter 安全加固指南。容器安全、网络隔离、Docker 密钥、Kubernetes 部署以及合规产物。"
i18n_source_hash: 630381c08cde
i18n_provenance: machine
i18n_output_hash: 37d9a302cdc2
i18n_hash_version: 2
---

# 安全与加固 {#security-hardening}

SnapOtter 完全在你的基础设施上处理文件。默认情况下，它会发送匿名且不含内容的产品分析和崩溃报告，以帮助改进项目。它绝不会发送你的文件、文件名、文件内容、OCR 输出、图像元数据或文档文本。可选的反馈仅在用户提交后才会发送，仅在启用分析时发送，并且只有在明确同意联系时才会包含联系字段。管理员可以在 设置 > 系统 > 隐私 下一键关闭分析和反馈收集，无需重新构建。文件处理始终保留在你的容器内。

容器以专用的非 root 用户（`snapotter`）运行，除所需的最小集合之外，所有 Linux 能力均已移除。完整的漏洞披露政策和安全架构请参阅 GitHub 上的 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md)。

## 容器加固 {#container-hardening}

标准的 [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) 和 [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) Compose 文件是权威来源。不要将简化的示例复制到生产环境中；请部署你验证过的发布标签中的文件。

两个堆栈都应用了以下控制：

- 内存、交换空间、CPU 和 PID 限制用于遏制失控的原生处理。
- 每个服务都会移除所有 Linux 能力。应用仅加回 `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL`，用于卷所有权、单向的 `gosu` 身份降权以及优雅的信号转发。PostgreSQL 和 Redis 仅获得其官方入口点所需的子集。
- `security_opt: [no-new-privileges:true]` 可防止应用、PostgreSQL 和 Redis 容器中的进程获得额外权限。这与 `gosu` 保持兼容：入口点以 root 开始，准备好卷，然后才降权为专用的 `snapotter` 用户。
- PostgreSQL 和 Redis 的镜像输入按摘要固定。应用同样应当固定到已验证的发布标签或摘要，而不是 `latest`。
- 健康检查、有界的 JSON 日志轮转、持久化的 Redis AOF 以及重启策略都集中定义在标准文件中。

对于面向互联网的部署，请将 1349 端口绑定到回环地址，并在受维护的反向代理处终止 TLS。为 PostgreSQL 和 Redis 生成唯一的凭据，将密钥存放在受保护的文件或密钥管理器中，并立即修改初始管理员密码。

### 为什么不设置 `read_only` {#why-read-only-is-not-set}

不设置 `read_only: true` 是因为 PUID/PGID 重映射会在启动时写入 `/etc/passwd` 和 `/etc/group`。如果你使用 Docker 的 `--user` 标志或 Kubernetes 的 `runAsUser` 来代替 PUID/PGID，就可以安全地启用只读根文件系统。

## 网络隔离 {#network-isolation}

文件处理在本地进行，但默认安装**并不是无出站流量的系统**。启用遥测时，匿名产品分析使用 PostHog，崩溃报告使用 Sentry。设置 `SNAPOTTER_TELEMETRY=0`（或在 设置 > 系统 > 隐私 下禁用分析）即可同时关闭两者。SnapOtter 绝不会在这些事件中包含上传的文件、文件名、OCR 输出、文档文本或其他文件内容。

其他出站流量由功能驱动：AI 捆绑包/模型安装会下载已签名的发布输入；URL 导入会获取用户请求的公共 URL；而明确配置的 OIDC、SAML、OpenTelemetry、webhook、兼容 S3 的存储或类似集成，则会联系管理员选择的目的地。运行时模型下载默认禁用。仅当需要明确选择启用自动回退下载时才设置 `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1`。[离线捆绑包导入](/zh-CN/guide/deployment)可以在没有运行时模型出站流量的情况下配置 AI 功能。

**防火墙建议：**

| 场景 | 出站规则 |
|---|---|
| 物理隔离 | 设置 `SNAPOTTER_TELEMETRY=0` 和 `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`，使用离线 AI 捆绑包导入，禁用 URL 导入和外部集成，然后阻断出站流量 |
| 默认遥测 | 允许浏览器/网络日志中列出的 PostHog 和 Sentry 端点；如果政策不允许，则禁用遥测 |
| 需要 AI 捆绑包 | 安装期间，允许通过 HTTPS 访问 `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`；之后阻断这些主机 |
| 外部集成 | 仅允许管理员配置的确切的 OIDC/SAML/OTLP/webhook/对象存储目的地 |

捆绑包归档由 Hugging Face 的 Xet 存储提供，它通过 `*.xethub.hf.co` 端点并行传输，这也是数 GB 的捆绑包能够快速下载的原因。如果你的防火墙允许 `huggingface.co` 但阻断 `*.xethub.hf.co`，安装仍然会成功，但会回退到较慢的单流下载，因此请将 Xet 主机加入允许列表，以保持在快速路径上。完全离线的安装可以跳过以上所有内容，改用[离线捆绑包导入](/zh-CN/guide/deployment)。

关于反向代理配置（Nginx、Traefik、Caddy、Cloudflare Tunnels），请参阅[部署指南](/zh-CN/guide/deployment#reverse-proxy)。

## Docker 密钥 {#docker-secrets}

对于生产部署，请避免以明文环境变量传递密钥。入口点支持 Docker 的 `_FILE` 约定：将密钥以文件形式挂载，并将对应的 `_FILE` 变量设置为其路径。

**支持的密钥：**

| 变量 | `_FILE` 等效项 |
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

当容器已经以非 root 身份运行时（例如通过 Kubernetes 的 `runAsUser`），入口点会检测到这一点，并自动跳过 gosu 降权。在这种情况下，它无法自行 chown 已挂载的卷，因此会验证这些卷是否可写，如果不可写，则提前退出并给出可操作的指引。关于 `fsGroup` 和外部 UID 设置（TrueNAS、OpenShift），请参阅[存储权限](/zh-CN/guide/deployment#storage-permissions)。

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

由于 `runAsUser: 999` 是在 pod 级别设置的，入口点会完全跳过 gosu。这使得 `allowPrivilegeEscalation: false` 和 `drop: [ALL]` 能力可以共存而不冲突。

资源规模请参阅[硬件要求](/zh-CN/guide/deployment#hardware-requirements)。

## 备份与恢复 {#backup-and-recovery}

生产 Compose 堆栈定义了四个卷。请在进行协调备份之前停止入口流量并让活动任务完成，这样 PostgreSQL、Redis 和文件状态描述的就是同一个时间点。

| 卷 | 内容 | 恢复处理 |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL 用户、设置、流水线、任务、文件元数据和审计日志 | 关键；使用快速失败的逻辑转储以实现可移植恢复 |
| `SnapOtter-data` | 已保存的库对象、日志和 AI 状态（`/data/files, /data/logs, /data/ai, /data/ai/venv`） | 备份整个卷；为节省空间，可有意省略所有 AI 状态并重新安装其捆绑包 |
| `SnapOtter-redisdata` | 用于持久化 BullMQ 队列状态的 Redis AOF | 在暂停应用并强制执行 `SAVE` 之后备份；要精确恢复排队中的工作，这是必需的 |
| `SnapOtter-workspace` | 临时对象存储密钥（`/tmp/workspace/uploads, /tmp/workspace/outputs`） | 所有任务排空或取消之后不要备份；当有任务处于活动状态时，切勿丢弃它 |

Compose 通常会给卷名添加项目名前缀。请从已挂载的容器中解析真实的源卷，而不要假设 `SnapOtter-data` 这样的显示名称就是 Docker 卷名。

### 数据库备份 {#database-backup}

使用 PostgreSQL 的自定义归档格式，并在将备份视为完成之前验证归档：

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

请通过将每个备份恢复到隔离的堆栈中来测试它，检查数据库记录和文件校验和，并启动应用。仓库中的 `tests/qa/backup-restore-drill.sh` 针对明确指定的 `QA_IMAGE` 自动执行该发布关卡。

如果你的平台改为采用崩溃一致的卷快照，请先停止整个堆栈，并将所有关键卷作为一组进行快照。对正在运行的容器直接复制 PostgreSQL 数据目录不属于受支持的逻辑备份。

### 文件与队列备份 {#file-and-queue-backup}

在捕获文件和队列卷之前先暂停应用。使用 `docker inspect` 解析实际的卷名，强制 Redis 持久化其当前状态，并在保留所有权和权限的情况下归档：

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

请先于应用重启 Redis。如果你有意排除 `/data/ai`，请移除整个 AI 子树，而不要保留一个没有模型或虚拟环境的 `installed.json` 记录。请对备份文件加密、实施访问控制，并将其与运行 SnapOtter 的主机分开存放。

## 合规产物 {#compliance-artifacts}

每个 SnapOtter 发布都包含以下安全产物：

| 产物 | 格式 | 获取位置 |
|---|---|---|
| 发布主体绑定 | 规范化 JSON + GitHub 证明 | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 资源：`snapotter-v{version}-release-subjects.json` |
| 归档 SBOM | CycloneDX 和 SPDX JSON | 发布资源：`snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| 镜像 SBOM | CycloneDX 和 SPDX JSON | 发布资源：`snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| 漏洞扫描 | Trivy JSON | 带有匹配的 `archive-linux-{arch}` 或 `image-linux-{arch}` 前缀的发布资源 |
| 漏洞扫描 | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 选项卡 |
| 静态分析 | CodeQL（JS/TS + Python） | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 选项卡，每周运行一次，并在每个 PR 上运行 |
| 依赖审查 | GitHub 原生 | 每个 PR 的检查，新增高危依赖时失败 |
| Python 依赖审计 | pip-audit | 每次 push 的 CI 运行日志 |
| 安全政策 | Markdown | 仓库中的 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| 依赖更新 | Dependabot | 针对 npm、pip、Docker、Actions 的每周自动 PR |

**运行你自己的扫描：**

下载发布主体清单，并验证它是否由发布工作流证明：

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

该清单分别记录了 `releaseTag`、`releaseCommit` 和 `workflowTriggerCommit`。请验证 `releaseCommit` 是从不可变标签剥离出的提交，然后根据 `subjects` 中的条目，验证你所使用的归档、镜像、SBOM 或扫描结果的 SHA-256 摘要。这种区分是有意为之：检出新创建的发布提交并不会改变工作流 OIDC 凭据中的提交标识。

你也可以直接扫描下载的 SBOM 或镜像：

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
镜像 SBOM 和扫描结果反映的是该发布所发布的、特定于架构的确切镜像。归档 SBOM 和扫描结果则单独描述预构建归档。部署后安装的 AI 模型捆绑包不包含在这些 SBOM 中，因为它们是在运行时下载的。
:::
