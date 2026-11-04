---
description: "คู่มือการเสริมความปลอดภัยสำหรับ SnapOtter ครอบคลุมความปลอดภัยของคอนเทนเนอร์ การแยกเครือข่าย Docker secrets การติดตั้งบน Kubernetes และเอกสารด้านการปฏิบัติตามข้อกำหนด"
i18n_source_hash: 630381c08cde
i18n_provenance: machine
i18n_output_hash: a466b34ec0a4
i18n_hash_version: 2
---

# ความปลอดภัยและการเสริมความแข็งแกร่ง {#security-hardening}

SnapOtter ประมวลผลไฟล์ทั้งหมดบนโครงสร้างพื้นฐานของคุณเอง โดยเป็นค่าเริ่มต้นจะส่งข้อมูลวิเคราะห์ผลิตภัณฑ์และรายงานข้อขัดข้องแบบไม่ระบุตัวตนและไม่มีเนื้อหา เพื่อช่วยพัฒนาโปรเจกต์ SnapOtter ไม่ส่งไฟล์ ชื่อไฟล์ เนื้อหาไฟล์ ผลลัพธ์ OCR เมทาดาทาของภาพ หรือข้อความในเอกสารของคุณเลย ข้อเสนอแนะแบบเลือกส่งจะถูกส่งหลังจากผู้ใช้กดส่งเท่านั้น และเมื่อเปิดใช้งานการวิเคราะห์เท่านั้น ส่วนช่องข้อมูลติดต่อจะรวมไว้ก็ต่อเมื่อได้รับความยินยอมในการติดต่ออย่างชัดเจน ผู้ดูแลระบบปิดการวิเคราะห์และการรับข้อเสนอแนะได้ด้วยการคลิกเพียงครั้งเดียวที่ Settings > System > Privacy โดยไม่ต้องสร้างใหม่ การประมวลผลไฟล์อยู่ภายในคอนเทนเนอร์ของคุณเสมอ

คอนเทนเนอร์รันในฐานะผู้ใช้เฉพาะที่ไม่ใช่ root (`snapotter`) โดยถอด Linux capability ทั้งหมดออก เหลือไว้เพียงชุดขั้นต่ำที่จำเป็น สำหรับนโยบายการเปิดเผยช่องโหว่ฉบับเต็มและสถาปัตยกรรมความปลอดภัย ดู [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) บน GitHub

## การเสริมความแข็งแกร่งของคอนเทนเนอร์ {#container-hardening}

ไฟล์ Compose มาตรฐานสำหรับ [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) และ [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) เป็นแหล่งอ้างอิงที่ถูกต้องที่สุด อย่าคัดลอกตัวอย่างแบบย่อไปใช้งานจริง ให้ติดตั้งไฟล์จากแท็กรุ่นที่คุณตรวจสอบแล้ว

ทั้งสองสแต็กใช้มาตรการต่อไปนี้:

- ขีดจำกัดหน่วยความจำ swap CPU และ PID ช่วยควบคุมการประมวลผลเนทีฟที่ทำงานเกินการควบคุม
- ทุกบริการถอด Linux capability ทั้งหมดออก แอปพลิเคชันเพิ่มกลับมาเพียง `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` สำหรับความเป็นเจ้าของวอลุ่ม การลดสิทธิ์ตัวตน `gosu` แบบทางเดียว และการส่งต่อสัญญาณอย่างเรียบร้อย PostgreSQL และ Redis ได้รับเฉพาะชุดย่อยที่ entrypoint อย่างเป็นทางการของแต่ละตัวต้องใช้
- `security_opt: [no-new-privileges:true]` ป้องกันไม่ให้โพรเซสในคอนเทนเนอร์แอปพลิเคชัน PostgreSQL และ Redis ได้รับสิทธิ์เพิ่มเติม ซึ่งยังเข้ากันได้กับ `gosu` โดย entrypoint เริ่มต้นด้วย root เตรียมวอลุ่ม แล้วลดสิทธิ์ลงเป็นผู้ใช้เฉพาะ `snapotter` เท่านั้น
- อินพุตอิมเมจของ PostgreSQL และ Redis ถูกตรึงด้วย digest ส่วนแอปพลิเคชันก็ควรถูกตรึงไว้กับแท็กรุ่นหรือ digest ที่ตรวจสอบแล้วเช่นกัน แทนที่จะใช้ `latest`
- การตรวจสอบสถานะ การหมุนเวียนบันทึก JSON แบบจำกัดขนาด Redis AOF แบบคงทน และนโยบายการรีสตาร์ท ถูกกำหนดไว้ศูนย์กลางในไฟล์มาตรฐาน

สำหรับการติดตั้งที่เปิดสู่อินเทอร์เน็ต ให้ผูกพอร์ต 1349 กับ loopback และยุติ TLS ที่ reverse proxy ที่มีการดูแลอยู่ สร้างข้อมูลประจำตัว PostgreSQL และ Redis ที่ไม่ซ้ำกัน เก็บความลับไว้ในไฟล์ที่มีการป้องกันหรือตัวจัดการความลับ และเปลี่ยนรหัสผ่านผู้ดูแลระบบเริ่มต้นทันที

### เหตุใดจึงไม่ตั้งค่า `read_only` {#why-read-only-is-not-set}

`read_only: true` ไม่ได้ถูกตั้งค่า เพราะการแมป PUID/PGID ใหม่เขียนลงใน `/etc/passwd` และ `/etc/group` ตอนเริ่มต้น หากคุณใช้แฟล็ก `--user` ของ Docker หรือ `runAsUser` ของ Kubernetes แทน PUID/PGID คุณสามารถเปิดใช้ระบบไฟล์ root แบบอ่านอย่างเดียวได้อย่างปลอดภัย

## การแยกเครือข่าย {#network-isolation}

การประมวลผลไฟล์เกิดขึ้นในเครื่อง แต่การติดตั้งค่าเริ่มต้น**ไม่ใช่ระบบที่ไม่มีทราฟฟิกขาออก** การวิเคราะห์ผลิตภัณฑ์แบบไม่ระบุตัวตนใช้ PostHog และการรายงานข้อขัดข้องใช้ Sentry เมื่อเปิดใช้งานเทเลเมทรี ตั้งค่า `SNAPOTTER_TELEMETRY=0` (หรือปิดการวิเคราะห์ที่ Settings > System > Privacy) เพื่อปิดทั้งสองอย่าง SnapOtter ไม่รวมไฟล์ที่อัปโหลด ชื่อไฟล์ ผลลัพธ์ OCR ข้อความในเอกสาร หรือเนื้อหาไฟล์อื่นใดในเหตุการณ์เหล่านั้น

ทราฟฟิกขาออกอื่น ๆ ขึ้นอยู่กับฟีเจอร์ การติดตั้งบันเดิล AI/โมเดลดาวน์โหลดอินพุตรุ่นที่ลงนามแล้ว การนำเข้า URL ดึงข้อมูลจาก URL สาธารณะที่ผู้ใช้ร้องขอ และการผสานรวมที่ตั้งค่าไว้อย่างชัดเจน เช่น OIDC, SAML, OpenTelemetry, webhook, ที่เก็บข้อมูลที่เข้ากันได้กับ S3 หรือสิ่งที่คล้ายกัน จะติดต่อปลายทางที่ผู้ดูแลระบบเลือก การดาวน์โหลดโมเดลขณะรันถูกปิดไว้เป็นค่าเริ่มต้น ตั้งค่า `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` เฉพาะเมื่อต้องการเลือกเปิดการดาวน์โหลดสำรองอัตโนมัติอย่างชัดเจน [การนำเข้าบันเดิลแบบออฟไลน์](/th/guide/deployment) สามารถจัดเตรียมฟีเจอร์ AI ได้โดยไม่มีทราฟฟิกขาออกของโมเดลขณะรัน

**คำแนะนำสำหรับไฟร์วอลล์:**

| สถานการณ์ | กฎขาออก |
|---|---|
| Air-gapped | ตั้งค่า `SNAPOTTER_TELEMETRY=0` และ `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0` ใช้การนำเข้าบันเดิล AI แบบออฟไลน์ ปิดการนำเข้า URL และการผสานรวมภายนอก แล้วบล็อกทราฟฟิกขาออก |
| เทเลเมทรีค่าเริ่มต้น | อนุญาตเอ็นด์พอยต์ PostHog และ Sentry ที่ระบุไว้ในบันทึกเบราว์เซอร์/เครือข่ายของคุณ ปิดเทเลเมทรีหากนโยบายไม่อนุญาต |
| ต้องใช้บันเดิล AI | ระหว่างการติดตั้ง อนุญาต HTTPS ไปยัง `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org` แล้วบล็อกโฮสต์เหล่านั้น |
| การผสานรวมภายนอก | อนุญาตเฉพาะปลายทาง OIDC/SAML/OTLP/webhook/ที่เก็บอ็อบเจกต์ที่ผู้ดูแลระบบกำหนดไว้ตรงตัวเท่านั้น |

ไฟล์บันเดิลถูกให้บริการจากที่เก็บข้อมูล Xet ของ Hugging Face ซึ่งถ่ายโอนผ่านเอ็นด์พอยต์ `*.xethub.hf.co` แบบขนาน และเป็นสิ่งที่ทำให้การดาวน์โหลดบันเดิลขนาดหลาย GB เร็วขึ้น หากไฟร์วอลล์ของคุณอนุญาต `huggingface.co` แต่บล็อก `*.xethub.hf.co` การติดตั้งจะยังสำเร็จ แต่จะย้อนกลับไปดาวน์โหลดแบบสตรีมเดียวที่ช้ากว่า ดังนั้นควรเพิ่มโฮสต์ Xet ในรายการที่อนุญาตเพื่อให้ใช้เส้นทางที่เร็ว การติดตั้งแบบออฟไลน์เต็มรูปแบบข้ามขั้นตอนทั้งหมดนี้ได้ และใช้ [การนำเข้าบันเดิลแบบออฟไลน์](/th/guide/deployment) แทน

สำหรับการกำหนดค่า reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels) ดู[คู่มือการติดตั้งใช้งาน](/th/guide/deployment#reverse-proxy)

## Docker Secrets {#docker-secrets}

สำหรับการติดตั้งใช้งานจริง หลีกเลี่ยงการส่งความลับเป็นตัวแปรสภาพแวดล้อมแบบข้อความธรรมดา entrypoint รองรับข้อกำหนด `_FILE` ของ Docker โดยเมานต์ความลับเป็นไฟล์ แล้วตั้งค่าตัวแปร `_FILE` ที่สอดคล้องกันให้ชี้ไปยังพาธของไฟล์นั้น

**ความลับที่รองรับ:**

| ตัวแปร | ตัวที่เทียบเท่าของ `_FILE` |
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
Docker Compose secrets (ที่ไม่ใช้ Swarm) ต้องใช้ Compose v2.23 ขึ้นไป
:::

## การติดตั้งบน Kubernetes {#kubernetes-deployment}

entrypoint ตรวจพบเมื่อคอนเทนเนอร์รันในฐานะผู้ใช้ที่ไม่ใช่ root อยู่แล้ว (เช่น ผ่าน `runAsUser` ของ Kubernetes) และข้ามการลดสิทธิ์ด้วย gosu โดยอัตโนมัติ ในกรณีนั้น entrypoint ไม่สามารถ chown วอลุ่มที่เมานต์ได้เอง จึงตรวจสอบว่าเขียนได้หรือไม่ และออกก่อนกำหนดพร้อมคำแนะนำที่นำไปปฏิบัติได้หากเขียนไม่ได้ ดู [สิทธิ์การเข้าถึงที่เก็บข้อมูล](/th/guide/deployment#storage-permissions) สำหรับ `fsGroup` และการตั้งค่า UID ต่างถิ่น (TrueNAS, OpenShift)

**Pod SecurityContext ที่แนะนำ:**

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

เนื่องจาก `runAsUser: 999` ถูกตั้งค่าที่ระดับ pod entrypoint จึงข้าม gosu ทั้งหมด ซึ่งทำให้ใช้ capability `allowPrivilegeEscalation: false` และ `drop: [ALL]` ได้โดยไม่ขัดแย้งกัน

สำหรับการกำหนดขนาดทรัพยากร ดู [ความต้องการด้านฮาร์ดแวร์](/th/guide/deployment#hardware-requirements)

## การสำรองข้อมูลและการกู้คืน {#backup-and-recovery}

สแต็ก Compose สำหรับการใช้งานจริงกำหนดวอลุ่มสี่ตัว ให้หยุดทราฟฟิกขาเข้าและรอให้งานที่กำลังทำงานเสร็จก่อนสำรองข้อมูลแบบประสานงาน เพื่อให้ PostgreSQL, Redis และสถานะของไฟล์สะท้อนจุดเวลาเดียวกัน

| วอลุ่ม | เนื้อหา | แนวทางการกู้คืน |
|---|---|---|
| `SnapOtter-pgdata` | ผู้ใช้ การตั้งค่า ไปป์ไลน์ งาน เมทาดาทาของไฟล์ และบันทึกการตรวจสอบของ PostgreSQL | สำคัญมาก ใช้ logical dump แบบ fail-fast เพื่อกู้คืนข้ามระบบได้ |
| `SnapOtter-data` | อ็อบเจกต์ในคลังที่บันทึกไว้ บันทึก และสถานะ AI (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | สำรองทั้งวอลุ่ม หากต้องการประหยัดพื้นที่ ให้ละสถานะ AI ทั้งหมดโดยเจตนาแล้วติดตั้งบันเดิลใหม่ |
| `SnapOtter-redisdata` | Redis AOF สำหรับสถานะคิว BullMQ ที่คงทน | สำรองหลังจากหยุดแอปชั่วคราวและบังคับ `SAVE` จำเป็นสำหรับการทำงานต่อจากคิวที่ค้างอยู่ได้อย่างตรงตัว |
| `SnapOtter-workspace` | คีย์อ็อบเจกต์สตอเรจชั่วคราว (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | ไม่ต้องสำรองหลังจากงานทั้งหมดถูกระบายออกหรือยกเลิกแล้ว ห้ามทิ้งขณะที่ยังมีงานทำงานอยู่ |

โดยปกติ Compose จะเติมชื่อโปรเจกต์นำหน้าชื่อวอลุ่ม ให้หาวอลุ่มต้นทางจริงจากคอนเทนเนอร์ที่เมานต์ไว้ แทนที่จะสมมติว่าชื่อที่แสดงอย่าง `SnapOtter-data` คือชื่อวอลุ่ม Docker

### การสำรองฐานข้อมูล {#database-backup}

ใช้รูปแบบ custom archive ของ PostgreSQL และตรวจสอบไฟล์อาร์ไคฟ์ก่อนถือว่าการสำรองข้อมูลเสร็จสมบูรณ์:

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

ทดสอบทุกการสำรองข้อมูลโดยกู้คืนลงในสแต็กที่แยกต่างหาก ตรวจสอบระเบียนในฐานข้อมูลและ checksum ของไฟล์ แล้วเริ่มแอปพลิเคชัน `tests/qa/backup-restore-drill.sh` ของรีโพซิทอรีทำขั้นตอนการตรวจสอบก่อนปล่อยรุ่นนี้โดยอัตโนมัติกับ `QA_IMAGE` ที่ระบุชัดเจน

หากแพลตฟอร์มของคุณใช้สแนปช็อตวอลุ่มแบบ crash-consistent แทน ให้หยุดทั้งสแต็กก่อน แล้วสแนปช็อตวอลุ่มสำคัญทั้งหมดเป็นชุดเดียวกัน การคัดลอกไดเรกทอรีข้อมูลดิบของ PostgreSQL จากคอนเทนเนอร์ที่กำลังทำงานไม่ใช่การสำรองแบบ logical ที่รองรับ

### การสำรองไฟล์และคิว {#file-and-queue-backup}

หยุดแอปพลิเคชันชั่วคราวก่อนบันทึกวอลุ่มของไฟล์และคิว ใช้ `docker inspect` เพื่อหาชื่อวอลุ่มจริง บังคับให้ Redis เก็บสถานะปัจจุบันลงดิสก์ และสร้างอาร์ไคฟ์โดยรักษาความเป็นเจ้าของและสิทธิ์ไว้:

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

เริ่ม Redis ก่อนแอปพลิเคชัน หากคุณตั้งใจยกเว้น `/data/ai` ให้ลบทรี AI ทั้งหมดออก แทนที่จะเก็บระเบียน `installed.json` ไว้โดยไม่มีโมเดลหรือสภาพแวดล้อมเสมือน เก็บไฟล์สำรองให้เข้ารหัส ควบคุมการเข้าถึง และแยกจากโฮสต์ที่รัน SnapOtter

## เอกสารด้านการปฏิบัติตามข้อกำหนด {#compliance-artifacts}

SnapOtter แต่ละรุ่นมีเอกสารด้านความปลอดภัยดังต่อไปนี้:

| เอกสาร | รูปแบบ | ตำแหน่งที่พบ |
|---|---|---|
| การผูกกับตัวตนของรุ่น | Canonical JSON + GitHub attestation | แอสเซตของ [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| SBOM ของอาร์ไคฟ์ | CycloneDX และ SPDX JSON | แอสเซตของรุ่น: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| SBOM ของอิมเมจ | CycloneDX และ SPDX JSON | แอสเซตของรุ่น: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| การสแกนช่องโหว่ | Trivy JSON | แอสเซตของรุ่นที่มีคำนำหน้า `archive-linux-{arch}` หรือ `image-linux-{arch}` ตรงกัน |
| การสแกนช่องโหว่ | SARIF | แท็บ [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| การวิเคราะห์แบบสถิต | CodeQL (JS/TS + Python) | แท็บ [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) รันทุกสัปดาห์และทุก PR |
| การตรวจสอบ dependency | GitHub native | การตรวจสอบต่อ PR ล้มเหลวเมื่อมีการเพิ่มที่มีความรุนแรงสูง |
| การตรวจสอบ dependency ของ Python | pip-audit | บันทึกการรัน CI ในทุกการ push |
| นโยบายความปลอดภัย | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) ในรีโพซิทอรี |
| การอัปเดต dependency | Dependabot | PR อัตโนมัติรายสัปดาห์สำหรับ npm, pip, Docker, Actions |

**การรันการสแกนด้วยตนเอง:**

ดาวน์โหลด manifest การผูกกับตัวตนของรุ่น แล้วตรวจสอบว่า workflow ของรุ่นเป็นผู้รับรอง:

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

manifest บันทึก `releaseTag`, `releaseCommit` และ `workflowTriggerCommit` แยกกัน ตรวจสอบว่า `releaseCommit` คือคอมมิตที่ได้จากแท็กที่เปลี่ยนแปลงไม่ได้ จากนั้นตรวจสอบ digest SHA-256 ของอาร์ไคฟ์ อิมเมจ SBOM หรือผลสแกนที่คุณใช้ เทียบกับรายการของมันใน `subjects` ความแตกต่างนี้ตั้งใจให้เป็นเช่นนั้น เพราะการเช็คเอาต์คอมมิตของรุ่นที่เพิ่งสร้างไม่ได้เปลี่ยนตัวตนของคอมมิตในข้อมูลประจำตัว OIDC ของ workflow

คุณยังสแกน SBOM ที่ดาวน์โหลดมา หรือสแกนอิมเมจโดยตรงได้:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
SBOM และผลสแกนของอิมเมจสะท้อนอิมเมจเฉพาะสถาปัตยกรรมที่เผยแพร่จริงสำหรับรุ่นนั้น SBOM และผลสแกนของอาร์ไคฟ์อธิบายอาร์ไคฟ์ที่สร้างไว้ล่วงหน้าแยกต่างหาก บันเดิลโมเดล AI ที่ติดตั้งหลังการติดตั้งใช้งานไม่รวมอยู่ใน SBOM เหล่านี้ เพราะถูกดาวน์โหลดขณะรัน
:::
