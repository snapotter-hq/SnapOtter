---
description: "คู่มือการเสริมความปลอดภัยสำหรับ SnapOtter ความปลอดภัยของคอนเทนเนอร์ การแยกเครือข่าย Docker secrets การปรับใช้บน Kubernetes และสิ่งประกอบด้านการปฏิบัติตามข้อกำหนด"
i18n_source_hash: c682d19a84ce
i18n_provenance: human
i18n_output_hash: 026f80a88f27
---

# ความปลอดภัยและการเสริมความแข็งแกร่ง {#security-hardening}

SnapOtter ประมวลผลไฟล์ทั้งหมดบนโครงสร้างพื้นฐานของคุณเอง โดยจะส่งข้อมูลวิเคราะห์ผลิตภัณฑ์แบบไม่ระบุตัวตนและไม่มีเนื้อหา รวมถึงรายงานข้อขัดข้องตามค่าเริ่มต้นเพื่อช่วยปรับปรุงโครงการ ระบบจะไม่ส่งไฟล์ ชื่อไฟล์ เนื้อหาไฟล์ ผลลัพธ์ OCR เมทาดาทาของรูปภาพ หรือข้อความในเอกสารของคุณ ความคิดเห็นที่เป็นทางเลือกจะถูกส่งเฉพาะหลังจากที่ผู้ใช้ส่งเท่านั้น เฉพาะเมื่อเปิดใช้งานการวิเคราะห์ และช่องข้อมูลติดต่อจะถูกรวมไว้เฉพาะเมื่อมีการยินยอมให้ติดต่ออย่างชัดเจนเท่านั้น ผู้ดูแลระบบสามารถปิดการวิเคราะห์และการเก็บความคิดเห็นได้ในคลิกเดียวภายใต้ Settings > System > Privacy โดยไม่ต้องสร้างอิมเมจใหม่ การประมวลผลไฟล์จะอยู่ภายในคอนเทนเนอร์ของคุณเสมอ

คอนเทนเนอร์ทำงานในฐานะผู้ใช้ที่ไม่ใช่ root โดยเฉพาะ (`snapotter`) โดยตัด Linux capabilities ทั้งหมดออกยกเว้นชุดขั้นต่ำที่จำเป็น สำหรับนโยบายการเปิดเผยช่องโหว่ฉบับเต็มและสถาปัตยกรรมความปลอดภัย โปรดดู [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) บน GitHub

## การเสริมความแข็งแกร่งของคอนเทนเนอร์ {#container-hardening}

[docker-compose.yml เริ่มต้น](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) มีการเสริมความปลอดภัยสำหรับการใช้งานจริง นี่คือรายละเอียดของแต่ละตัวเลือกและเหตุผลว่าทำไมจึงสำคัญ:

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

### เหตุใดจึงไม่ตั้งค่า `no-new-privileges` {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` ถูกละเว้นโดยตั้งใจ entrypoint เริ่มต้นในฐานะ root เพื่อแก้ไขความเป็นเจ้าของของวอลุ่ม จากนั้นจึงลดสิทธิ์ลงเป็นผู้ใช้ `snapotter` ผ่าน [gosu](https://github.com/tianon/gosu) ซึ่งต้องใช้ setuid เมื่อการลดสิทธิ์เสร็จสมบูรณ์ กระบวนการจะทำงานในฐานะ `snapotter` โดยตัด capabilities ทั้งหมดออกยกเว้นห้ารายการที่ระบุไว้ข้างต้น

หากคุณใช้ Kubernetes หรือแฟล็ก `--user` ของ Docker เพื่อทำงานในฐานะที่ไม่ใช่ root โดยตรง (ข้าม gosu) การเปิดใช้งาน `no-new-privileges` ก็ปลอดภัย

### เหตุใดจึงไม่ตั้งค่า `read_only` {#why-read-only-is-not-set}

`read_only: true` ไม่ได้ถูกตั้งค่าเพราะการรีแมป PUID/PGID เขียนไปยัง `/etc/passwd` และ `/etc/group` ตอนเริ่มต้น หากคุณใช้แฟล็ก `--user` ของ Docker หรือ `runAsUser` ของ Kubernetes แทน PUID/PGID คุณสามารถเปิดใช้งานระบบไฟล์รากแบบอ่านอย่างเดียวได้อย่างปลอดภัย

## การแยกเครือข่าย {#network-isolation}

ระหว่างการทำงานปกติ คอนเทนเนอร์จะไม่มี **การเชื่อมต่อเครือข่ายขาออกใด ๆ** การประมวลผลไฟล์ทั้งหมดเกิดขึ้นภายในเครื่องโดยใช้ไลบรารีที่มาพร้อมกัน

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

ข้อยกเว้นเดียวคือ **การดาวน์โหลดโมเดล AI**: เมื่อผู้ใช้ติดตั้งชุดคุณสมบัติ AI ผ่าน UI คอนเทนเนอร์จะดาวน์โหลดไฟล์โมเดลจาก GitHub Releases และ PyPI การดาวน์โหลดเหล่านี้เกิดขึ้นครั้งเดียวต่อชุด และถูกจัดเก็บไว้ในวอลุ่ม `/data`

**คำแนะนำเกี่ยวกับไฟร์วอลล์:**

| สถานการณ์ | กฎขาออก |
|---|---|
| แบบ Air-gapped (ไม่มี AI) | บล็อกทราฟฟิกขาออกทั้งหมดจากคอนเทนเนอร์ |
| ต้องการชุด AI | อนุญาต HTTPS ไปยัง `github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org` ระหว่างการติดตั้ง จากนั้นบล็อก |
| หลังการติดตั้ง AI | บล็อกทราฟฟิกขาออกทั้งหมด - โมเดลถูกแคชไว้ภายในเครื่อง |

สำหรับการกำหนดค่า reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels) โปรดดู [คู่มือการปรับใช้งาน](/th/guide/deployment#reverse-proxy)

## Docker Secrets {#docker-secrets}

สำหรับการปรับใช้งานจริง หลีกเลี่ยงการส่งข้อมูลลับเป็นตัวแปรสภาพแวดล้อมแบบข้อความธรรมดา entrypoint รองรับข้อตกลง `_FILE` ของ Docker: เมานต์ข้อมูลลับเป็นไฟล์และตั้งค่าตัวแปร `_FILE` ที่สอดคล้องกันให้ชี้ไปยังพาธของไฟล์

**ข้อมูลลับที่รองรับ:**

| ตัวแปร | เทียบเท่า `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**ตัวอย่างการใช้ Docker Compose secrets:**

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
Docker Compose secrets (โดยไม่ใช้ Swarm) ต้องใช้ Compose v2.23 ขึ้นไป
:::

## การปรับใช้บน Kubernetes {#kubernetes-deployment}

entrypoint จะตรวจจับเมื่อคอนเทนเนอร์ทำงานในฐานะที่ไม่ใช่ root อยู่แล้ว (เช่น ผ่าน `runAsUser` ของ Kubernetes) และข้ามการลดสิทธิ์ gosu โดยอัตโนมัติ ในกรณีนั้นมันไม่สามารถ chown วอลุ่มที่เมานต์ไว้ได้ด้วยตัวเอง จึงตรวจสอบว่าวอลุ่มเหล่านั้นเขียนได้และออกก่อนเวลาพร้อมคำแนะนำที่นำไปปฏิบัติได้หากเขียนไม่ได้ โปรดดู [สิทธิ์การจัดเก็บ](/th/guide/deployment#storage-permissions) สำหรับการตั้งค่า `fsGroup` และการตั้งค่า UID ต่างประเทศ (TrueNAS, OpenShift)

**SecurityContext ของ Pod ที่แนะนำ:**

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

เนื่องจาก `runAsUser: 999` ถูกตั้งค่าที่ระดับ pod entrypoint จึงข้าม gosu ทั้งหมด สิ่งนี้ทำให้ capabilities `allowPrivilegeEscalation: false` และ `drop: [ALL]` ทำงานได้โดยไม่ขัดแย้งกัน

สำหรับการกำหนดขนาดทรัพยากร โปรดดู [ข้อกำหนดฮาร์ดแวร์](/th/guide/deployment#hardware-requirements)

## การสำรองข้อมูลและการกู้คืน {#backup-and-recovery}

สถานะแบบถาวรถูกแบ่งออกเป็นสองวอลุ่ม:

| วอลุ่ม | เนื้อหา | สำคัญหรือไม่ |
|---|---|---|
| `SnapOtter-pgdata` | ฐานข้อมูล PostgreSQL (ผู้ใช้ การตั้งค่า ไปป์ไลน์ งาน บันทึกการตรวจสอบ) | สำคัญ |
| `/data` (วอลุ่มแอป) | ไฟล์ที่ผู้ใช้อัปโหลด โมเดล AI, Python venv | บางส่วน (ดูด้านล่าง) |

ภายในวอลุ่ม `/data`:

| พาธ | เนื้อหา | สำคัญหรือไม่ |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | ไฟล์ผู้ใช้และผลลัพธ์การประมวลผล | สำคัญ |
| `/data/ai/` | ไฟล์โมเดล AI ที่ดาวน์โหลดมา | ไม่ (ดาวน์โหลดใหม่ได้) |
| `/data/venv/` | สภาพแวดล้อมเสมือน Python | ไม่ (สร้างใหม่ตอนเริ่มต้น) |

### การสำรองฐานข้อมูล {#database-backup}

ใช้ `pg_dump` เพื่อสำรองฐานข้อมูลขณะที่สแตกกำลังทำงาน:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

อีกทางเลือกหนึ่งคือ หยุดสแตกและทำสแนปช็อตวอลุ่ม `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### การสำรองไฟล์ผู้ใช้ {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

โมเดล AI มีขนาดรวมกันสูงสุดประมาณ 24 GB สำหรับทุกชุด เนื่องจากดาวน์โหลดใหม่ได้ จึงควรยกเว้น `/data/ai/` และ `/data/venv/` จากการสำรองข้อมูลเพื่อประหยัดพื้นที่ มีเพียงฐานข้อมูลและไฟล์ผู้ใช้เท่านั้นที่สำคัญ

## สิ่งประกอบด้านการปฏิบัติตามข้อกำหนด {#compliance-artifacts}

SnapOtter แต่ละรุ่นจะมีสิ่งประกอบด้านความปลอดภัยดังต่อไปนี้:

| สิ่งประกอบ | รูปแบบ | ที่ที่จะพบได้ |
|---|---|---|
| SBOM (CycloneDX) | JSON | สินทรัพย์ [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | สินทรัพย์ [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| การสแกนช่องโหว่ | Trivy JSON | สินทรัพย์ [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| การสแกนช่องโหว่ | SARIF | แท็บ [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| การวิเคราะห์แบบสถิต | CodeQL (JS/TS + Python) | แท็บ [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), รันทุกสัปดาห์ + ต่อ PR |
| การตรวจทานการพึ่งพา | GitHub เนทีฟ | การตรวจสอบต่อ PR, ล้มเหลวเมื่อมีการเพิ่มที่มีความรุนแรงสูง |
| การตรวจสอบการพึ่งพา Python | pip-audit | บันทึกการรัน CI ในทุกการ push |
| นโยบายความปลอดภัย | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) ในที่เก็บ |
| การอัปเดตการพึ่งพา | Dependabot | PR อัตโนมัติรายสัปดาห์สำหรับ npm, pip, Docker, Actions |

**การรันสแกนของคุณเอง:**

ดาวน์โหลด SBOM จากรุ่นและสแกนด้วยเครื่องมือที่คุณต้องการ:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM และการสแกนช่องโหว่สะท้อนอิมเมจที่เผยแพร่จริงสำหรับรุ่นนั้น ชุดโมเดล AI ที่ติดตั้งหลังการปรับใช้งานจะไม่รวมอยู่ใน SBOM เนื่องจากดาวน์โหลดในระหว่างรันไทม์
:::
