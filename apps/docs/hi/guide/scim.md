---
description: "अपने identity provider से SnapOtter में users और groups को sync करने के लिए SCIM 2.0 provisioning सेट करें। Okta, Azure AD / Entra ID, और custom integrations को कवर करता है।"
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: cec58a6b3f0c
---

# SCIM Provisioning {#scim-provisioning}

SnapOtter स्वचालित user और group provisioning के लिए SCIM 2.0 (System for Cross-domain Identity Management) लागू करता है। आपका identity provider user accounts को स्वचालित रूप से बना, अपडेट, निष्क्रिय, और पुनः सक्रिय कर सकता है और group memberships को sync कर सकता है।

::: tip Enterprise feature
SCIM provisioning के लिए `scim` feature वाली एक **enterprise** license आवश्यक है। यह team plan पर उपलब्ध नहीं है। इस feature के बिना, सभी SCIM endpoints (discovery को छोड़कर) 403 लौटाते हैं।
:::

## Prerequisites {#prerequisites}

- एक चालू SnapOtter instance जो एक public URL पर पहुँच योग्य हो
- `scim` feature वाली एक enterprise license key
- SnapOtter तक admin access (SCIM token जनरेट या रद्द करने के लिए `users:manage` permission आवश्यक है)
- आपके identity provider की provisioning settings तक admin access

## Quick start {#quick-start}

1. एक SCIM bearer token जनरेट करें:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

Response में token होता है। इसे तुरंत सहेजें; इसे फिर से प्राप्त नहीं किया जा सकता।

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. अपने identity provider में, SCIM provisioning को इनके साथ configure करें:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Authentication**: Bearer token (step 1 का token पेस्ट करें)

## Authentication {#authentication}

SCIM endpoints एक समर्पित Bearer token का उपयोग करते हैं, जो user sessions और API keys से अलग है।

### Generating a token {#generating-a-token}

`POST /api/v1/enterprise/scim/token` एक नया SCIM token जनरेट करता है। इस endpoint के लिए `users:manage` permission वाला एक वैध session आवश्यक है।

Token plaintext में ठीक एक बार लौटाया जाता है। SnapOtter केवल एक scrypt hash संग्रहीत करता है। यदि आप token खो देते हैं, तो उसे रद्द करें और एक नया जनरेट करें।

एक समय में केवल एक SCIM token सक्रिय रहता है। एक नया token जनरेट करने से पिछला token बदल जाता है।

### Revoking a token {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` वर्तमान SCIM token को रद्द करता है। इस endpoint के लिए भी `users:manage` आवश्यक है।

### Rate limiting {#rate-limiting}

SCIM endpoints प्रति token प्रति मिनट 1000 requests तक rate-limited हैं। इस सीमा से अधिक होने पर HTTP 429 लौटाया जाता है।

## Supported resources {#supported-resources}

| SCIM resource | SnapOtter concept | Create | Read | Update | Delete |
|---|---|---|---|---|---|
| User | User account | Yes | Yes | Yes | Soft delete |
| Group | Team | Yes | Yes | Yes | Yes |

::: warning 
SCIM Groups SnapOtter **teams** से मैप होते हैं, roles से नहीं। SCIM किसी user की role सेट नहीं कर सकता। SCIM के माध्यम से बनाए गए सभी users को `user` role सौंपी जाती है। किसी user की role बदलने के लिए, SnapOtter admin UI का उपयोग करें।
:::

## User operations {#user-operations}

### Create user {#create-user}

`POST /api/v1/scim/v2/Users`

`authProvider` को `scim` पर सेट करके और `user` role के साथ एक नया user account बनाता है। User को Default team में सौंपा जाता है। यदि `active` `false` है, तो इसके बजाय role को `disabled` पर सेट किया जाता है।

आवश्यक attributes: `userName`. वैकल्पिक: `externalId`, `emails`, `active` (default `true`).

### List and filter users {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

users की एक paginated सूची लौटाता है। `startIndex` और `count` query parameters का समर्थन करता है (अधिकतम 200 results प्रति page)।

Filtering केवल इन attributes पर `eq` (equals) का समर्थन करती है:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

अन्य filter operators और attributes HTTP 400 लौटाते हैं।

### Get user {#get-user}

`GET /api/v1/scim/v2/Users/:id`

किसी user को उसके SnapOtter user ID द्वारा एकल रूप में लौटाता है।

### Replace user {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

user के attributes को बदल देता है। `userName`, `externalId`, `emails`, और `active` का समर्थन करता है। Username परिवर्तनों को conflicts के लिए जाँचा जाता है (409 यदि नया username किसी अन्य user द्वारा लिया गया है)।

### Patch user {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

SCIM PatchOp का उपयोग करके आंशिक अपडेट। समर्थित operations:

| Operation | Paths |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | `replace` के समान |
| `remove` | `externalId`, `emails` |

`name.formatted` और `displayName` paths संगतता के लिए स्वीकार किए जाते हैं लेकिन उनका कोई स्थायी प्रभाव नहीं होता (SnapOtter एक अलग display name संग्रहीत नहीं करता)।

Valueless `replace` operations (जहाँ value एक object है जिसमें `path` नहीं है) भी समर्थित हैं, keys `userName`, `externalId`, `emails`, और `active` के साथ।

### Deactivate user (soft delete) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter SCIM के माध्यम से users को hard-delete नहीं करता। इसके बजाय, DELETE एक soft deactivation करता है:

1. user की role उसके वर्तमान मान (जैसे `editor`) से `disabled:editor` में बदल दी जाती है, मूल role को संरक्षित करते हुए।
2. user का password साफ़ कर दिया जाता है।
3. सभी सक्रिय sessions रद्द कर दिए जाते हैं।
4. सभी API keys रद्द कर दी जाती हैं।

user अब log in नहीं कर सकता या किसी API key का उपयोग नहीं कर सकता। उनका data (files, history) बरकरार रहता है।

### Reactivate user {#reactivate-user}

पहले से निष्क्रिय किए गए user को पुनः सक्रिय करने के लिए, `active: true` के साथ एक `PUT` या `PATCH` request भेजें। SnapOtter deactivation से पहले की मूल role को पुनर्स्थापित करता है (जैसे `disabled:editor` फिर से `editor` बन जाता है)। यदि मूल role निर्धारित नहीं की जा सकती, तो यह `user` पर वापस आ जाती है।

::: details उदाहरण: PATCH के माध्यम से deactivate और reactivate
```json
// Deactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": false }
  ]
}

// Reactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": true }
  ]
}
```
:::

## Group operations {#group-operations}

SCIM Groups SnapOtter teams से मैप होते हैं। एक group बनाने से एक team बनती है। Group membership नियंत्रित करती है कि कोई user किस team से संबंधित है।

### Create group {#create-group}

`POST /api/v1/scim/v2/Groups`

आवश्यक: `displayName`. वैकल्पिक: `members` (`{ value: userId }` का array)।

### List and filter groups {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

Filtering केवल `displayName eq "..."` का समर्थन करती है। `startIndex` और `count` के साथ paginated (अधिकतम 200 results प्रति page)।

### Get group {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### Replace group {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

group name और पूरी membership सूची को बदल देता है। नई सूची में न होने वाले मौजूदा members को Default team में स्थानांतरित कर दिया जाता है।

### Patch group {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

इन operations का समर्थन करता है:

| Operation | Path | Effect |
|---|---|---|
| `add` | `members` | users को team में जोड़ता है |
| `remove` | `members[value eq "userId"]` | user को Default team में स्थानांतरित करता है |
| `replace` | `displayName` | team का नाम बदलता है |
| `replace` | `members` | सभी members को बदल देता है (हटाए गए members Default team में चले जाते हैं) |

### Delete group {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

team को हटा देता है। हटाई गई team के सभी members को Default team में स्थानांतरित कर दिया जाता है। users को निष्क्रिय या हटाया नहीं जाता।

## IdP setup {#idp-setup}

### Okta {#okta}

1. Okta admin console में, अपना SnapOtter application खोलें (या एक बनाएँ)।
2. **Provisioning** tab पर जाएँ और **Configure API Integration** क्लिक करें।
3. **Enable API Integration** चेक करें और दर्ज करें:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API Token**: ऊपर जनरेट किया गया SCIM bearer token
4. **Test API Credentials** क्लिक करें, फिर **Save** क्लिक करें।
5. **Provisioning > To App** के तहत, सक्षम करें:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. **Push Groups** के तहत, configure करें कि कौन से Okta groups को SnapOtter teams के रूप में sync करना है।

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Azure portal में, अपने SnapOtter enterprise application पर जाएँ।
2. **Provisioning** पर जाएँ और **Provisioning Mode** को **Automatic** पर सेट करें।
3. **Admin Credentials** के तहत, दर्ज करें:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: ऊपर जनरेट किया गया SCIM bearer token
4. **Test Connection** क्लिक करें, फिर **Save** क्लिक करें।
5. **Mappings** के तहत, user और group attribute mappings को configure करें। Defaults आमतौर पर काम करते हैं, लेकिन सत्यापित करें कि `userName` इच्छानुसार `userPrincipalName` या `mail` पर मैप होता है।
6. **Provisioning Status** को **On** पर सेट करें और सहेजें।

Azure एक निश्चित sync cycle पर users और groups को provision करता है (आमतौर पर हर 40 मिनट में)।

## Discovery endpoints {#discovery-endpoints}

ये तीन endpoints authentication के बिना उपलब्ध हैं और SCIM server की क्षमताओं का वर्णन करते हैं:

| Endpoint | Description |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | Server capabilities और supported features |
| `GET /api/v1/scim/v2/Schemas` | User और Group schema definitions |
| `GET /api/v1/scim/v2/ResourceTypes` | उपलब्ध resource types (User, Group) |

`ServiceProviderConfig` इन क्षमताओं का विज्ञापन करता है:

| Feature | Supported |
|---|---|
| Patch | Yes |
| Bulk | No |
| Filter | Yes (अधिकतम 200 results, केवल `eq` operator) |
| Change password | No |
| Sort | No |
| ETag | No |

## Limitations {#limitations}

- **Filtering**: केवल `eq` operator समर्थित है। Complex filters, `and`/`or` operators, `co` (contains), और `sw` (starts with) लागू नहीं किए गए हैं।
- **Bulk operations**: समर्थित नहीं।
- **Sort और ETag**: समर्थित नहीं।
- **Roles**: SCIM SnapOtter roles सौंप नहीं सकता। सभी provisioned users को `user` role मिलती है।
- **MAX_USERS**: SCIM user creation पर `MAX_USERS` environment variable सीमा लागू नहीं होती। यदि आपको user counts सीमित करने की आवश्यकता है, तो अपने IdP में assignments प्रबंधित करें।
- **One token**: एक समय में केवल एक SCIM token सक्रिय हो सकता है। यदि कई IdPs को SCIM access की आवश्यकता है, तो उन्हें token साझा करना होगा।
- **Groups are teams**: SCIM Groups teams के अनुरूप होते हैं, roles या permission groups के नहीं।

## Troubleshooting {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

आपकी license में `scim` feature शामिल नहीं है, या कोई license configure नहीं है। SCIM के लिए एक enterprise plan license आवश्यक है। सत्यापित करें कि `SNAPOTTER_LICENSE_KEY` सेट है और license में `scim` feature शामिल है।

### 401 "Bearer token required" {#_401-bearer-token-required}

SCIM request में एक `Authorization: Bearer <token>` header शामिल नहीं था। अपने IdP की provisioning configuration जाँचें।

### 401 "Invalid token" {#_401-invalid-token}

Token संग्रहीत hash से मेल नहीं खाता। यह तब होता है जब token रद्द कर दिया गया और फिर से जनरेट किया गया। अपने IdP की provisioning settings में token अपडेट करें।

### 401 "SCIM not configured" {#_401-scim-not-configured}

अभी तक कोई SCIM token जनरेट नहीं किया गया है। एक बनाने के लिए `POST /api/v1/enterprise/scim/token` endpoint का उपयोग करें।

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

समान username वाला एक user पहले से मौजूद है। यह तब हो सकता है जब कोई IdP किसी विफल create को पुनः प्रयास करता है। SnapOtter admin panel में डुप्लिकेट usernames की जाँच करें।

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

IdP प्रति मिनट 1000 से अधिक requests भेज रहा है। यह आमतौर पर एक बड़े प्रारंभिक sync के दौरान होता है। अधिकांश IdPs rate limit window रीसेट होने के बाद स्वचालित रूप से पुनः प्रयास करते हैं। यदि समस्या बनी रहती है, तो अपने IdP का provisioning sync interval जाँचें।

### Users deprovisioned but not removed from the UI {#users-deprovisioned-but-not-removed-from-the-ui}

SCIM DELETE एक soft deactivation है। निष्क्रिय किए गए users अभी भी admin user सूची में disabled status के साथ दिखाई देते हैं। यह डिज़ाइन के अनुसार है ताकि उनका data संरक्षित रहे। उनकी role `disabled:<original-role>` के रूप में दिखाई देती है।
