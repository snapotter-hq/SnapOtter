---
description: "सभी SnapOtter एनवायरनमेंट वेरिएबल्स डिफ़ॉल्ट के साथ। auth, स्टोरेज, AI मॉडल, एनालिटिक्स, और अधिक कॉन्फ़िगर करें।"
i18n_source_hash: a694a81ef7e0
i18n_provenance: human
i18n_output_hash: 3ffb40eb0066
i18n_hash_version: 2
---

# Configuration {#configuration}

सभी कॉन्फ़िगरेशन एनवायरनमेंट वेरिएबल्स के माध्यम से किया जाता है। हर वेरिएबल का एक उचित डिफ़ॉल्ट होता है, इसलिए SnapOtter उनमें से किसी को सेट किए बिना बॉक्स से बाहर काम करता है।

## Environment variables {#environment-variables}

### Server {#server}

| Variable | Default | Description |
|---|---|---|
| `PORT` | `1349` | सर्वर जिस पोर्ट पर सुनता है। |
| `BASE_PATH` | (empty) | सार्वजनिक परिनियोजन पथ, जैसे `/snapotter`। खाली या `/` डोमेन रूट पर उपलब्ध होता है। रनटाइम पर लागू होता है; किसी इमेज रीबिल्ड की आवश्यकता नहीं। |
| `RATE_LIMIT_PER_MIN` | `1000` | प्रति IP प्रति मिनट अधिकतम अनुरोध। रेट लिमिटिंग अक्षम करने के लिए 0 पर सेट करें। |
| `CORS_ORIGIN` | (empty) | CORS के लिए अल्पविराम-पृथक अनुमत मूल, या केवल-समान-मूल के लिए खाली। |
| `LOG_LEVEL` | `info` | लॉग वर्बोसिटी। इनमें से एक: `fatal`, `error`, `warn`, `info`, `debug`, `trace`। |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | `X-Forwarded-For` के ज़रिए क्लाइंट IP कौन से पीयर सेट कर सकते हैं। डिफ़ॉल्ट केवल किसी निजी नेटवर्क के पीयर पर भरोसा करता है, इसलिए Docker नेटवर्क या LAN पर मौजूद रिवर्स प्रॉक्सी भरोसेमंद माना जाता है, जबकि किसी सार्वजनिक क्लाइंट का जाली हेडर नहीं। `true` तभी सेट करें जब आपके नियंत्रण वाला कोई प्रॉक्सी सार्वजनिक पते पर आगे लगा हो। |

### Authentication {#authentication}

नीचे दिए गए दोनों बूलियन केवल `true` और `false` स्वीकार करते हैं। इसके अलावा कुछ और, जैसे `1` या `yes` या `on`, सत्यापन में विफल हो जाता है और सर्वर सुनना शुरू करने से पहले ही बाहर निकल जाता है।

| Variable | Default | Description |
|---|---|---|
| `AUTH_ENABLED` | `true` | लॉगिन अनिवार्य करें। बिना किसी अकाउंट के चलाने के लिए `false` पर सेट करें, जो हर अनुरोध को admin अधिकार देता है, इसलिए इसे किसी भरोसेमंद नेटवर्क तक ही सीमित रखें। |
| `DEFAULT_USERNAME` | `admin` | प्रारंभिक admin अकाउंट के लिए उपयोगकर्ता नाम। केवल पहली बार चलने पर उपयोग किया जाता है। |
| `DEFAULT_PASSWORD` | `admin` | प्रारंभिक admin अकाउंट के लिए पासवर्ड। पहली बार लॉगिन के बाद इसे बदलें। |
| `MAX_USERS` | `0` (unlimited) | पंजीकृत उपयोगकर्ता अकाउंट की अधिकतम संख्या। असीमित के लिए 0 पर सेट करें। |
| `SESSION_DURATION_HOURS` | `168` | घंटों में लॉगिन सत्र जीवनकाल (डिफ़ॉल्ट 7 दिन है)। |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | पहली बार लॉगिन पर बाध्य पासवर्ड-परिवर्तन प्रॉम्प्ट को छोड़ने के लिए `true` पर सेट करें। |

### Storage {#storage}

| Variable | Default | Description |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` या `s3`। S3 और MinIO के लिए s3_storage फ़ीचर वाले लाइसेंस के साथ नीचे दिए गए `S3_*` वेरिएबल्स की भी आवश्यकता होती है। |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL कनेक्शन स्ट्रिंग, और वह कनेक्शन जिस पर हर अनुरोध परोसा जाता है। 2.3.0 और उसके बाद, `DATABASE_MIGRATION_URL` भी सेट करें और यह न्यूनतम-विशेषाधिकार वाली रनटाइम भूमिका बन जाता है, जिसके पास ऐप की तालिकाओं पर केवल DML है और कुछ नहीं। Compose स्टैक इसे अपनी `postgres` सेवा की ओर इंगित करता है; embedded मोड पाने के लिए इसे (`REDIS_URL` के साथ) अनसेट छोड़ दें। |
| `DATABASE_MIGRATION_URL` | (empty) | 2.3.0 से उपलब्ध; 2.2.0 इमेज इसे अनदेखा करती है और चाहती है कि `DATABASE_URL` डेटाबेस के स्वामी को नामित करे। विशेषाधिकार प्राप्त कनेक्शन, केवल बूट के दौरान माइग्रेशन चलाने और रनटाइम भूमिका प्रदान करने के लिए उपयोग किया जाता है, फिर पहले अनुरोध से पहले बंद कर दिया जाता है। इसे खाली छोड़ें और SnapOtter एकल-भूमिका में चलता है, जिसमें `DATABASE_URL` दोनों काम करता है। [न्यूनतम-विशेषाधिकार भूमिकाएँ](/hi/guide/database#least-privilege-roles) देखें। |
| `REDIS_URL` | `redis://localhost:6379` | Redis कनेक्शन स्ट्रिंग (BullMQ जॉब क्यू के लिए उपयोग की जाती है)। Compose इसे अपनी `redis` सेवा की ओर इंगित करता है। |
| `WORKSPACE_PATH` | `./tmp/workspace` | प्रोसेसिंग के दौरान अस्थायी फ़ाइलों के लिए डायरेक्टरी। स्वचालित रूप से साफ़ की जाती है। इमेज इसे `/tmp/workspace` पर सेट करती है। |
| `FILES_STORAGE_PATH` | `./data/files` | स्थायी उपयोगकर्ता फ़ाइलों (अपलोड की गई इमेज, सहेजे गए परिणाम) के लिए डायरेक्टरी। इमेज इसे `/data/files` पर सेट करती है। |

### S3 object storage {#s3-object-storage}

ये केवल तभी पढ़े जाते हैं जब `STORAGE_MODE=s3` हो। तीन आवश्यक वेरिएबल्स में से कोई भी छूट जाए तो स्टार्टअप विफल हो जाता है और जो वेरिएबल आपने छोड़ा उसका नाम बताता है।

| Variable | Default | Description |
|---|---|---|
| `S3_BUCKET` | (empty) | वह बकेट जो अपलोड और आउटपुट रखता है। आवश्यक। |
| `S3_ACCESS_KEY_ID` | (empty) | एक्सेस की। आवश्यक। कंटेनर में आप इसके बजाय इसे `S3_ACCESS_KEY_ID_FILE` के माध्यम से माउंट कर सकते हैं। |
| `S3_SECRET_ACCESS_KEY` | (empty) | सीक्रेट की। आवश्यक। वही फ़ाइल परिपाटी: `S3_SECRET_ACCESS_KEY_FILE`। |
| `S3_REGION` | `us-east-1` | बकेट का क्षेत्र। |
| `S3_ENDPOINT` | (empty) | MinIO, R2, Backblaze, और अन्य S3-संगत स्टोर के लिए कस्टम एंडपॉइंट। खाली का अर्थ है AWS। |
| `S3_FORCE_PATH_STYLE` | `false` | MinIO और ऐसी किसी भी अन्य चीज़ के लिए `true` पर सेट करें जो वर्चुअल-होस्ट एड्रेसिंग के बजाय `endpoint/bucket/key` चाहती है। |
| `S3_PREFIX` | (empty) | की प्रीफ़िक्स, ताकि एक ही बकेट कई इंस्टेंस रख सके। |

### Encryption at rest {#encryption-at-rest}

| Variable | Default | Description |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (empty) | 64 हेक्स वर्ण (32 बाइट)। डेटाबेस में संग्रहीत संवेदनशील सेटिंग्स को एन्क्रिप्ट करता है। जो कुछ भी 64 हेक्स वर्ण नहीं है उसे स्टार्टअप पर अस्वीकार कर दिया जाता है। |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (empty) | वह की जिससे आप रोटेट होकर दूर जा रहे हैं, वही फ़ॉर्मैट। रोटेशन के दौरान दोनों सेट करें ताकि मौजूदा पंक्तियाँ अब भी डिक्रिप्ट हों, फिर इसे हटा दें। |

### Embedded mode {#embedded-mode}

इमेज को बिना किसी `DATABASE_URL` और बिना किसी `REDIS_URL` के चलाएँ और यह कंटेनर के अंदर अपना स्वयं का PostgreSQL 17 और Redis शुरू करता है, जो लूपबैक से बंधा हुआ है, सारा डेटा `/data` वॉल्यूम पर। यह त्वरित शुरुआत, होमलैब, और 1.x से अपग्रेड के लिए एकल-कमांड `docker run` अनुभव को बहाल करता है। यह एक सुविधा पथ है, न कि एक प्रोडक्शन परिनियोजन: प्रोडक्शन के लिए, अलग PostgreSQL और Redis के साथ 3-कंटेनर Compose स्टैक चलाएँ। Embedded मोड को कंटेनर को रूट के रूप में चलाने की आवश्यकता होती है और यह मनमाने-UID रनटाइम (OpenShift, Kubernetes `runAsNonRoot`) के साथ असंगत है; वहाँ Compose का उपयोग करें।

| Variable | Default | Description |
|---|---|---|
| `EMBEDDED` | `auto` | तब स्वतः-सक्षम होता है जब `DATABASE_URL` और `REDIS_URL` दोनों अनसेट हों। इसे अक्षम करने के लिए `0` पर सेट करें (तब ऐप तेज़ी से विफल हो जाता है यदि कोई बाहरी `DATABASE_URL`/`REDIS_URL` सेट नहीं है, बजाय चुपचाप एक इन-कंटेनर डेटाबेस शुरू करने के)। |
| `REDIS_MAXMEMORY` | `512mb` | एम्बेडेड Redis के लिए मेमोरी कैप (केवल embedded मोड)। Raspberry Pi जैसे मेमोरी-सीमित होस्ट पर इसे कम करें। |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | बूट कितने सेकंड तक एम्बेडेड Redis के `PING` का उत्तर देने की प्रतीक्षा करता है, उसके बाद हार मान लेता है। टाइमआउट पर कंटेनर लटकने के बजाय रुक जाता है और कारण लॉग करता है। 1 से 999999 तक पूर्ण सेकंड; कोई असीमित मान नहीं है, क्योंकि अनंत प्रतीक्षा ही वह विफलता है जिसे रोकने के लिए यह सीमा बनी है। इसे केवल तब बढ़ाएँ जब कोई धीमा होस्ट इसे ट्रिगर करे। |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | वही, एम्बेडेड PostgreSQL के लिए। घड़ी पहले बूट के `initdb` पूरा होने के बाद शुरू होती है, इसलिए यह प्रारंभिक डेटाबेस निर्माण के बजाय सर्वर स्टार्ट और क्रैश रिकवरी को कवर करती है। |

1.x से अपग्रेड करना: अपनी पुरानी `snapotter.db` को वॉल्यूम में `/data/snapotter.db` पर रखें और embedded मोड इसे पहली बार बूट होने पर एम्बेडेड PostgreSQL में आयात करता है। आयात एक बार चलता है; बाद के बूट इसे छोड़ देते हैं।

टेलीमेट्री नोट: embedded मोड किसी भी अन्य कॉन्फ़िगरेशन की तरह इमेज के एनालिटिक्स डिफ़ॉल्ट को विरासत में लेता है। प्रकाशित इमेज एनालिटिक्स चालू के साथ शिप होती है; इसे अक्षम करने के लिए `--build-arg SNAPOTTER_ANALYTICS=off` के साथ बिल्ड करें, या इन-ऐप admin ऑप्ट-आउट का उपयोग करें।

### Processing limits {#processing-limits}

| Variable | Default | Description |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (unlimited) | मेगाबाइट में प्रति अपलोड अधिकतम फ़ाइल आकार। असीमित के लिए 0 पर सेट करें। प्रकाशित इमेज `0` के साथ शिप होती है; सोर्स से बिल्ड 100 से शुरू होता है। |
| `MAX_BATCH_SIZE` | `0` (unlimited) | एकल बैच अनुरोध में फ़ाइलों की अधिकतम संख्या। असीमित के लिए 0 पर सेट करें। प्रकाशित इमेज `0` के साथ शिप होती है; सोर्स से बिल्ड 100 से शुरू होता है। |
| `CONCURRENT_JOBS` | `0` (auto) | समानांतर में चलने वाले बैच जॉब की संख्या। उपलब्ध CPU कोर के आधार पर स्वतः-पहचान के लिए 0 पर सेट करें। |
| `MAX_MEGAPIXELS` | `0` (unlimited) | मेगापिक्सेल में अनुमत अधिकतम इमेज रिज़ॉल्यूशन। असीमित के लिए 0 पर सेट करें। |
| `MAX_WORKER_THREADS` | `0` (auto) | इमेज प्रोसेसिंग के लिए अधिकतम वर्कर थ्रेड। उपलब्ध CPU कोर के आधार पर स्वतः-पहचान के लिए 0 पर सेट करें। |
| `PROCESSING_TIMEOUT_S` | `0` (no limit) | सेकंड में प्रति अनुरोध अधिकतम प्रोसेसिंग समय। बिना टाइमआउट के लिए 0 पर सेट करें। |
| `MAX_PIPELINE_STEPS` | `20` | एक पाइपलाइन में अधिकतम चरणों की संख्या। बिना सीमा के लिए 0 पर सेट करें। |
| `MAX_CANVAS_PIXELS` | `0` (no limit) | आउटपुट इमेज के लिए पिक्सेल में अधिकतम कैनवास आकार। बिना सीमा के लिए 0 पर सेट करें। |
| `MAX_SVG_SIZE_MB` | `50` | सैनिटाइज़ करने से पहले स्वीकार किया जाने वाला सबसे बड़ा SVG, मेगाबाइट में। यहाँ `0` आसपास की पंक्तियों से अलग व्यवहार करता है। यह पार्स-पूर्व आकार सीमा को बढ़ाने के बजाय पूरी तरह हटा देता है, इसलिए इसे सेट ही रहने दें। |
| `MAX_PDF_PAGES` | `0` (unlimited) | PDF-to-image रूपांतरण के लिए PDF पृष्ठों की अधिकतम संख्या। असीमित के लिए 0 पर सेट करें। |

### Engines {#engines}

SnapOtter कंटेनर के अंदर `$PATH` पर हर प्रोसेसिंग बाइनरी खोजता है, इसलिए जब तक आप अपना स्वयं का बिल्ड माउंट नहीं करते, तब तक ये खाली रहते हैं।

| Variable | Default | Description |
|---|---|---|
| `FFMPEG_PATH` | (empty) | वीडियो और ऑडियो टूल के पीछे `ffmpeg` बाइनरी का पथ। |
| `FFPROBE_PATH` | (empty) | `ffprobe` का पथ, जो प्रोसेस होने से पहले मीडिया फ़ाइलें पढ़ता है। इसे `FFMPEG_PATH` के समान बिल्ड पर इंगित करें। |
| `QPDF_PATH` | (empty) | `qpdf` का पथ, जिसका उपयोग PDF टूल करते हैं और अपलोड किए गए PDF की जाँच के लिए होता है। |
| `SOFFICE_PATH` | (empty) | LibreOffice के `soffice` का पथ, जिसका उपयोग office दस्तावेज़ रूपांतरणों के लिए होता है। |
| `PDFCPU_PATH` | (empty) | `pdfcpu` का पथ, जिसका उपयोग कुछ PDF टूल करते हैं। |
| `SNAPOTTER_HW_ACCEL` | (empty) | हार्डवेयर वीडियो एनकोडर परिवार, `nvenc` या `vaapi`। खाली सॉफ़्टवेयर में एनकोड करता है। |

`SNAPOTTER_HW_ACCEL` के लिए उसी एनकोडर परिवार के साथ बना ffmpeg चाहिए, और इमेज में मौजूद ffmpeg में दोनों में से कोई नहीं है। इमेज की अपनी बाइनरी के साथ यह सेटिंग सॉफ़्टवेयर एनकोडिंग पर वापस आ जाती है और स्टार्टअप लॉग में ऐसा बताती है। इसका उपयोग करने के लिए अपना ffmpeg बिल्ड माउंट करें, `FFMPEG_PATH` और `FFPROBE_PATH` को उस पर इंगित करें, और कंटेनर को GPU डिवाइस दें। `nvenc` के लिए `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video` भी सेट करें: इमेज केवल `compute,utility` मांगती है, और `video` के बिना NVIDIA रनटाइम एनकोड लाइब्रेरी माउंट नहीं करता, इसलिए एनकोडर सूचीबद्ध होता है लेकिन हर एनकोड विफल होता है। ऐसा पथ ओवरराइड जो मौजूद नहीं है या निष्पादन योग्य नहीं है, वह भी स्टार्टअप लॉग में बताया जाता है, और जब तक आप पथ ठीक नहीं करते या उसे अनसेट नहीं करते, उस बाइनरी की आवश्यकता वाला हर जॉब विफल होता रहता है।

प्रकाशित Compose फ़ाइलें सभी छह को `.env` से पास करती हैं, इसलिए उन्हें वहीं सेट करना पर्याप्त है।

### Cleanup {#cleanup}

| Variable | Default | Description |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | बिना सहेजे प्रोसेसिंग परिणाम (कच्चे अपलोड और टूल आउटपुट) स्वचालित हटाने से पहले कितने समय तक रखे जाते हैं। जिन फ़ाइलों को आप स्पष्ट रूप से Files लाइब्रेरी में सहेजते हैं वे प्रभावित नहीं होतीं और तब तक बनी रहती हैं जब तक आप उन्हें हटा नहीं देते। |
| `CLEANUP_INTERVAL_MINUTES` | `60` | क्लीनअप जॉब कितनी बार चलता है। |

### Appearance {#appearance}

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_THEME` | `light` | नए सत्रों के लिए डिफ़ॉल्ट थीम। `light`, `dark`, या `system`। |
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
      POSTGRES_PASSWORD: snapotter     # गैर-स्थानीय तैनाती के लिए इसे बदलें
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
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
