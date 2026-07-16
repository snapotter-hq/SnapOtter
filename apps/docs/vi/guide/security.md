---
description: "Hướng dẫn tăng cường bảo mật cho SnapOtter. Bảo mật container, cô lập mạng, Docker secret, triển khai Kubernetes, và các tài liệu tuân thủ."
i18n_source_hash: 986f7658430c
i18n_provenance: human
i18n_output_hash: 3eec3ab8360c
---

# Bảo mật & Tăng cường {#security-hardening}

SnapOtter xử lý tập tin hoàn toàn trên hạ tầng của bạn. Nó gửi phân tích sản phẩm và báo cáo sự cố ẩn danh, không chứa nội dung, theo mặc định để giúp cải thiện dự án. Nó không bao giờ gửi tập tin, tên tập tin, nội dung tập tin, kết quả OCR, metadata hình ảnh, hoặc văn bản tài liệu của bạn. Phản hồi tùy chọn chỉ được gửi sau khi người dùng gửi nó, chỉ khi phân tích được bật, và các trường liên hệ chỉ được bao gồm khi có sự đồng ý liên hệ tường minh. Một quản trị viên có thể tắt việc thu thập phân tích và phản hồi chỉ với một cú nhấp trong mục Settings > System > Privacy, không cần xây dựng lại. Việc xử lý tập tin luôn ở bên trong container của bạn.

Container chạy dưới danh nghĩa một người dùng không phải root chuyên dụng (`snapotter`) với tất cả các capability của Linux được loại bỏ ngoại trừ tập tối thiểu cần thiết. Để xem đầy đủ chính sách công bố lỗ hổng và kiến trúc bảo mật, xem [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) trên GitHub.

## Tăng cường Container {#container-hardening}

[docker-compose.yml mặc định](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) bao gồm việc tăng cường bảo mật cho production. Dưới đây là phân tích từng tùy chọn và lý do nó quan trọng:

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

### Tại sao `no-new-privileges` không được đặt {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` được cố ý bỏ qua. Entrypoint khởi động dưới danh nghĩa root để sửa quyền sở hữu volume, rồi hạ xuống người dùng `snapotter` thông qua [gosu](https://github.com/tianon/gosu), vốn yêu cầu setuid. Một khi việc hạ đặc quyền hoàn tất, tiến trình chạy dưới danh nghĩa `snapotter` với tất cả các capability được loại bỏ ngoại trừ năm capability được liệt kê ở trên.

Nếu bạn dùng Kubernetes hoặc cờ `--user` của Docker để chạy trực tiếp dưới danh nghĩa không phải root (bỏ qua gosu), thì `no-new-privileges` an toàn để bật.

### Tại sao `read_only` không được đặt {#why-read-only-is-not-set}

`read_only: true` không được đặt vì việc ánh xạ lại PUID/PGID ghi vào `/etc/passwd` và `/etc/group` khi khởi động. Nếu bạn dùng cờ `--user` của Docker hoặc `runAsUser` của Kubernetes thay cho PUID/PGID, bạn có thể an toàn bật hệ thống tập tin gốc chỉ đọc.

## Cô lập mạng {#network-isolation}

Trong quá trình vận hành bình thường, container tạo ra **không có kết nối mạng đi ra nào**. Tất cả việc xử lý tập tin diễn ra cục bộ bằng các thư viện đi kèm.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

Ngoại lệ duy nhất là **tải mô hình AI**: khi một người dùng cài đặt một bundle tính năng AI thông qua giao diện, container tải kho lưu trữ bundle được dựng sẵn từ Hugging Face, cùng với một vài tập tin mô hình riêng lẻ từ GitHub Releases, Google Storage, và PyPI. Các bản tải này diễn ra một lần cho mỗi bundle và được lưu trong volume `/data`.

**Khuyến nghị về tường lửa:**

| Kịch bản | Quy tắc đi ra |
|---|---|
| Cách ly mạng (không có AI) | Chặn toàn bộ lưu lượng đi ra từ container |
| Cần bundle AI | Cho phép HTTPS đến `huggingface.co`, `*.xethub.hf.co`, `cdn-lfs.huggingface.co`, `github.com`, `objects.githubusercontent.com`, `storage.googleapis.com`, `pypi.org`, `files.pythonhosted.org` trong lúc cài đặt, rồi chặn |
| Sau khi cài AI | Chặn toàn bộ lưu lượng đi ra, các mô hình được lưu cache cục bộ |

Các kho lưu trữ bundle được phục vụ từ kho Xet của Hugging Face, vốn truyền qua các endpoint `*.xethub.hf.co` song song và là điều làm cho các bản tải bundle nhiều GB nhanh. Nếu tường lửa của bạn cho phép `huggingface.co` nhưng chặn `*.xethub.hf.co`, việc cài đặt vẫn thành công nhưng chuyển về một bản tải luồng đơn chậm hơn, nên hãy đưa các host Xet vào danh sách cho phép để duy trì trên đường nhanh. Các bản cài đặt hoàn toàn ngoại tuyến có thể bỏ qua tất cả những điều này và dùng [Nhập Bundle Ngoại tuyến](/vi/guide/deployment) thay thế.

Để cấu hình reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels), xem [hướng dẫn Triển khai](/vi/guide/deployment#reverse-proxy).

## Docker Secret {#docker-secrets}

Đối với các triển khai production, tránh truyền secret dưới dạng biến môi trường văn bản thuần. Entrypoint hỗ trợ quy ước `_FILE` của Docker: mount một secret dưới dạng một tập tin và đặt biến `_FILE` tương ứng thành đường dẫn của nó.

**Các secret được hỗ trợ:**

| Biến | Tương đương `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Ví dụ với Docker Compose secret:**

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
Docker Compose secret (không dùng Swarm) yêu cầu Compose v2.23 trở lên.
:::

## Triển khai Kubernetes {#kubernetes-deployment}

Entrypoint phát hiện khi container đã chạy sẵn dưới danh nghĩa không phải root (ví dụ, thông qua `runAsUser` của Kubernetes) và tự động bỏ qua việc hạ đặc quyền gosu. Trong trường hợp đó nó không thể tự chown các volume đã mount, nên nó xác minh rằng chúng có thể ghi được và thoát sớm với hướng dẫn khả thi nếu chúng không thể ghi, xem [Quyền lưu trữ](/vi/guide/deployment#storage-permissions) cho các thiết lập `fsGroup` và UID lạ (TrueNAS, OpenShift).

**SecurityContext khuyến nghị cho Pod:**

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

Vì `runAsUser: 999` được đặt ở cấp pod, entrypoint bỏ qua hoàn toàn gosu. Điều này cho phép các capability `allowPrivilegeEscalation: false` và `drop: [ALL]` mà không xung đột.

Để xác định kích cỡ tài nguyên, xem [Yêu cầu phần cứng](/vi/guide/deployment#hardware-requirements).

## Sao lưu và Khôi phục {#backup-and-recovery}

Trạng thái bền vững được chia trên hai volume:

| Volume | Nội dung | Quan trọng? |
|---|---|---|
| `SnapOtter-pgdata` | Cơ sở dữ liệu PostgreSQL (người dùng, cài đặt, pipeline, tác vụ, nhật ký kiểm toán) | Có |
| `/data` (volume app) | Tập tin do người dùng tải lên, mô hình AI, venv Python | Một phần (xem bên dưới) |

Bên trong volume `/data`:

| Đường dẫn | Nội dung | Quan trọng? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Tập tin người dùng và kết quả xử lý | Có |
| `/data/ai/` | Các tập tin mô hình AI đã tải về | Không (có thể tải lại) |
| `/data/venv/` | Môi trường ảo Python | Không (được dựng lại khi khởi động) |

### Sao lưu cơ sở dữ liệu {#database-backup}

Dùng `pg_dump` để sao lưu cơ sở dữ liệu trong khi stack đang chạy:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Hoặc, dừng stack và chụp snapshot volume `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Sao lưu tập tin người dùng {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

Các mô hình AI tổng cộng lên đến khoảng 24 GB trên tất cả các bundle. Vì chúng có thể tải lại, hãy loại trừ `/data/ai/` và `/data/venv/` khỏi các bản sao lưu để tiết kiệm dung lượng. Chỉ cơ sở dữ liệu và tập tin người dùng là quan trọng.

## Tài liệu tuân thủ {#compliance-artifacts}

Mỗi bản phát hành SnapOtter bao gồm các tài liệu bảo mật sau:

| Tài liệu | Định dạng | Nơi tìm |
|---|---|---|
| SBOM (CycloneDX) | JSON | Asset [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | Asset [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| Quét lỗ hổng | Trivy JSON | Asset [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| Quét lỗ hổng | SARIF | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Phân tích tĩnh | CodeQL (JS/TS + Python) | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), chạy hàng tuần + mỗi PR |
| Đánh giá phụ thuộc | GitHub native | Kiểm tra mỗi PR, thất bại khi thêm phụ thuộc có mức độ nghiêm trọng cao |
| Kiểm toán phụ thuộc Python | pip-audit | Log chạy CI trên mỗi lần push |
| Chính sách bảo mật | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) trong kho |
| Cập nhật phụ thuộc | Dependabot | PR tự động hàng tuần cho npm, pip, Docker, Actions |

**Chạy bản quét của riêng bạn:**

Tải SBOM từ bản phát hành và quét nó bằng công cụ bạn ưa thích:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM và bản quét lỗ hổng phản ánh chính xác image được phát hành cho bản phát hành đó. Các bundle mô hình AI được cài đặt sau khi triển khai không được bao gồm trong SBOM vì chúng được tải về khi chạy.
:::
