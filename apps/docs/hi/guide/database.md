---
description: "SnapOtter के लिए PostgreSQL डेटाबेस स्कीमा, टेबल, माइग्रेशन और बैकअप प्रक्रियाएँ।"
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: de28f97f3fab
i18n_hash_version: 2
---

# डेटाबेस {#database}

SnapOtter डेटा स्थायित्व के लिए [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) के साथ PostgreSQL 17 का उपयोग करता है। स्कीमा `apps/api/src/db/schema.ts` में परिभाषित है।

कनेक्शन `DATABASE_URL` एनवायरनमेंट वेरिएबल के माध्यम से कॉन्फ़िगर किया जाता है (डिफ़ॉल्ट `postgres://snapotter:snapotter@postgres:5432/snapotter`)। Docker Compose में, Postgres कंटेनर अपना डेटा `SnapOtter-pgdata` नामित वॉल्यूम में संग्रहीत करता है। अनुरोध एक ऐसी भूमिका पर सर्व किए जाते हैं जो केवल पंक्तियाँ पढ़ और लिख सकती है, जिसे नीचे [न्यूनतम-विशेषाधिकार भूमिकाएँ](#least-privilege-roles) में शामिल किया गया है।

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

### user_preferences {#user-preferences}

प्रति-उपयोगकर्ता UI स्थिति, प्राथमिकता के नाम से कुंजीबद्ध। होम पेज पर पिन किए गए टूल यहीं रखे जाते हैं, जिन्हें `PUT /api/v1/preferences` के ज़रिए लिखा जाता है।

| कॉलम | प्रकार | नोट्स |
|---|---|---|
| `userId` | text | users के लिए FK, हटाने पर कैस्केड। `key` के साथ मिलकर प्राथमिक कुंजी |
| `key` | text | प्राथमिकता का नाम। `userId` के साथ मिलकर प्राथमिक कुंजी |
| `value` | jsonb | प्राथमिकता का डेटा |
| `updatedAt` | timestamp | अंतिम लेखन समय |

## माइग्रेशन {#migrations}

Drizzle स्कीमा माइग्रेशन संभालता है। माइग्रेशन फ़ाइलें `apps/api/drizzle/` में रहती हैं। विकास के दौरान:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

प्रोडक्शन में, लंबित माइग्रेशन स्टार्टअप पर स्वचालित रूप से लागू किए जाते हैं।

## न्यूनतम-विशेषाधिकार भूमिकाएँ {#least-privilege-roles}

दो भूमिकाएँ, दो काम। `DATABASE_URL` अनुरोधों को सर्व करता है और ऐप की टेबल पर `SELECT`, `INSERT`, `UPDATE`, `DELETE` तथा उनके सीक्वेंस पर `USAGE` और `SELECT` रखता है। पूरी सूची बस इतनी ही है। यह न तो कोई टेबल बना या हटा सकता है, न कोई एक्सटेंशन इंस्टॉल कर सकता है, न `TRUNCATE` कर सकता है, न `pg_authid` पढ़ सकता है, न कोई डेटाबेस बना सकता है, न किसी भूमिका को बदल सकता है, और न ही उस `drizzle` स्कीमा को छू सकता है जहाँ माइग्रेशन इतिहास रहता है।

`DATABASE_MIGRATION_URL` विशेषाधिकार-प्राप्त वाला है। यह बूट के दौरान माइग्रेशन चलाता है और रनटाइम भूमिका को अनुदान देता है, फिर एक भी अनुरोध सर्व होने से पहले बंद हो जाता है।

Compose और ऑल-इन-वन इमेज पहले से ही इसी तरह जुड़े हुए हैं, मौजूदा इंस्टॉल भी इसमें शामिल हैं। बूट पर SnapOtter रनटाइम भूमिका न होने पर उसे बनाता है, उसे अनुदान देता है, माइग्रेट करता है, फिर पहले से मौजूद टेबल पर भी वही अनुदान लागू कर देता है। अपग्रेड करने के लिए किसी मैनुअल SQL की ज़रूरत नहीं है।

`DATABASE_MIGRATION_URL` को खाली छोड़ने पर सब कुछ एकल-भूमिका में चलता है, जहाँ `DATABASE_URL` दोनों काम ठीक वैसे ही करता है जैसे विभाजन से पहले करता था। यह एक समर्थित कॉन्फ़िगरेशन है, अप्रचलित नहीं। मैनेज्ड Postgres पर यही सही जवाब है, जहाँ भूमिकाएँ बनाना अक्सर आपके हाथ में नहीं होता।

### बाहरी और मैनेज्ड Postgres {#external-and-managed-postgres}

RDS, Supabase, Cloud SQL, या किसी भी ऐसे क्लस्टर पर जिसे आप खुद चलाते हैं, यह विभाजन वैकल्पिक है। रनटाइम भूमिका एक बार बनाएँ:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

फिर SnapOtter को दोनों कनेक्शन स्ट्रिंग दें, जो एक ही होस्ट, पोर्ट और डेटाबेस की ओर इंगित हों:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

बस इतना ही करें। SnapOtter अनुदान खुद लागू करता है और हर माइग्रेशन के बाद उन्हें दोबारा लागू करता है, इसलिए किसी भविष्य की रिलीज़ में जोड़ी गई टेबल भी बिना किसी के SQL चलाए कवर हो जाती है।

`DATABASE_MIGRATION_URL` में दी गई भूमिका के पास SnapOtter की टेबल का स्वामित्व होना चाहिए, क्योंकि किसी टेबल पर अनुदान केवल उसका स्वामी ही दे सकता है। मौजूदा इंस्टॉल पर इसका मतलब वही भूमिका है जिससे आप अब तक SnapOtter चलाते आए हैं, न कि इसी काम के लिए नई बनाई गई कोई भूमिका। इसे ऐसी नई भूमिका की ओर इंगित करें जिसके पास कुछ भी नहीं है, तो बूट ठीक यही बात कहती हुई त्रुटि के साथ विफल हो जाता है। रनटाइम भूमिका बनाने और उसे बनाए रखने के लिए इसे `CREATEROLE` भी चाहिए, और `drizzle` स्कीमा बनाने का अधिकार भी।

दोनों URL में एक ही भूमिका का नाम दें तो विभाजन बंद हो जाता है, और SnapOtter इसे छिपाने के बजाय लॉग में यह बात बता देता है। अगर आपका प्रदाता आपको ऐसी कोई भूमिका नहीं देता जो टेबल की स्वामी भी हो और `CREATEROLE` भी रखती हो, तो एकल-भूमिका में चलाएँ।

### सुपरयूज़र बिट को क्यों नहीं छेड़ा जाता {#why-the-superuser-bit-is-left-alone}

SnapOtter किसी भूमिका से `SUPERUSER` खुद कभी नहीं हटाता। विभाजन से पहले बनाए गए इंस्टॉल पर `snapotter` ही क्लस्टर का एकमात्र सुपरयूज़र होता है, और उसे नीचे उतारने पर क्लस्टर के पास एक भी सुपरयूज़र नहीं बचेगा, जिसकी भरपाई केवल सर्वर बंद करके सिंगल-यूज़र मोड से ही हो सकती है। इसके बजाय सुरक्षा इस बात से मिलती है कि लंबे समय तक चलने वाला कनेक्शन प्रतिबंधित भूमिका पर ले जाया गया है। सुपरयूज़र बूट के चंद सेकंड के लिए ही तार पर रहता है और फिर चला जाता है।

नए ऑल-इन-वन इंस्टॉल में यह समस्या कभी नहीं आती। उन्हें तीन भूमिकाएँ मिलती हैं: `postgres` (बूटस्ट्रैप सुपरयूज़र, SnapOtter द्वारा उपयोग की जाने वाली हर कनेक्शन स्ट्रिंग से अनुपस्थित), `snapotter` (`NOSUPERUSER`, डेटा का स्वामी, केवल बूट पर कनेक्ट होता है), और `snapotter_app` (केवल पंक्तियाँ, अनुरोध सर्व करता है)।

किसी पुराने `snapotter` को फिर भी नीचे उतारना हो, तो पहले एक दूसरा सुपरयूज़र बनाएँ और उससे लॉग इन करके पुष्टि करें कि वह काम करता है। इसके बाद `ALTER ROLE snapotter NOSUPERUSER`।

## बैकअप लें और {#backup-and-restore} को पुनर्स्थापित करें

रिलेशनल डेटाबेस पोस्टग्रेज कंटेनर के `SnapOtter-pgdata` वॉल्यूम में रहता है, ऐप के `/data` वॉल्यूम में नहीं।

**सत्यापन के साथ तार्किक बैकअप (अनुशंसित)**

```bash
# Dump into PostgreSQL's portable custom archive format
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore into a fresh/disposable target first and fail on the first SQL error
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

दोनों कमांड स्वामी `snapotter` के रूप में कनेक्ट होते हैं, और उन्हें ऐसा ही करते रहना चाहिए। रनटाइम भूमिका `drizzle` स्कीमा को नहीं देख सकती, इसलिए उस भूमिका से लिया गया डंप अधूरा निकलेगा। `--no-owner` पुनर्स्थापित ऑब्जेक्ट का स्वामित्व उसी के पास छोड़ देता है जो पुनर्स्थापन चलाता है, इसलिए इसे स्वामी के रूप में चलाने से स्वामित्व वहीं पहुँचता है जहाँ अनुदान उसकी अपेक्षा करते हैं। नए क्लस्टर पर एक पेच है: `pg_dump` अनुदान तो साथ ले जाता है, पर जिन भूमिकाओं का नाम वे लेते हैं उन्हें नहीं, इसलिए पुनर्स्थापित करने से पहले `snapotter_app` बना लें वरना `--exit-on-error` पहले ही `GRANT` पर रुक जाएगा। इसके बावजूद SnapOtter अगले बूट पर अनुदान दोबारा लागू कर देता है।

इस डेटाबेस डंप में `/data/files` या Redis में टिकाऊ BullMQ स्थिति में सहेजे गए लाइब्रेरी ऑब्जेक्ट शामिल नहीं हैं। [सुरक्षा और हार्डनिंग](/hi/guide/security#backup-and-recovery) में समन्वित प्रक्रिया के साथ उनका बैकअप लें और पुनर्स्थापित करें।

**कोल्ड वॉल्यूम स्नैपशॉट**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

`tar` के साथ लाइव PostgreSQL डेटा निर्देशिका की प्रतिलिपि न बनाएं। प्रोजेक्ट के अनुसार उपसर्ग वॉल्यूम नाम लिखें, इसलिए शाब्दिक लेबल `SnapOtter-pgdata` मानने के बजाय `docker inspect` या अपने स्टोरेज प्लेटफ़ॉर्म से माउंटेड वॉल्यूम आईडी को हल करें।

### 1.x (SQLite) से माइग्रेट करना {#migrating-from-1-x-sqlite}

SnapOtter 1.x से अपग्रेड करने की अपनी अलग गाइड है: [Upgrading from 1.x to 2.0](./upgrading) देखें। संक्षेप में, अपने मौजूदा `/data` वॉल्यूम का पुनः उपयोग करें और 2.0 पहले बूट पर `/data/snapotter.db` का स्वतः पता लगाकर उसे इम्पोर्ट करता है (या इसे स्पष्ट रूप से इंगित करने के लिए `SQLITE_MIGRATE_PATH` सेट करें)। पहले पूरे `/data` वॉल्यूम का बैकअप लें, केवल `snapotter.db` का नहीं: 1.x SQLite WAL मोड का उपयोग करता है, इसलिए एक रुका हुआ कंटेनर अक्सर अपना अधिकांश डेटा एक लगभग-खाली `snapotter.db` के बगल में `snapotter.db-wal` में छोड़ देता है।
