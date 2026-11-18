---
description: "SnapOtter 安全性強化指南。涵蓋容器安全、網路隔離、Docker secrets、Kubernetes 部署，以及合規文件。"
i18n_source_hash: 630381c08cde
i18n_provenance: machine
i18n_output_hash: 7b23763c311d
i18n_hash_version: 2
---

# 安全性與強化 {#security-hardening}

SnapOtter 完全在您自己的基礎設施上處理檔案。為了協助改進專案，它預設會傳送匿名且不含內容的產品分析與當機報告，但絕不會傳送您的檔案、檔名、檔案內容、OCR 輸出、圖片中繼資料或文件文字。選用的意見回饋只會在使用者提交後傳送，且僅在啟用分析時才會傳送，聯絡欄位也只有在使用者明確同意提供聯絡方式時才會包含。管理員可以在「設定 > 系統 > 隱私權」下一鍵關閉分析與意見回饋的收集，無須重新建置。檔案處理一律在您的容器內進行。

容器以專用的非 root 使用者（`snapotter`）執行，並捨棄除最低必要集合之外的所有 Linux capabilities。完整的弱點揭露政策與安全架構，請參閱 GitHub 上的 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md)。

## 容器強化 {#container-hardening}

標準的 [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) 與 [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) Compose 檔案是唯一的依據。請勿將簡化的範例複製到正式環境，而應部署您驗證過的發行標籤中的檔案。

兩種堆疊都套用下列控制措施：

- 記憶體、swap、CPU 與 PID 限制，用來遏止失控的原生處理程序。
- 每個服務都捨棄所有 Linux capabilities。應用程式僅加回 `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL`，用於磁碟區擁有者設定、單向的 `gosu` 身分降權，以及訊號的正常轉送。PostgreSQL 與 Redis 只取得其官方 entrypoint 所需的子集。
- `security_opt: [no-new-privileges:true]` 可防止應用程式、PostgreSQL 與 Redis 容器中的處理程序取得額外權限。這與 `gosu` 相容：entrypoint 以 root 開始，準備好磁碟區後，才降權為專用的 `snapotter` 使用者。
- PostgreSQL 與 Redis 的映像檔輸入以摘要固定。應用程式同樣應固定在經過驗證的發行標籤或摘要，而不是 `latest`。
- 健康檢查、有上限的 JSON 日誌輪替、持久化的 Redis AOF，以及重新啟動原則，都集中定義在標準檔案中。

對於面向網際網路的部署，請將連接埠 1349 綁定到 loopback，並在持續維護的反向代理處終止 TLS。請產生獨一無二的 PostgreSQL 與 Redis 憑證，將機密存放在受保護的檔案或機密管理工具中，並立即變更初始的管理員密碼。

### 為什麼未設定 `read_only` {#why-read-only-is-not-set}

未設定 `read_only: true`，是因為 PUID/PGID 重新對應會在啟動時寫入 `/etc/passwd` 與 `/etc/group`。如果您改用 Docker 的 `--user` 旗標或 Kubernetes 的 `runAsUser`，而不使用 PUID/PGID，就可以安全地啟用唯讀的根檔案系統。

## 網路隔離 {#network-isolation}

檔案處理在本機進行，但預設安裝**並不是一個沒有對外連線的系統**。啟用遙測時，匿名產品分析使用 PostHog，當機報告使用 Sentry。設定 `SNAPOTTER_TELEMETRY=0`（或在「設定 > 系統 > 隱私權」下停用分析）即可同時關閉兩者。SnapOtter 絕不會在這些事件中包含上傳的檔案、檔名、OCR 輸出、文件文字或其他檔案內容。

其他對外流量取決於所用的功能：AI 套件組合與模型的安裝會下載經過簽署的發行輸入；URL 匯入會擷取使用者要求的公開 URL；而明確設定的 OIDC、SAML、OpenTelemetry、webhook、相容 S3 的儲存空間或類似整合，則會連線到管理員所選擇的目的地。執行階段的模型下載預設為停用。只有在明確選擇啟用自動備援下載時，才需設定 `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1`。[離線套件組合匯入](/zh-TW/guide/deployment)可以在沒有執行階段模型對外連線的情況下提供 AI 功能。

**防火牆建議：**

| 情境 | 對外規則 |
|---|---|
| 隔離網路（air-gapped） | 設定 `SNAPOTTER_TELEMETRY=0` 與 `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`，使用離線 AI 套件組合匯入，停用 URL 匯入與外部整合，然後封鎖對外連線 |
| 預設遙測 | 允許您的瀏覽器或網路日誌中列出的 PostHog 與 Sentry 端點；如果原則不允許，請停用遙測 |
| 需要 AI 套件組合 | 安裝期間，允許以 HTTPS 連線到 `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`；之後封鎖這些主機 |
| 外部整合 | 僅允許管理員所設定的 OIDC/SAML/OTLP/webhook/物件儲存空間的確切目的地 |

套件組合封存檔是從 Hugging Face 的 Xet 儲存空間提供，它會透過 `*.xethub.hf.co` 端點平行傳輸，這也是數 GB 的套件組合能快速下載的原因。如果您的防火牆允許 `huggingface.co` 但封鎖 `*.xethub.hf.co`，安裝仍會成功，但會退回到較慢的單一串流下載，因此請將 Xet 主機加入允許清單，以維持在快速路徑上。完全離線的安裝可以略過上述所有設定，改用[離線套件組合匯入](/zh-TW/guide/deployment)。

反向代理設定（Nginx、Traefik、Caddy、Cloudflare Tunnels）請參閱[部署指南](/zh-TW/guide/deployment#reverse-proxy)。

## Docker Secrets {#docker-secrets}

在正式環境部署中，請避免以純文字環境變數傳遞機密。entrypoint 支援 Docker 的 `_FILE` 慣例：將機密掛載為檔案，並將對應的 `_FILE` 變數設為該檔案的路徑。

**支援的機密：**

| 變數 | `_FILE` 對應項 |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**使用 Docker Compose secrets 的範例：**

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
Docker Compose secrets（不使用 Swarm）需要 Compose v2.23 或更新版本。
:::

## Kubernetes 部署 {#kubernetes-deployment}

當容器已經以非 root 身分執行時（例如透過 Kubernetes 的 `runAsUser`），entrypoint 會偵測到並自動略過 gosu 權限降級。在這種情況下，它無法自行對掛載的磁碟區執行 chown，因此會確認這些磁碟區可寫入，若不可寫入，則提早結束並提供可據以處理的指引，請參閱[儲存空間權限](/zh-TW/guide/deployment#storage-permissions)，了解 `fsGroup` 與外部 UID 的設定（TrueNAS、OpenShift）。

**建議的 Pod SecurityContext：**

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

由於 `runAsUser: 999` 是在 Pod 層級設定，entrypoint 會完全略過 gosu。這讓 `allowPrivilegeEscalation: false` 與 `drop: [ALL]` capabilities 可以共存而不衝突。

資源規劃請參閱[硬體需求](/zh-TW/guide/deployment#hardware-requirements)。

## 備份與復原 {#backup-and-recovery}

正式環境的 Compose 堆疊定義了四個磁碟區。在進行協調一致的備份之前，請先停止對外入口並讓執行中的工作完成，這樣 PostgreSQL、Redis 與檔案狀態才會對應到同一個時間點。

| 磁碟區 | 內容 | 復原處理方式 |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL 的使用者、設定、管線、工作、檔案中繼資料與稽核日誌 | 關鍵資料；請使用快速失敗的邏輯傾印，以便跨環境復原 |
| `SnapOtter-data` | 儲存的檔案庫物件、日誌與 AI 狀態（`/data/files, /data/logs, /data/ai, /data/ai/venv`） | 備份整個磁碟區；若要節省空間，可刻意省略所有 AI 狀態並重新安裝其套件組合 |
| `SnapOtter-redisdata` | 用於持久化 BullMQ 佇列狀態的 Redis AOF | 在暫停應用程式並強制執行 `SAVE` 之後備份；若要精確恢復佇列中的工作，則必須備份 |
| `SnapOtter-workspace` | 暫時性的物件儲存空間金鑰（`/tmp/workspace/uploads, /tmp/workspace/outputs`） | 所有工作都已清空或取消後不需備份；工作仍在執行時，切勿丟棄 |

Compose 通常會在磁碟區名稱前加上專案名稱。請從已掛載的容器解析實際的來源磁碟區，而不要假設 `SnapOtter-data` 這類顯示名稱就是 Docker 磁碟區名稱。

### 資料庫備份 {#database-backup}

請使用 PostgreSQL 的自訂封存格式，並在將備份視為完成之前先驗證封存檔：

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

請將每份備份還原到隔離的堆疊中進行測試，檢查資料庫記錄與檔案總和檢查碼，並啟動應用程式。儲存庫中的 `tests/qa/backup-restore-drill.sh` 會針對明確指定的 `QA_IMAGE`，自動執行該發行關卡。

如果您的平台改為建立當機一致性的磁碟區快照，請先停止整個堆疊，並將所有關鍵磁碟區作為一組一併建立快照。從執行中的容器直接複製 PostgreSQL 資料目錄，並不是受支援的邏輯備份。

### 檔案與佇列備份 {#file-and-queue-backup}

在擷取檔案與佇列磁碟區之前，請先暫停應用程式。使用 `docker inspect` 解析實際的磁碟區名稱，強制 Redis 保存其目前狀態，並在保留擁有者與權限的情況下封存：

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

請先重新啟動 Redis，再重新啟動應用程式。如果您刻意排除 `/data/ai`，請移除整個 AI 子樹，而不要保留沒有模型或虛擬環境的 `installed.json` 記錄。備份檔案請加密、限制存取，並與執行 SnapOtter 的主機分開存放。

## 合規文件 {#compliance-artifacts}

每個 SnapOtter 發行版本都包含下列安全性文件：

| 文件 | 格式 | 取得位置 |
|---|---|---|
| 發行主體繫結 | 標準 JSON + GitHub 證明 | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 資產：`snapotter-v{version}-release-subjects.json` |
| 封存檔 SBOM | CycloneDX 與 SPDX JSON | 發行資產：`snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| 映像檔 SBOM | CycloneDX 與 SPDX JSON | 發行資產：`snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| 弱點掃描 | Trivy JSON | 前綴為 `archive-linux-{arch}` 或 `image-linux-{arch}` 的對應發行資產 |
| 弱點掃描 | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 分頁 |
| 靜態分析 | CodeQL（JS/TS + Python） | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 分頁，每週執行並於每個 PR 執行 |
| 相依性審查 | GitHub 原生功能 | 每個 PR 的檢查，新增高嚴重性相依項時會失敗 |
| Python 相依性稽核 | pip-audit | 每次推送的 CI 執行日誌 |
| 安全性政策 | Markdown | 儲存庫中的 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| 相依性更新 | Dependabot | 針對 npm、pip、Docker、Actions 每週自動產生 PR |

**自行執行掃描：**

下載發行主體清單，並驗證它是由發行工作流程所證明：

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

清單分別記錄 `releaseTag`、`releaseCommit` 與 `workflowTriggerCommit`。請驗證 `releaseCommit` 是從不可變標籤解出的提交，然後根據 `subjects` 中的項目，驗證您所使用的封存檔、映像檔、SBOM 或掃描結果的 SHA-256 摘要。這項區別是刻意設計的：簽出新建立的發行提交，並不會改變工作流程 OIDC 憑證中的提交身分。

您也可以直接掃描下載的 SBOM 或映像檔：

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
映像檔 SBOM 與掃描結果反映的是該發行版本所發布、特定於架構的確切映像檔。封存檔 SBOM 與掃描結果則另外描述預先建置的封存檔。部署後安裝的 AI 模型套件組合因為是在執行階段下載，所以不包含在這些 SBOM 中。
:::
