---
description: "सभी SnapOtter एनवायरनमेंट वेरिएबल्स डिफ़ॉल्ट के साथ। auth, स्टोरेज, AI मॉडल, एनालिटिक्स, और अधिक कॉन्फ़िगर करें।"
i18n_source_hash: 8e9e9ca2840c
i18n_provenance: human
i18n_output_hash: 6de48963490c
---

# Configuration {#configuration}

सभी कॉन्फ़िगरेशन एनवायरनमेंट वेरिएबल्स के माध्यम से किया जाता है। हर वेरिएबल का एक उचित डिफ़ॉल्ट होता है, इसलिए SnapOtter उनमें से किसी को सेट किए बिना बॉक्स से बाहर काम करता है।

## Environment variables {#environment-variables}

### Server {#server}

| Variable | Default | Description |
|---|---|---|
| `PORT` | `1349` | सर्वर जिस पोर्ट पर सुनता है। |
| `RATE_LIMIT_PER_MIN` | `1000` | प्रति IP प्रति मिनट अधिकतम अनुरोध। रेट लिमिटिंग अक्षम करने के लिए 0 पर सेट करें। |
| `CORS_ORIGIN` | (empty) | CORS के लिए अल्पविराम-पृथक अनुमत मूल, या केवल-समान-मूल के लिए खाली। |
| `LOG_LEVEL` | `info` | लॉग वर्बोसिटी। इनमें से एक: `fatal`, `error`, `warn`, `info`, `debug`, `trace`। |
| `TRUST_PROXY` | `true` | एक रिवर्स प्रॉक्सी से `X-Forwarded-For` हेडर पर भरोसा करें। यदि प्रॉक्सी के पीछे नहीं है तो `false` पर सेट करें। |

### Authentication {#authentication}

| Variable | Default | Description |
|---|---|---|
| `AUTH_ENABLED` | `false` | लॉगिन की आवश्यकता के लिए `true` पर सेट करें। Docker इमेज `true` पर डिफ़ॉल्ट होती है। |
| `DEFAULT_USERNAME` | `admin` | प्रारंभिक admin अकाउंट के लिए उपयोगकर्ता नाम। केवल पहली बार चलने पर उपयोग किया जाता है। |
| `DEFAULT_PASSWORD` | `admin` | प्रारंभिक admin अकाउंट के लिए पासवर्ड। पहली बार लॉगिन के बाद इसे बदलें। |
| `MAX_USERS` | `0` (unlimited) | पंजीकृत उपयोगकर्ता अकाउंट की अधिकतम संख्या। असीमित के लिए 0 पर सेट करें। |
| `SESSION_DURATION_HOURS` | `168` | घंटों में लॉगिन सत्र जीवनकाल (डिफ़ॉल्ट 7 दिन है)। |
| `SKIP_MUST_CHANGE_PASSWORD` | - | पहली बार लॉगिन पर बाध्य पासवर्ड-परिवर्तन प्रॉम्प्ट को बायपास करने के लिए किसी भी गैर-खाली मान पर सेट करें |

### Storage {#storage}

| Variable | Default | Description |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` या `s3`। S3/MinIO के लिए s3_storage फ़ीचर वाले लाइसेंस की आवश्यकता होती है। |
| `DATABASE_URL` | `postgres://snapotter:snapotter@postgres:5432/snapotter` | PostgreSQL कनेक्शन स्ट्रिंग। |
| `REDIS_URL` | `redis://redis:6379` | Redis कनेक्शन स्ट्रिंग (BullMQ जॉब क्यू के लिए उपयोग की जाती है)। |
| `WORKSPACE_PATH` | `./tmp/workspace` | प्रोसेसिंग के दौरान अस्थायी फ़ाइलों के लिए डायरेक्टरी। स्वचालित रूप से साफ़ की जाती है। |
| `FILES_STORAGE_PATH` | `./data/files` | स्थायी उपयोगकर्ता फ़ाइलों (अपलोड की गई इमेज, सहेजे गए परिणाम) के लिए डायरेक्टरी। |

### Embedded mode {#embedded-mode}

इमेज को बिना किसी `DATABASE_URL` और बिना किसी `REDIS_URL` के चलाएँ और यह कंटेनर के अंदर अपना स्वयं का PostgreSQL 17 और Redis शुरू करता है, जो लूपबैक से बंधा हुआ है, सारा डेटा `/data` वॉल्यूम पर। यह त्वरित शुरुआत, होमलैब, और 1.x से अपग्रेड के लिए एकल-कमांड `docker run` अनुभव को बहाल करता है। यह एक सुविधा पथ है, न कि एक प्रोडक्शन परिनियोजन: प्रोडक्शन के लिए, अलग PostgreSQL और Redis के साथ 3-कंटेनर Compose स्टैक चलाएँ। Embedded मोड को कंटेनर को रूट के रूप में चलाने की आवश्यकता होती है और यह मनमाने-UID रनटाइम (OpenShift, Kubernetes `runAsNonRoot`) के साथ असंगत है; वहाँ Compose का उपयोग करें।

| Variable | Default | Description |
|---|---|---|
| `EMBEDDED` | `auto` | तब स्वतः-सक्षम होता है जब `DATABASE_URL` और `REDIS_URL` दोनों अनसेट हों। इसे अक्षम करने के लिए `0` पर सेट करें (तब ऐप तेज़ी से विफल हो जाता है यदि कोई बाहरी `DATABASE_URL`/`REDIS_URL` सेट नहीं है, बजाय चुपचाप एक इन-कंटेनर डेटाबेस शुरू करने के)। |
| `REDIS_MAXMEMORY` | `512mb` | एम्बेडेड Redis के लिए मेमोरी कैप (केवल embedded मोड)। Raspberry Pi जैसे मेमोरी-सीमित होस्ट पर इसे कम करें। |

1.x से अपग्रेड करना: अपनी पुरानी `snapotter.db` को वॉल्यूम में `/data/snapotter.db` पर रखें और embedded मोड इसे पहली बार बूट होने पर एम्बेडेड PostgreSQL में आयात करता है। आयात एक बार चलता है; बाद के बूट इसे छोड़ देते हैं।

टेलीमेट्री नोट: embedded मोड किसी भी अन्य कॉन्फ़िगरेशन की तरह इमेज के एनालिटिक्स डिफ़ॉल्ट को विरासत में लेता है। प्रकाशित इमेज एनालिटिक्स चालू के साथ शिप होती है; इसे अक्षम करने के लिए `--build-arg SNAPOTTER_ANALYTICS=off` के साथ बिल्ड करें, या इन-ऐप admin ऑप्ट-आउट का उपयोग करें।

### Processing limits {#processing-limits}

| Variable | Default | Description |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `100` | मेगाबाइट में प्रति अपलोड अधिकतम फ़ाइल आकार। असीमित के लिए 0 पर सेट करें। |
| `MAX_BATCH_SIZE` | `100` | एकल बैच अनुरोध में फ़ाइलों की अधिकतम संख्या। असीमित के लिए 0 पर सेट करें। |
| `CONCURRENT_JOBS` | `0` (auto) | समानांतर में चलने वाले बैच जॉब की संख्या। उपलब्ध CPU कोर के आधार पर स्वतः-पहचान के लिए 0 पर सेट करें। |
| `MAX_MEGAPIXELS` | `0` (unlimited) | मेगापिक्सेल में अनुमत अधिकतम इमेज रिज़ॉल्यूशन। असीमित के लिए 0 पर सेट करें। |
| `MAX_WORKER_THREADS` | `0` (auto) | इमेज प्रोसेसिंग के लिए अधिकतम वर्कर थ्रेड। उपलब्ध CPU कोर के आधार पर स्वतः-पहचान के लिए 0 पर सेट करें। |
| `PROCESSING_TIMEOUT_S` | `0` (no limit) | सेकंड में प्रति अनुरोध अधिकतम प्रोसेसिंग समय। बिना टाइमआउट के लिए 0 पर सेट करें। |
| `MAX_PIPELINE_STEPS` | `20` | एक पाइपलाइन में अधिकतम चरणों की संख्या। बिना सीमा के लिए 0 पर सेट करें। |
| `MAX_CANVAS_PIXELS` | `0` (no limit) | आउटपुट इमेज के लिए पिक्सेल में अधिकतम कैनवास आकार। बिना सीमा के लिए 0 पर सेट करें। |
| `MAX_SVG_SIZE_MB` | `0` (unlimited) | मेगाबाइट में अधिकतम SVG फ़ाइल आकार। असीमित के लिए 0 पर सेट करें। |
| `MAX_SPLIT_GRID` | `100` | इमेज स्प्लिट टूल के लिए अधिकतम ग्रिड आयाम। |
| `MAX_PDF_PAGES` | `0` (unlimited) | PDF-to-image रूपांतरण के लिए PDF पृष्ठों की अधिकतम संख्या। असीमित के लिए 0 पर सेट करें। |

### Cleanup {#cleanup}

| Variable | Default | Description |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | बिना सहेजे प्रोसेसिंग परिणाम (कच्चे अपलोड और टूल आउटपुट) स्वचालित हटाने से पहले कितने समय तक रखे जाते हैं। जिन फ़ाइलों को आप स्पष्ट रूप से Files लाइब्रेरी में सहेजते हैं वे प्रभावित नहीं होतीं और तब तक बनी रहती हैं जब तक आप उन्हें हटा नहीं देते। |
| `CLEANUP_INTERVAL_MINUTES` | `60` | क्लीनअप जॉब कितनी बार चलता है। |

### Appearance {#appearance}

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_THEME` | `light` | नए सत्रों के लिए डिफ़ॉल्ट थीम। `light` या `dark`। |
| `DEFAULT_LOCALE` | `en` | डिफ़ॉल्ट इंटरफ़ेस भाषा। |
| `DEFAULT_TOOL_VIEW` | `sidebar` | डिफ़ॉल्ट टूल लेआउट। `sidebar` या `fullscreen`। |

### Docker permissions {#docker-permissions}

| Variable | Default | Description |
|---|---|---|
| `PUID` | `999` | कंटेनर प्रक्रिया को इस UID के रूप में चलाएँ। बाइंड माउंट के लिए अपने होस्ट उपयोगकर्ता से मिलान करने के लिए सेट करें (`id -u`)। |
| `PGID` | `999` | कंटेनर प्रक्रिया को इस GID के रूप में चलाएँ। बाइंड माउंट के लिए अपने होस्ट समूह से मिलान करने के लिए सेट करें (`id -g`)। |

## Docker example {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
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

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## Volumes {#volumes}

Docker Compose स्टैक चार वॉल्यूम का उपयोग करता है:

- `/data` (app) - AI मॉडल, Python venv, और उपयोगकर्ता फ़ाइलें। अपलोड की गई फ़ाइलों और इंस्टॉल किए गए AI बंडलों को पुनरारंभ के दौरान रखने के लिए इसे माउंट करें।
- `/tmp/workspace` (app) - प्रोसेस की जा रही फ़ाइलों के लिए अस्थायी स्टोरेज। यह क्षणिक हो सकता है, लेकिन इसे माउंट करने से कंटेनर की लिखने योग्य लेयर भरने से बचती है।
- `SnapOtter-pgdata` (postgres) - PostgreSQL डेटा डायरेक्टरी। यह सभी रिलेशनल डेटा (users, settings, pipelines, jobs, audit log) रखती है। `pg_dump` या वॉल्यूम स्नैपशॉट के माध्यम से बैकअप लें।
- `SnapOtter-redisdata` (redis) - टिकाऊ जॉब क्यू के लिए Redis append-only फ़ाइल।
