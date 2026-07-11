---
description: "SnapOtter के लिए सुरक्षा हार्डनिंग गाइड। कंटेनर सुरक्षा, नेटवर्क आइसोलेशन, Docker secrets, Kubernetes डिप्लॉयमेंट, और अनुपालन आर्टिफ़ैक्ट।"
i18n_source_hash: 986f7658430c
i18n_provenance: machine
i18n_output_hash: cc08062b0496
---

# Security & Hardening {#security-hardening}

SnapOtter फ़ाइलों को पूरी तरह आपके इन्फ़्रास्ट्रक्चर पर प्रोसेस करता है। यह प्रोजेक्ट को बेहतर बनाने में मदद के लिए डिफ़ॉल्ट रूप से अनाम, सामग्री-रहित उत्पाद एनालिटिक्स और क्रैश रिपोर्ट भेजता है। यह कभी आपकी फ़ाइलें, फ़ाइल नाम, फ़ाइल सामग्री, OCR आउटपुट, इमेज मेटाडेटा, या दस्तावेज़ टेक्स्ट नहीं भेजता। वैकल्पिक फ़ीडबैक केवल तभी भेजा जाता है जब कोई उपयोगकर्ता उसे सबमिट करता है, केवल तभी जब एनालिटिक्स सक्षम हो, और संपर्क फ़ील्ड केवल स्पष्ट संपर्क सहमति के साथ ही शामिल होते हैं। एक व्यवस्थापक Settings > System > Privacy के अंतर्गत एक क्लिक में एनालिटिक्स और फ़ीडबैक कैप्चर बंद कर सकता है, किसी रीबिल्ड की आवश्यकता नहीं। फ़ाइल प्रोसेसिंग हमेशा आपके कंटेनर के अंदर ही रहती है।

कंटेनर एक समर्पित गैर-root उपयोगकर्ता (`snapotter`) के रूप में चलता है, जिसमें न्यूनतम आवश्यक सेट को छोड़कर सभी Linux क्षमताएँ हटा दी जाती हैं। पूर्ण भेद्यता प्रकटीकरण नीति और सुरक्षा आर्किटेक्चर के लिए, GitHub पर [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) देखें।

## Container Hardening {#container-hardening}

[डिफ़ॉल्ट docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) में प्रोडक्शन सुरक्षा हार्डनिंग शामिल है। यहाँ हर विकल्प का विवरण और यह क्यों मायने रखता है:

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

### Why `no-new-privileges` Is Not Set {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` को जानबूझकर छोड़ दिया गया है। एंट्रीपॉइंट वॉल्यूम स्वामित्व ठीक करने के लिए root के रूप में शुरू होता है, फिर [gosu](https://github.com/tianon/gosu) के माध्यम से `snapotter` उपयोगकर्ता पर गिर जाता है, जिसके लिए setuid आवश्यक है। एक बार विशेषाधिकार गिरना पूरा हो जाने पर, प्रक्रिया `snapotter` के रूप में चलती है, जिसमें ऊपर सूचीबद्ध पाँच को छोड़कर सभी क्षमताएँ हटा दी जाती हैं।

यदि आप सीधे गैर-root के रूप में चलाने के लिए Kubernetes या Docker के `--user` फ़्लैग का उपयोग करते हैं (gosu को बायपास करते हुए), तो `no-new-privileges` को सक्षम करना सुरक्षित है।

### Why `read_only` Is Not Set {#why-read-only-is-not-set}

`read_only: true` सेट नहीं है क्योंकि PUID/PGID रीमैपिंग स्टार्टअप पर `/etc/passwd` और `/etc/group` पर लिखती है। यदि आप PUID/PGID के बजाय Docker के `--user` फ़्लैग या Kubernetes `runAsUser` का उपयोग करते हैं, तो आप सुरक्षित रूप से एक read-only रूट फ़ाइलसिस्टम सक्षम कर सकते हैं।

## Network Isolation {#network-isolation}

सामान्य संचालन के दौरान, कंटेनर **शून्य आउटबाउंड नेटवर्क कनेक्शन** बनाता है। सारी फ़ाइल प्रोसेसिंग बंडल की गई लाइब्रेरियों का उपयोग करके स्थानीय रूप से होती है।

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

एकमात्र अपवाद **AI मॉडल डाउनलोड** है: जब कोई उपयोगकर्ता UI के माध्यम से एक AI फ़ीचर बंडल इंस्टॉल करता है, तो कंटेनर Hugging Face से पहले से बना बंडल आर्काइव डाउनलोड करता है, साथ ही GitHub Releases, Google Storage, और PyPI से कुछ अलग-अलग मॉडल फ़ाइलें। ये डाउनलोड प्रति बंडल एक बार होते हैं और `/data` वॉल्यूम में संग्रहीत किए जाते हैं।

**फ़ायरवॉल अनुशंसाएँ:**

| परिदृश्य | आउटबाउंड नियम |
|---|---|
| Air-gapped (कोई AI नहीं) | कंटेनर से सभी आउटबाउंड ट्रैफ़िक ब्लॉक करें |
| AI बंडल आवश्यक | इंस्टॉल के दौरान `huggingface.co`, `*.xethub.hf.co`, `cdn-lfs.huggingface.co`, `github.com`, `objects.githubusercontent.com`, `storage.googleapis.com`, `pypi.org`, `files.pythonhosted.org` पर HTTPS की अनुमति दें, फिर ब्लॉक करें |
| AI इंस्टॉल के बाद | सभी आउटबाउंड ट्रैफ़िक ब्लॉक करें, मॉडल स्थानीय रूप से कैश हो जाते हैं |

बंडल आर्काइव Hugging Face के Xet स्टोरेज से परोसे जाते हैं, जो `*.xethub.hf.co` एंडपॉइंट पर समानांतर में स्थानांतरित होता है और यही मल्टी-GB बंडल डाउनलोड को तेज़ बनाता है। यदि आपका फ़ायरवॉल `huggingface.co` की अनुमति देता है पर `*.xethub.hf.co` को ब्लॉक करता है, तो इंस्टॉल फिर भी सफल होते हैं पर एक धीमे सिंगल-स्ट्रीम डाउनलोड पर फ़ॉलबैक करते हैं, इसलिए तेज़ रास्ते पर बने रहने के लिए Xet होस्ट को allowlist करें। पूरी तरह ऑफ़लाइन इंस्टॉल इस सबको छोड़ सकते हैं और इसके बजाय [Offline Bundle Import](/hi/guide/deployment) का उपयोग कर सकते हैं।

रिवर्स प्रॉक्सी कॉन्फ़िगरेशन (Nginx, Traefik, Caddy, Cloudflare Tunnels) के लिए, [Deployment गाइड](/hi/guide/deployment#reverse-proxy) देखें।

## Docker Secrets {#docker-secrets}

प्रोडक्शन डिप्लॉयमेंट के लिए, secrets को सादा-टेक्स्ट एनवायरनमेंट वेरिएबल के रूप में पास करने से बचें। एंट्रीपॉइंट Docker के `_FILE` कन्वेंशन को सपोर्ट करता है: एक secret को फ़ाइल के रूप में माउंट करें और संबंधित `_FILE` वेरिएबल को उसके पथ पर सेट करें।

**सपोर्टेड secrets:**

| वेरिएबल | `_FILE` समकक्ष |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Docker Compose secrets के साथ उदाहरण:**

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
Docker Compose secrets (Swarm के बिना) के लिए Compose v2.23 या बाद का संस्करण आवश्यक है।
:::

## Kubernetes Deployment {#kubernetes-deployment}

एंट्रीपॉइंट पता लगाता है कि कंटेनर पहले से गैर-root के रूप में चल रहा है (उदा., Kubernetes `runAsUser` के माध्यम से) और स्वचालित रूप से gosu विशेषाधिकार गिरना छोड़ देता है। उस स्थिति में यह माउंट किए गए वॉल्यूम को स्वयं chown नहीं कर सकता, इसलिए यह सत्यापित करता है कि वे लिखने योग्य हैं और यदि नहीं हैं तो कार्रवाई-योग्य मार्गदर्शन के साथ जल्दी बाहर निकल जाता है, `fsGroup` और विदेशी-UID सेटअप (TrueNAS, OpenShift) के लिए [Storage permissions](/hi/guide/deployment#storage-permissions) देखें।

**अनुशंसित Pod SecurityContext:**

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

चूँकि `runAsUser: 999` पॉड स्तर पर सेट है, एंट्रीपॉइंट gosu को पूरी तरह छोड़ देता है। यह `allowPrivilegeEscalation: false` और `drop: [ALL]` क्षमताओं को बिना टकराव के अनुमति देता है।

रिसोर्स आकार निर्धारण के लिए, [Hardware Requirements](/hi/guide/deployment#hardware-requirements) देखें।

## Backup and Recovery {#backup-and-recovery}

स्थायी स्थिति दो वॉल्यूम में विभाजित है:

| वॉल्यूम | सामग्री | महत्वपूर्ण? |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL डेटाबेस (उपयोगकर्ता, सेटिंग्स, पाइपलाइन, जॉब, ऑडिट लॉग) | हाँ |
| `/data` (ऐप वॉल्यूम) | उपयोगकर्ता-अपलोड की गई फ़ाइलें, AI मॉडल, Python venv | आंशिक रूप से (नीचे देखें) |

`/data` वॉल्यूम के भीतर:

| पथ | सामग्री | महत्वपूर्ण? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | उपयोगकर्ता फ़ाइलें और प्रोसेसिंग परिणाम | हाँ |
| `/data/ai/` | डाउनलोड की गई AI मॉडल फ़ाइलें | नहीं (पुनः-डाउनलोड करने योग्य) |
| `/data/venv/` | Python वर्चुअल एनवायरनमेंट | नहीं (स्टार्ट पर पुनर्निर्मित) |

### Database backup {#database-backup}

स्टैक चलते समय डेटाबेस का बैकअप लेने के लिए `pg_dump` का उपयोग करें:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

वैकल्पिक रूप से, स्टैक बंद करें और `SnapOtter-pgdata` वॉल्यूम का स्नैपशॉट लें:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### User files backup {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

सभी बंडलों में AI मॉडल कुल मिलाकर लगभग 24 GB तक होते हैं। चूँकि वे पुनः-डाउनलोड करने योग्य हैं, स्थान बचाने के लिए बैकअप से `/data/ai/` और `/data/venv/` को बाहर रखें। केवल डेटाबेस और उपयोगकर्ता फ़ाइलें महत्वपूर्ण हैं।

## Compliance Artifacts {#compliance-artifacts}

हर SnapOtter रिलीज़ में निम्नलिखित सुरक्षा आर्टिफ़ैक्ट शामिल होते हैं:

| आर्टिफ़ैक्ट | फ़ॉर्मैट | इसे कहाँ खोजें |
|---|---|---|
| SBOM (CycloneDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) एसेट: `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) एसेट: `snapotter-v{version}-sbom.spdx.json` |
| भेद्यता स्कैन | Trivy JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) एसेट: `snapotter-v{version}-trivy.json` |
| भेद्यता स्कैन | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) टैब |
| स्थैतिक विश्लेषण | CodeQL (JS/TS + Python) | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) टैब, साप्ताहिक + प्रति PR चलता है |
| निर्भरता समीक्षा | GitHub native | प्रति-PR जाँच, उच्च-गंभीरता जोड़ पर विफल |
| Python निर्भरता ऑडिट | pip-audit | हर push पर CI रन लॉग |
| सुरक्षा नीति | Markdown | रिपॉज़िटरी में [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| निर्भरता अद्यतन | Dependabot | npm, pip, Docker, Actions के लिए स्वचालित साप्ताहिक PR |

**अपना खुद का स्कैन चलाना:**

रिलीज़ से SBOM डाउनलोड करें और अपने पसंदीदा टूल से इसे स्कैन करें:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM और भेद्यता स्कैन उस रिलीज़ के लिए प्रकाशित सटीक इमेज को दर्शाते हैं। डिप्लॉयमेंट के बाद इंस्टॉल किए गए AI मॉडल बंडल SBOM में शामिल नहीं होते क्योंकि वे रनटाइम पर डाउनलोड किए जाते हैं।
:::
