---
description: "Hướng dẫn tăng cường bảo mật cho SnapOtter. Bảo mật container, cô lập mạng, Docker secrets, triển khai Kubernetes và các tài liệu tuân thủ."
i18n_source_hash: 5cf773ddb4c0
i18n_provenance: machine
i18n_output_hash: d2710e8434af
i18n_hash_version: 2
---

# Bảo mật và tăng cường {#security-hardening}

SnapOtter xử lý tệp hoàn toàn trên hạ tầng của bạn. Theo mặc định, nó gửi phân tích sử dụng sản phẩm và báo cáo sự cố ẩn danh, không chứa nội dung, để giúp cải thiện dự án. Nó không bao giờ gửi tệp, tên tệp, nội dung tệp, kết quả OCR, metadata ảnh hay văn bản tài liệu của bạn. Phản hồi tùy chọn chỉ được gửi sau khi người dùng gửi đi, chỉ khi phân tích được bật, và các trường liên hệ chỉ được đưa vào khi có sự đồng ý liên hệ rõ ràng. Quản trị viên có thể tắt phân tích và thu thập phản hồi chỉ bằng một cú nhấp trong Settings > System > Privacy, không cần build lại. Việc xử lý tệp luôn nằm bên trong container của bạn.

Container chạy dưới một người dùng không phải root chuyên dụng (`snapotter`) với mọi capability Linux bị loại bỏ, trừ tập tối thiểu cần thiết. Để xem chính sách công bố lỗ hổng đầy đủ và kiến trúc bảo mật, hãy xem [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) trên GitHub.

## Tăng cường bảo mật container {#container-hardening}

Các tệp Compose chuẩn [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) và [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) là nguồn tham chiếu chính thức. Đừng sao chép một ví dụ rút gọn vào production; hãy triển khai tệp từ tag bản phát hành mà bạn đã xác minh.

Cả hai stack đều áp dụng các biện pháp kiểm soát sau:

- Giới hạn bộ nhớ, swap, CPU và PID ngăn việc xử lý native mất kiểm soát lan rộng.
- Mọi dịch vụ đều loại bỏ toàn bộ capability Linux. Ứng dụng chỉ thêm lại `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` cho quyền sở hữu volume, việc hạ danh tính một chiều `gosu` và chuyển tiếp tín hiệu êm thấm. PostgreSQL và Redis chỉ nhận tập con mà entrypoint chính thức của chúng cần.
- `security_opt: [no-new-privileges:true]` ngăn các tiến trình trong container ứng dụng, PostgreSQL và Redis giành thêm đặc quyền. Điều này vẫn tương thích với `gosu`: entrypoint bắt đầu với quyền root, chuẩn bị các volume, và chỉ hạ xuống người dùng `snapotter` chuyên dụng.
- Đầu vào image của PostgreSQL và Redis được cố định theo digest. Tương tự, ứng dụng nên được cố định theo tag hoặc digest bản phát hành đã xác minh thay vì `latest`.
- Health check, xoay vòng log JSON có giới hạn, Redis AOF bền vững và chính sách khởi động lại được định nghĩa tập trung trong các tệp chuẩn.

Với triển khai hướng ra internet, hãy gắn cổng 1349 vào loopback và kết thúc TLS tại một reverse proxy được bảo trì. Tạo thông tin xác thực PostgreSQL và Redis riêng biệt, lưu secret trong tệp được bảo vệ hoặc trình quản lý secret, và đổi mật khẩu quản trị ban đầu ngay lập tức.

### Vì sao `read_only` không được đặt {#why-read-only-is-not-set}

`read_only: true` không được đặt vì việc ánh xạ lại PUID/PGID ghi vào `/etc/passwd` và `/etc/group` khi khởi động. Nếu bạn dùng cờ `--user` của Docker hoặc `runAsUser` của Kubernetes thay cho PUID/PGID, bạn có thể bật hệ thống tệp gốc chỉ đọc một cách an toàn.

## Cô lập mạng {#network-isolation}

Việc xử lý tệp diễn ra cục bộ, nhưng bản cài đặt mặc định **không phải là hệ thống không có lưu lượng đi ra**. Phân tích sử dụng sản phẩm ẩn danh dùng PostHog và báo cáo sự cố dùng Sentry khi telemetry được bật. Đặt `SNAPOTTER_TELEMETRY=0` (hoặc tắt phân tích trong Settings > System > Privacy) để tắt cả hai. SnapOtter không bao giờ đưa tệp tải lên, tên tệp, kết quả OCR, văn bản tài liệu hay nội dung tệp khác vào các sự kiện đó.

Lưu lượng đi ra khác phụ thuộc vào tính năng: cài đặt bundle/model AI tải về các đầu vào bản phát hành đã ký; nhập qua URL tải một URL công khai do người dùng yêu cầu; và các tích hợp được cấu hình rõ ràng như OIDC, SAML, OpenTelemetry, webhook, lưu trữ tương thích S3 hoặc tương tự sẽ liên hệ các đích do quản trị viên chọn. Việc tải model khi runtime bị tắt theo mặc định. Chỉ đặt `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` khi bạn muốn chủ động chọn tham gia tải dự phòng tự động. [Nhập bundle ngoại tuyến](/vi/guide/deployment) có thể cung cấp các tính năng AI mà không cần lưu lượng đi ra để tải model khi runtime.

**Khuyến nghị về tường lửa:**

| Tình huống | Quy tắc đi ra |
|---|---|
| Air-gapped | Đặt `SNAPOTTER_TELEMETRY=0` và `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, dùng nhập bundle AI ngoại tuyến, tắt nhập qua URL và các tích hợp bên ngoài, rồi chặn lưu lượng đi ra |
| Telemetry mặc định | Cho phép các endpoint PostHog và Sentry được liệt kê trong log trình duyệt/mạng của bạn; tắt telemetry nếu chính sách không cho phép |
| Cần bundle AI | Trong lúc cài đặt, cho phép HTTPS tới `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; sau đó chặn các host đó |
| Tích hợp bên ngoài | Chỉ cho phép đúng các đích OIDC/SAML/OTLP/webhook/lưu trữ đối tượng do quản trị viên cấu hình |

Các tệp lưu trữ bundle được phục vụ từ kho lưu trữ Xet của Hugging Face, truyền song song qua các endpoint `*.xethub.hf.co` và là lý do việc tải bundle nhiều GB diễn ra nhanh. Nếu tường lửa của bạn cho phép `huggingface.co` nhưng chặn `*.xethub.hf.co`, việc cài đặt vẫn thành công nhưng chuyển sang tải một luồng chậm hơn, vì vậy hãy đưa các host Xet vào danh sách cho phép để giữ đường nhanh. Cài đặt hoàn toàn ngoại tuyến có thể bỏ qua tất cả điều này và dùng [Nhập bundle ngoại tuyến](/vi/guide/deployment) thay thế.

Về cấu hình reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels), xem [hướng dẫn Triển khai](/vi/guide/deployment#reverse-proxy).

## Docker Secrets {#docker-secrets}

Với triển khai production, hãy tránh truyền secret dưới dạng biến môi trường văn bản thuần. Entrypoint hỗ trợ quy ước `_FILE` của Docker: mount secret dưới dạng tệp và đặt biến `_FILE` tương ứng thành đường dẫn của nó.

**Các secret được hỗ trợ:**

| Biến | Tương đương `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Ví dụ với Docker Compose secrets:**

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
Docker Compose secrets (không dùng Swarm) yêu cầu Compose v2.23 trở lên.
:::

## Triển khai Kubernetes {#kubernetes-deployment}

Entrypoint phát hiện khi container đã chạy với quyền không phải root (ví dụ qua `runAsUser` của Kubernetes) và tự động bỏ qua bước hạ đặc quyền bằng gosu. Trong trường hợp đó, nó không thể tự chown các volume đã mount, nên nó xác minh các volume có ghi được hay không và thoát sớm kèm hướng dẫn cụ thể nếu không. Xem [Quyền lưu trữ](/vi/guide/deployment#storage-permissions) cho `fsGroup` và các thiết lập UID ngoại lai (TrueNAS, OpenShift).

**SecurityContext của Pod được khuyến nghị:**

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

Vì `runAsUser: 999` được đặt ở cấp pod, entrypoint bỏ qua hoàn toàn gosu. Điều này cho phép dùng các capability `allowPrivilegeEscalation: false` và `drop: [ALL]` mà không xung đột.

Về việc xác định kích thước tài nguyên, xem [Yêu cầu phần cứng](/vi/guide/deployment#hardware-requirements).

## Sao lưu và khôi phục {#backup-and-recovery}

Stack Compose production định nghĩa bốn volume. Hãy dừng lưu lượng vào và để các job đang chạy hoàn tất trước khi sao lưu đồng bộ, để PostgreSQL, Redis và trạng thái tệp mô tả cùng một thời điểm.

| Volume | Nội dung | Cách xử lý khi khôi phục |
|---|---|---|
| `SnapOtter-pgdata` | Người dùng, cài đặt, pipeline, job, metadata tệp và nhật ký kiểm toán của PostgreSQL | Quan trọng; dùng bản dump logic dừng ngay khi lỗi để khôi phục có thể di chuyển |
| `SnapOtter-data` | Các đối tượng thư viện đã lưu, log và trạng thái AI (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | Sao lưu toàn bộ volume; để tiết kiệm dung lượng, có thể cố ý bỏ toàn bộ trạng thái AI và cài lại các bundle |
| `SnapOtter-redisdata` | Redis AOF cho trạng thái hàng đợi BullMQ bền vững | Sao lưu sau khi tạm dừng ứng dụng và buộc `SAVE`; cần thiết để tiếp tục chính xác công việc trong hàng đợi |
| `SnapOtter-workspace` | Khóa lưu trữ đối tượng tạm thời (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | Không sao lưu sau khi mọi job đã được xả hoặc hủy; không bao giờ bỏ nó khi còn job đang hoạt động |

Compose thường thêm tên dự án làm tiền tố cho tên volume. Hãy xác định volume nguồn thực từ container đã mount thay vì giả định rằng tên hiển thị như `SnapOtter-data` là tên volume Docker.

### Sao lưu cơ sở dữ liệu {#database-backup}

Dùng định dạng archive tùy chỉnh của PostgreSQL và xác minh archive trước khi coi bản sao lưu là hoàn tất:

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

Hãy kiểm thử mọi bản sao lưu bằng cách khôi phục vào một stack cô lập, kiểm tra các bản ghi cơ sở dữ liệu và checksum của tệp, rồi khởi động ứng dụng. `tests/qa/backup-restore-drill.sh` của kho mã tự động hóa cổng kiểm tra bản phát hành đó trên một `QA_IMAGE` cụ thể.

Nếu nền tảng của bạn chụp snapshot volume nhất quán khi sập thay vào đó, hãy dừng toàn bộ stack trước và chụp snapshot tất cả volume quan trọng như một bộ. Sao chép thô thư mục dữ liệu PostgreSQL từ một container đang chạy không phải là bản sao lưu logic được hỗ trợ.

### Sao lưu tệp và hàng đợi {#file-and-queue-backup}

Hãy tạm dừng ứng dụng trước khi chụp các volume tệp và hàng đợi. Dùng `docker inspect` để xác định tên volume thực, buộc Redis lưu trạng thái hiện tại, và lưu trữ với quyền sở hữu và quyền truy cập được giữ nguyên:

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

Khởi động lại Redis trước ứng dụng. Nếu bạn cố ý loại `/data/ai`, hãy xóa toàn bộ cây AI thay vì giữ lại bản ghi `installed.json` mà không có model hoặc môi trường ảo của nó. Giữ các tệp sao lưu được mã hóa, có kiểm soát truy cập và tách biệt khỏi máy chủ đang chạy SnapOtter.

## Tài liệu tuân thủ {#compliance-artifacts}

Mỗi bản phát hành SnapOtter bao gồm các tài liệu bảo mật sau:

| Tài liệu | Định dạng | Nơi tìm |
|---|---|---|
| Ràng buộc chủ thể bản phát hành | JSON chuẩn tắc + GitHub attestation | Asset của [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| SBOM của archive | CycloneDX và SPDX JSON | Asset của bản phát hành: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| SBOM của image | CycloneDX và SPDX JSON | Asset của bản phát hành: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Quét lỗ hổng | Trivy JSON | Asset của bản phát hành với tiền tố `archive-linux-{arch}` hoặc `image-linux-{arch}` tương ứng |
| Quét lỗ hổng | SARIF | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Phân tích tĩnh | CodeQL (JS/TS + Python) | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), chạy hằng tuần + mỗi PR |
| Rà soát phụ thuộc | GitHub native | Kiểm tra theo từng PR, thất bại khi thêm phụ thuộc có mức độ nghiêm trọng cao |
| Kiểm toán phụ thuộc Python | pip-audit | Log CI ở mỗi lần push |
| Chính sách bảo mật | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) trong kho mã |
| Cập nhật phụ thuộc | Dependabot | PR tự động hằng tuần cho npm, pip, Docker, Actions |

**Tự chạy quét:**

Tải manifest chủ thể bản phát hành và xác minh rằng nó đã được workflow phát hành attest:

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Manifest ghi riêng `releaseTag`, `releaseCommit` và `workflowTriggerCommit`. Hãy xác minh rằng `releaseCommit` là commit được peel từ tag bất biến, sau đó xác minh digest SHA-256 của archive, image, SBOM hoặc bản quét mà bạn dùng so với mục tương ứng trong `subjects`. Sự phân biệt này là có chủ đích: việc checkout một commit bản phát hành mới tạo không làm thay đổi danh tính commit trong thông tin xác thực OIDC của workflow.

Bạn cũng có thể quét trực tiếp một SBOM đã tải hoặc image:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
SBOM và bản quét của image phản ánh đúng image theo kiến trúc cụ thể được phát hành cho bản phát hành đó. SBOM và bản quét của archive mô tả riêng archive dựng sẵn. Các bundle model AI được cài sau khi triển khai không nằm trong các SBOM này vì chúng được tải khi runtime.
:::
