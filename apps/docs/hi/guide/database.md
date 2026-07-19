---
description: "SnapOtter के लिए PostgreSQL डेटाबेस स्कीमा, टेबल, माइग्रेशन और बैकअप प्रक्रियाएँ।"
i18n_source_hash: 50d5d4f220cf
i18n_provenance: human
i18n_output_hash: 5592d4435806
---

# डेटाबेस {#database}

SnapOtter डेटा स्थायित्व के लिए [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) के साथ PostgreSQL 17 का उपयोग करता है। स्कीमा `apps/api/src/db/schema.ts` में परिभाषित है।

कनेक्शन `DATABASE_URL` एनवायरनमेंट वेरिएबल के माध्यम से कॉन्फ़िगर किया जाता है (डिफ़ॉल्ट `postgres://snapotter:snapotter@postgres:5432/snapotter`)। Docker Compose में, Postgres कंटेनर अपना डेटा `SnapOtter-pgdata` नामित वॉल्यूम में संग्रहीत करता है।

## टेबल {#tables}

### users {#users}

उपयोगकर्ता खातों को संग्रहीत करता है। `DEFAULT_USERNAME` और `DEFAULT_PASSWORD` से पहले रन पर स्वचालित रूप से बनाया जाता है।

| कॉलम | प्रकार | नोट्स |
|---|---|---|
| `id` | uuid | प्राथमिक कुंजी |
| `username` | varchar | अद्वितीय, आवश्यक |
| `passwordHash` | varchar | scrypt हैश |
| `role` | varchar | `admin`, `editor`, या `user` |
| `mustChangePassword` | boolean | अनिवार्य पासवर्ड रीसेट फ़्लैग |
| `createdAt` | timestamp | बनाने का समय |
| `updatedAt` | timestamp | अंतिम अपडेट समय |

### sessions {#sessions}

सक्रिय लॉगिन सत्र। प्रत्येक पंक्ति एक सत्र टोकन को एक उपयोगकर्ता से जोड़ती है।

| कॉलम | प्रकार | नोट्स |
|---|---|---|
| `id` | varchar | प्राथमिक कुंजी (सत्र टोकन) |
| `userId` | uuid | `users.id` के लिए फ़ॉरेन कुंजी |
| `expiresAt` | timestamp | समाप्ति समय |
| `createdAt` | timestamp | बनाने का समय |

### teams {#teams}

उपयोगकर्ताओं को व्यवस्थित करने के लिए समूह। एडमिन उपयोगकर्ताओं को टीमों में असाइन कर सकते हैं।

| कॉलम | प्रकार | विवरण |
|--------|------|-------------|
| `id` | uuid | प्राथमिक कुंजी |
| `name` | varchar (अद्वितीय, अधिकतम 50 वर्ण) | टीम का नाम |
| `createdAt` | timestamp | बनाने का समय |

### api_keys {#api-keys}

प्रोग्रामेटिक एक्सेस के लिए API कुंजियाँ। कच्ची कुंजी निर्माण पर एक बार दिखाई जाती है; केवल हैश संग्रहीत किया जाता है।

| कॉलम | प्रकार | नोट्स |
|---|---|---|
| `id` | uuid | प्राथमिक कुंजी |
| `userId` | uuid | `users.id` के लिए फ़ॉरेन कुंजी |
| `keyHash` | varchar | कुंजी का scrypt हैश |
| `name` | varchar | उपयोगकर्ता द्वारा दिया गया लेबल |
| `createdAt` | timestamp | बनाने का समय |
| `lastUsedAt` | timestamp | प्रत्येक प्रमाणित अनुरोध पर अपडेट किया जाता है |

कुंजियाँ `si_` से उपसर्गित होती हैं जिसके बाद 96 हेक्स वर्ण होते हैं (48 रैंडम बाइट्स)।

### pipelines {#pipelines}

सहेजे गए टूल चेन जिन्हें उपयोगकर्ता UI में बनाते हैं।

| कॉलम | प्रकार | नोट्स |
|---|---|---|
| `id` | uuid | प्राथमिक कुंजी |
| `name` | varchar | पाइपलाइन का नाम |
| `description` | varchar | वैकल्पिक विवरण |
| `steps` | jsonb | `{ toolId, settings }` ऑब्जेक्ट का ऐरे |
| `createdAt` | timestamp | बनाने का समय |

### user_files {#user-files}

स्थायी फ़ाइल लाइब्रेरी। सहेजा गया संपादन डिफ़ॉल्ट रूप से एक स्वतंत्र रूट पंक्ति के रूप में डाला जाता है ("नई के रूप में सहेजें": `version` 1, `parentId` null, ताकि मूल सूचीबद्ध रहे), या जब आप मूल को अधिलेखित करते हैं तो एक पैरेंट-लिंक्ड संस्करण के रूप में (`parentId` सेट, `version` बढ़ा हुआ, उसे प्रतिस्थापित करते हुए)। `toolChain` कॉलम लागू किए गए टूल को रिकॉर्ड करता है।

| कॉलम | प्रकार | विवरण |
|--------|------|-------------|
| `id` | uuid | प्राथमिक कुंजी |
| `userId` | uuid | users के लिए FK (CASCADE DELETE) |
| `originalName` | varchar | मूल अपलोड फ़ाइलनाम |
| `storedName` | varchar | डिस्क पर फ़ाइलनाम |
| `mimeType` | varchar | MIME प्रकार |
| `size` | integer | बाइट्स में फ़ाइल का आकार |
| `width` | integer | px में छवि की चौड़ाई |
| `height` | integer | px में छवि की ऊँचाई |
| `version` | integer | संस्करण संख्या (1 = मूल) |
| `parentId` | uuid या null | user_files के लिए FK (पैरेंट संस्करण) |
| `toolChain` | jsonb | इस संस्करण को बनाने के लिए क्रम में लागू किए गए टूल ID |
| `createdAt` | timestamp | बनाने का समय |

### jobs {#jobs}

प्रगति रिपोर्टिंग और सफ़ाई के लिए प्रोसेसिंग जॉब को ट्रैक करता है।

| कॉलम | प्रकार | नोट्स |
|---|---|---|
| `id` | uuid | प्राथमिक कुंजी |
| `type` | varchar | टूल या पाइपलाइन पहचानकर्ता |
| `status` | varchar | `queued`, `processing`, `completed`, या `failed` |
| `progress` | real | 0.0-1.0 अंश |
| `inputFiles` | jsonb | इनपुट फ़ाइल पथों का ऐरे |
| `outputPath` | varchar | परिणाम फ़ाइल का पथ |
| `settings` | jsonb | उपयोग की गई टूल सेटिंग्स |
| `error` | varchar | विफल होने पर त्रुटि संदेश |
| `createdAt` | timestamp | बनाने का समय |
| `completedAt` | timestamp | पूर्ण होने का समय |

### settings {#settings}

सर्वर-व्यापी सेटिंग्स के लिए की-वैल्यू स्टोर जिन्हें एडमिन UI से बदल सकते हैं।

| कॉलम | प्रकार | नोट्स |
|---|---|---|
| `key` | varchar | प्राथमिक कुंजी |
| `value` | varchar | सेटिंग मान |
| `updatedAt` | timestamp | अंतिम अपडेट समय |

### roles {#roles}

सूक्ष्म अनुमतियों वाली कस्टम भूमिकाएँ।

| कॉलम | प्रकार | नोट्स |
|---|---|---|
| `id` | uuid | प्राथमिक कुंजी |
| `name` | varchar | अद्वितीय भूमिका नाम |
| `description` | varchar | वैकल्पिक विवरण |
| `permissions` | jsonb | अनुमति स्ट्रिंग्स का ऐरे |
| `createdAt` | timestamp | बनाने का समय |

### audit_log {#audit-log}

सुरक्षा-प्रासंगिक क्रिया लॉग।

| कॉलम | प्रकार | नोट्स |
|---|---|---|
| `id` | uuid | प्राथमिक कुंजी |
| `userId` | uuid | users के लिए FK |
| `action` | varchar | क्रिया प्रकार |
| `details` | jsonb | क्रिया-विशिष्ट डेटा |
| `createdAt` | timestamp | क्रिया का समय |

## माइग्रेशन {#migrations}

Drizzle स्कीमा माइग्रेशन संभालता है। माइग्रेशन फ़ाइलें `apps/api/drizzle/` में रहती हैं। विकास के दौरान:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

प्रोडक्शन में, लंबित माइग्रेशन स्टार्टअप पर स्वचालित रूप से लागू किए जाते हैं।

## बैकअप और रिस्टोर {#backup-and-restore}

रिलेशनल डेटाबेस Postgres कंटेनर के `SnapOtter-pgdata` वॉल्यूम में रहता है, ऐप के `/data` वॉल्यूम में नहीं।

**विकल्प 1: pg_dump (अनुशंसित)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**विकल्प 2: वॉल्यूम स्नैपशॉट**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### 1.x (SQLite) से माइग्रेट करना {#migrating-from-1-x-sqlite}

SnapOtter 1.x से अपग्रेड करने की अपनी अलग गाइड है: [Upgrading from 1.x to 2.0](./upgrading) देखें। संक्षेप में, अपने मौजूदा `/data` वॉल्यूम का पुनः उपयोग करें और 2.0 पहले बूट पर `/data/snapotter.db` का स्वतः पता लगाकर उसे इम्पोर्ट करता है (या इसे स्पष्ट रूप से इंगित करने के लिए `SQLITE_MIGRATE_PATH` सेट करें)। पहले पूरे `/data` वॉल्यूम का बैकअप लें, केवल `snapotter.db` का नहीं: 1.x SQLite WAL मोड का उपयोग करता है, इसलिए एक रुका हुआ कंटेनर अक्सर अपना अधिकांश डेटा एक लगभग-खाली `snapotter.db` के बगल में `snapotter.db-wal` में छोड़ देता है।
