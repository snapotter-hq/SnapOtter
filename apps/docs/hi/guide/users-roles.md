---
description: "SnapOtter में उपयोगकर्ता, बिल्ट-इन और कस्टम roles, permissions, API keys, teams, sessions, और ऑडिट लॉग प्रबंधित करें।"
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: 0afc852d07c9
---

# उपयोगकर्ता, Roles और Permissions {#users-roles-permissions}

SnapOtter तीन बिल्ट-इन roles, 17 सूक्ष्म permissions, और वैकल्पिक प्रति-टूल एक्सेस नियंत्रण के साथ कस्टम roles का समर्थन प्रदान करता है। यह पेज पूर्ण अधिकृति मॉडल, API key स्कोपिंग, टीम प्रबंधन, और ऑडिट लॉगिंग को कवर करता है।

::: tip संबंधित पेज
[OIDC / SSO](/hi/guide/oidc) | [SAML SSO](/hi/guide/saml) | [SCIM Provisioning](/hi/guide/scim) | [Security & Hardening](/hi/guide/security)
:::

## उपयोगकर्ता {#users}

### उपयोगकर्ता बनाना {#creating-users}

एडमिन एडमिन पैनल या `POST /api/auth/register` एंडपॉइंट के माध्यम से उपयोगकर्ता बना सकते हैं। हर उपयोगकर्ता के पास एक उपयोगकर्ता नाम, role, टीम असाइनमेंट, और एक वैकल्पिक ईमेल पता होता है।

### डिफ़ॉल्ट एडमिन {#default-admin}

पहली बार स्टार्टअप पर SnapOtter एक डिफ़ॉल्ट एडमिन अकाउंट बनाता है। क्रेडेंशियल एनवायरनमेंट वेरिएबल से आते हैं:

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | प्रारंभिक एडमिन अकाउंट के लिए उपयोगकर्ता नाम |
| `DEFAULT_PASSWORD` | `admin` | प्रारंभिक एडमिन अकाउंट के लिए पासवर्ड |

डिफ़ॉल्ट एडमिन को पहले लॉगिन पर अपना पासवर्ड बदलना आवश्यक है।

### प्रमाणीकरण प्रदाता {#authentication-providers}

उपयोगकर्ता कई विधियों से प्रमाणित हो सकते हैं:

- **Local** - SnapOtter डेटाबेस में संग्रहीत उपयोगकर्ता नाम और पासवर्ड
- **OIDC** - कोई भी OpenID Connect प्रदाता ([OIDC / SSO](/hi/guide/oidc) देखें)
- **SAML** - SAML 2.0 पहचान प्रदाता ([SAML SSO](/hi/guide/saml) देखें)
- **SCIM** - किसी पहचान प्रदाता से स्वचालित प्रोविज़निंग ([SCIM Provisioning](/hi/guide/scim) देखें)

### प्रमाणीकरण अक्षम करना {#disabling-authentication}

प्रमाणीकरण को पूरी तरह अक्षम करने के लिए `AUTH_ENABLED=false` सेट करें। इस मोड में सभी अनुरोधों के लिए `admin` role वाला एक सिंथेटिक अनाम उपयोगकर्ता उपयोग होता है। किसी लॉगिन की आवश्यकता नहीं होती।

::: warning 
प्रमाणीकरण अक्षम करने से इंस्टेंस तक पहुँच सकने वाले किसी भी व्यक्ति को पूर्ण एडमिन एक्सेस मिल जाता है। इसका उपयोग केवल भरोसेमंद वातावरण में करें।
:::

## बिल्ट-इन roles {#built-in-roles}

SnapOtter में तीन बिल्ट-इन roles शामिल हैं। इन्हें संशोधित या हटाया नहीं जा सकता।

### Admin {#admin}

सभी 17 permissions। इंस्टेंस पर पूर्ण नियंत्रण।

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Editor {#editor}

7 permissions। सभी टूल का उपयोग कर सकता है और सभी फ़ाइलें व pipelines प्रबंधित कर सकता है, लेकिन एडमिन फ़ंक्शन तक नहीं पहुँच सकता।

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### User {#user}

5 permissions। टूल का उपयोग कर सकता है और अपने स्वयं के संसाधन प्रबंधित कर सकता है।

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## Permissions संदर्भ {#permissions-reference}

| Permission | Description |
|---|---|
| `tools:use` | किसी भी प्रोसेसिंग टूल का उपयोग करना |
| `files:own` | अपनी फ़ाइलें देखना और प्रबंधित करना |
| `files:all` | सभी उपयोगकर्ताओं की फ़ाइलें देखना और प्रबंधित करना |
| `apikeys:own` | अपनी API keys बनाना और प्रबंधित करना |
| `apikeys:all` | सभी उपयोगकर्ताओं की API keys देखना |
| `pipelines:own` | अपनी pipelines बनाना और प्रबंधित करना |
| `pipelines:all` | सभी उपयोगकर्ताओं की pipelines देखना और प्रबंधित करना |
| `settings:read` | इंस्टेंस सेटिंग्स देखना |
| `settings:write` | इंस्टेंस सेटिंग्स संशोधित करना |
| `users:manage` | उपयोगकर्ता अकाउंट बनाना, अपडेट करना, और हटाना |
| `teams:manage` | teams बनाना, अपडेट करना, और हटाना |
| `features:manage` | AI फ़ीचर बंडल इंस्टॉल और प्रबंधित करना |
| `system:health` | health और readiness एंडपॉइंट तक पहुँचना |
| `audit:read` | ऑडिट लॉग देखना और roles सूचीबद्ध करना |
| `compliance:manage` | GDPR लाइफ़साइकल और अनुपालन फ़ीचर प्रबंधित करना |
| `webhooks:manage` | आउटबाउंड webhooks कॉन्फ़िगर करना |
| `security:manage` | सुरक्षा सेटिंग्स प्रबंधित करना (IP allowlist, SSO प्रवर्तन) |

## कस्टम roles {#custom-roles}

`security:manage` permission वाले एडमिन एडमिन पैनल या roles API के माध्यम से कस्टम roles बना सकते हैं। roles सूचीबद्ध करने के लिए `audit:read` आवश्यक है।

### कस्टम role बनाना {#creating-a-custom-role}

```bash
curl -X POST http://localhost:1349/api/v1/roles \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "reviewer",
    "description": "Can use tools and view all files",
    "permissions": ["tools:use", "files:own", "files:all", "settings:read"]
  }'
```

Role नाम 2-30 अक्षरों के होने चाहिए, लोअरकेस अल्फ़ान्यूमेरिक, हाइफ़न और अंडरस्कोर के साथ।

### एडमिन-आरक्षित permissions {#admin-reserved-permissions}

तीन permissions बिल्ट-इन roles के लिए आरक्षित हैं और कस्टम roles को नहीं सौंपी जा सकतीं:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

roles API इन permissions को शामिल करने वाले किसी भी अनुरोध को अस्वीकार कर देता है। केवल बिल्ट-इन `admin` role के पास इन तक पहुँच है।

### टूल-स्तरीय permissions {#tool-level-permissions}

कस्टम roles वैकल्पिक रूप से सीमित कर सकते हैं कि उपयोगकर्ता किन टूल तक पहुँच सकते हैं। दो मोड उपलब्ध हैं:

| Mode | Behavior | License requirement |
|---|---|---|
| `category` | मोडैलिटी के अनुसार सीमित करें (image, video, audio, document, file) | कोई नहीं (निःशुल्क) |
| `tool` | व्यक्तिगत टूल ID के अनुसार सीमित करें | `per_tool_permissions` enterprise फ़ीचर आवश्यक है |

जब `tool` मोड सेट होता है लेकिन enterprise फ़ीचर उपलब्ध नहीं होता, तो SnapOtter शालीनता से गिरावट करता है और सभी टूल तक पहुँच की अनुमति देता है।

```json
{
  "name": "image-only",
  "permissions": ["tools:use", "files:own"],
  "toolPermissions": {
    "mode": "category",
    "allowed": ["image"]
  }
}
```

### कस्टम role हटाना {#deleting-a-custom-role}

जब कोई कस्टम role हटाया जाता है, तो इसे सौंपे गए सभी उपयोगकर्ता स्वचालित रूप से `user` role में पुनः-असाइन कर दिए जाते हैं।

## Teams {#teams}

Teams स्टोरेज और रिटेंशन प्रबंधन के लिए उपयोगकर्ताओं को समूहित करती हैं। पहली बार स्टार्टअप पर एक `Default` टीम बनाई जाती है।

| Field | Type | Description |
|---|---|---|
| `name` | string | अद्वितीय टीम नाम (1-50 अक्षर) |
| `storageQuota` | number | बाइट्स में प्रति-टीम स्टोरेज सीमा (enterprise के बिना काम करती है) |
| `retentionHours` | number | इतने घंटों के बाद आउटपुट स्वतः-हटाएँ (`team_retention_overrides` आवश्यक है, enterprise) |
| `legalHold` | boolean | टीम सदस्यों की फ़ाइलों के स्वचालित विलोपन को रोकें (`legal_hold` आवश्यक है, enterprise) |

::: info 
`Default` टीम को हटाया नहीं जा सकता। जिन teams में अब भी सदस्य हैं उन्हें हटाया नहीं जा सकता। पहले सदस्यों को पुनः-असाइन करें।
:::

## API keys {#api-keys}

उपयोगकर्ता प्रोग्रामेटिक एक्सेस के लिए API keys जनरेट कर सकते हैं। हर key `si_` प्रीफ़िक्स का उपयोग करती है और निर्माण के समय केवल एक बार दिखाई जाती है।

### स्कोप्ड permissions {#scoped-permissions}

API keys वैकल्पिक रूप से एक `permissions` ऐरे ले जा सकती हैं। जब सेट किया जाता है, तो किसी अनुरोध के लिए प्रभावी permissions उपयोगकर्ता के role permissions और key की स्कोप्ड permissions का **intersection** होती हैं। इसका अर्थ है कि एक API key कभी भी उपयोगकर्ता की अपनी permissions से आगे नहीं बढ़ सकती।

```bash
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI pipeline key",
    "permissions": ["tools:use", "files:own"],
    "expiresAt": "2027-01-01T00:00:00Z"
  }'
```

### समाप्ति {#expiration}

Keys एक वैकल्पिक `expiresAt` टाइमस्टैम्प स्वीकार करती हैं। समाप्त हो चुकी keys प्रमाणीकरण के समय अस्वीकार कर दी जाती हैं।

## ऑडिट लॉग {#audit-log}

SnapOtter सुरक्षा-संबंधी घटनाओं को `audit_log` डेटाबेस टेबल में संग्रहीत एक संरचित ऑडिट लॉग में रिकॉर्ड करता है।

### ऑडिट लॉग देखना {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

`audit:read` permission आवश्यक है। पेजिनेशन (`page`, `limit`) और फ़िल्टर (`action`, `ip`, `from`, `to`) का समर्थन करता है।

### टूल ऑपरेशन ऑडिटिंग {#tool-operation-auditing}

::: warning 
`TOOL_EXECUTED` घटनाएँ डिफ़ॉल्ट रूप से लॉग **नहीं** होतीं। वे दो पथों में से किसी एक के माध्यम से ऑप्ट-इन हैं:

1. `auditToolOperations` एडमिन सेटिंग को `true` पर सेट करें।
2. `audit_export` फ़ीचर वाला एक सक्रिय लाइसेंस रखें (team और enterprise दोनों प्लान पर उपलब्ध)।

इनमें से किसी एक के बिना, व्यक्तिगत टूल निष्पादन ऑडिट लॉग में रिकॉर्ड नहीं होते।
:::

### एक्सपोर्ट करना {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

`audit:read` permission और `audit_export` enterprise फ़ीचर आवश्यक है (team और enterprise दोनों प्लान पर उपलब्ध)। CSV और JSON फ़ॉर्मैट का समर्थन करता है, `action`, `actorId`, `targetType`, `targetId`, `from`, और `to` के अनुसार फ़िल्टर किया जाता है।

### छेड़छाड़-प्रतिरोधी हस्ताक्षर {#tamper-resistant-signing}

सक्षम होने पर, हर ऑडिट लॉग एंट्री को `DATA_ENCRYPTION_KEY` से व्युत्पन्न एक HMAC के साथ हस्ताक्षरित किया जाता है। इसके लिए आवश्यक है:

1. अपने एनवायरनमेंट में `DATA_ENCRYPTION_KEY` सेट करना।
2. `tamperResistantAudit` एडमिन सेटिंग सक्षम करना।
3. `tamper_resistant_audit` फ़ीचर वाला एक enterprise लाइसेंस।

### रिटेंशन {#retention}

पुरानी एंट्रियों को स्वचालित रूप से हटाने के लिए `AUDIT_RETENTION_DAYS` सेट करें। डिफ़ॉल्ट `0` है, जिसका अर्थ है कि एंट्रियाँ अनिश्चित काल तक रखी जाती हैं।

### घटना संदर्भ {#event-reference}

| Event | Category |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | Authentication |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | Authentication |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | Authentication |
| `LOGOUT` | Authentication |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | User management |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | User management |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Roles |
| `API_KEY_CREATED`, `API_KEY_DELETED` | API keys |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | Settings |
| `FILE_UPLOADED`, `FILE_DELETED` | Files |
| `TOOL_EXECUTED` | Tools (ऑप्ट-इन) |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | Compliance |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | Compliance |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | Configuration |

## सत्र प्रबंधन {#session-management}

सत्र कुकी-आधारित होते हैं, `SESSION_DURATION_HOURS` द्वारा नियंत्रित (डिफ़ॉल्ट: 168 घंटे / 7 दिन)।

### Role बदलाव सत्रों को अमान्य करते हैं {#role-changes-invalidate-sessions}

जब कोई एडमिन किसी उपयोगकर्ता का role बदलता है, तो उस उपयोगकर्ता के सभी सक्रिय सत्र हटा दिए जाते हैं। उपयोगकर्ता को अपनी नई permissions प्राप्त करने के लिए फिर से लॉग इन करना होगा।

### सुरक्षा गार्ड {#safety-guards}

- **अंतिम-एडमिन सुरक्षा**: अंतिम शेष एडमिन को किसी निचले role में डिमोट नहीं किया जा सकता। यदि आप ऐसा करने की कोशिश करते हैं तो API एक त्रुटि लौटाता है।
- **स्व-विलोपन रोकथाम**: एडमिन API के माध्यम से अपना खुद का अकाउंट नहीं हटा सकते।
