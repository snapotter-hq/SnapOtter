---
description: "SnapOtter'da kullanıcıları, yerleşik ve özel rolleri, izinleri, API anahtarlarını, ekipleri, oturumları ve denetim günlüğünü yönetin."
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: b0ee9c5838b7
---

# Kullanıcılar, Roller ve İzinler {#users-roles-permissions}

SnapOtter üç yerleşik rol, 17 ayrıntılı izin ve isteğe bağlı araç başına erişim denetimiyle özel rol desteği ile gelir. Bu sayfa, tam yetkilendirme modelini, API anahtarı kapsamlandırmasını, ekip yönetimini ve denetim günlüklemesini kapsar.

::: tip İlgili sayfalar
[OIDC / SSO](/tr/guide/oidc) | [SAML SSO](/tr/guide/saml) | [SCIM Sağlama](/tr/guide/scim) | [Güvenlik ve Sağlamlaştırma](/tr/guide/security)
:::

## Kullanıcılar {#users}

### Kullanıcı oluşturma {#creating-users}

Yöneticiler, yönetici paneli veya `POST /api/auth/register` uç noktası aracılığıyla kullanıcı oluşturabilir. Her kullanıcının bir kullanıcı adı, rolü, ekip ataması ve isteğe bağlı bir e-posta adresi vardır.

### Varsayılan yönetici {#default-admin}

İlk başlatmada SnapOtter varsayılan bir yönetici hesabı oluşturur. Kimlik bilgileri ortam değişkenlerinden gelir:

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | İlk yönetici hesabının kullanıcı adı |
| `DEFAULT_PASSWORD` | `admin` | İlk yönetici hesabının parolası |

Varsayılan yöneticinin ilk girişte parolasını değiştirmesi gerekir.

### Kimlik doğrulama sağlayıcıları {#authentication-providers}

Kullanıcılar birkaç yöntemle kimlik doğrulaması yapabilir:

- **Yerel** - SnapOtter veritabanında saklanan kullanıcı adı ve parola
- **OIDC** - herhangi bir OpenID Connect sağlayıcısı ([OIDC / SSO](/tr/guide/oidc) bölümüne bakın)
- **SAML** - SAML 2.0 kimlik sağlayıcıları ([SAML SSO](/tr/guide/saml) bölümüne bakın)
- **SCIM** - bir kimlik sağlayıcıdan otomatik sağlama ([SCIM Sağlama](/tr/guide/scim) bölümüne bakın)

### Kimlik doğrulamayı devre dışı bırakma {#disabling-authentication}

Kimlik doğrulamayı tamamen devre dışı bırakmak için `AUTH_ENABLED=false` ayarını yapın. Bu modda, tüm istekler için `admin` rolüne sahip yapay bir anonim kullanıcı kullanılır. Giriş gerekmez.

::: warning 
Kimlik doğrulamayı devre dışı bırakmak, örneğe ulaşabilen herkese tam yönetici erişimi verir. Bunu yalnızca güvenilir ortamlarda kullanın.
:::

## Yerleşik roller {#built-in-roles}

SnapOtter üç yerleşik rol içerir. Bunlar değiştirilemez veya silinemez.

### Admin {#admin}

17 iznin tamamı. Örnek üzerinde tam denetim.

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Editor {#editor}

7 izin. Tüm araçları kullanabilir ve tüm dosyaları ve işlem hatlarını yönetebilir, ancak yönetici işlevlerine erişemez.

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### User {#user}

5 izin. Araçları kullanabilir ve kendi kaynaklarını yönetebilir.

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## İzin referansı {#permissions-reference}

| İzin | Açıklama |
|---|---|
| `tools:use` | Herhangi bir işlem aracını kullan |
| `files:own` | Kendi dosyalarını görüntüle ve yönet |
| `files:all` | Tüm kullanıcıların dosyalarını görüntüle ve yönet |
| `apikeys:own` | Kendi API anahtarlarını oluştur ve yönet |
| `apikeys:all` | Tüm kullanıcıların API anahtarlarını görüntüle |
| `pipelines:own` | Kendi işlem hatlarını oluştur ve yönet |
| `pipelines:all` | Tüm kullanıcıların işlem hatlarını görüntüle ve yönet |
| `settings:read` | Örnek ayarlarını görüntüle |
| `settings:write` | Örnek ayarlarını değiştir |
| `users:manage` | Kullanıcı hesapları oluştur, güncelle ve sil |
| `teams:manage` | Ekipler oluştur, güncelle ve sil |
| `features:manage` | AI özellik paketlerini yükle ve yönet |
| `system:health` | Sağlık ve hazırlık uç noktalarına eriş |
| `audit:read` | Denetim günlüğünü görüntüle ve rolleri listele |
| `compliance:manage` | GDPR yaşam döngüsünü ve uyumluluk özelliklerini yönet |
| `webhooks:manage` | Giden web kancalarını (webhook) yapılandır |
| `security:manage` | Güvenlik ayarlarını yönet (IP izin listesi, SSO zorlaması) |

## Özel roller {#custom-roles}

`security:manage` iznine sahip yöneticiler, yönetici paneli veya roller API'si aracılığıyla özel roller oluşturabilir. Rolleri listelemek `audit:read` iznini gerektirir.

### Özel bir rol oluşturma {#creating-a-custom-role}

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

Rol adları 2-30 karakter olmalı, tire ve alt çizgi içeren küçük harfli alfasayısal olmalıdır.

### Yöneticiye ayrılmış izinler {#admin-reserved-permissions}

Üç izin yerleşik roller için ayrılmıştır ve özel rollere atanamaz:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

Roller API'si, bu izinleri içeren herhangi bir isteği reddeder. Bunlara yalnızca yerleşik `admin` rolü erişebilir.

### Araç düzeyinde izinler {#tool-level-permissions}

Özel roller, kullanıcıların hangi araçlara erişebileceğini isteğe bağlı olarak kısıtlayabilir. İki mod kullanılabilir:

| Mod | Davranış | Lisans gereksinimi |
|---|---|---|
| `category` | Modaliteye göre kısıtla (image, video, audio, document, file) | Yok (ücretsiz) |
| `tool` | Bireysel araç kimliğine göre kısıtla | `per_tool_permissions` kurumsal özelliğini gerektirir |

`tool` modu ayarlandığında ancak kurumsal özellik kullanılabilir olmadığında, SnapOtter zarif bir şekilde geriler ve tüm araçlara erişime izin verir.

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

### Özel bir rolü silme {#deleting-a-custom-role}

Özel bir rol silindiğinde, ona atanan tüm kullanıcılar otomatik olarak `user` rolüne yeniden atanır.

## Ekipler {#teams}

Ekipler, depolama ve saklama yönetimi için kullanıcıları gruplar. İlk başlatmada bir `Default` ekibi oluşturulur.

| Alan | Tür | Açıklama |
|---|---|---|
| `name` | string | Benzersiz ekip adı (1-50 karakter) |
| `storageQuota` | number | Ekip başına bayt cinsinden depolama sınırı (kurumsal olmadan çalışır) |
| `retentionHours` | number | Çıktıları bu kadar saat sonra otomatik sil (`team_retention_overrides` gerektirir, kurumsal) |
| `legalHold` | boolean | Ekip üyelerinin dosyalarının otomatik silinmesini engelle (`legal_hold` gerektirir, kurumsal) |

::: info 
`Default` ekibi silinemez. Hâlâ üyesi olan ekipler silinemez. Önce üyeleri yeniden atayın.
:::

## API anahtarları {#api-keys}

Kullanıcılar, programlı erişim için API anahtarları oluşturabilir. Her anahtar `si_` önekini kullanır ve yalnızca oluşturulma sırasında bir kez gösterilir.

### Kapsamlandırılmış izinler {#scoped-permissions}

API anahtarları isteğe bağlı olarak bir `permissions` dizisi taşıyabilir. Ayarlandığında, bir isteğin etkin izinleri, kullanıcının rol izinleri ile anahtarın kapsamlandırılmış izinlerinin **kesişimidir**. Bu, bir API anahtarının asla kullanıcının kendi izinlerinin ötesine geçemeyeceği anlamına gelir.

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

### Sona erme {#expiration}

Anahtarlar isteğe bağlı bir `expiresAt` zaman damgası kabul eder. Süresi dolmuş anahtarlar kimlik doğrulama sırasında reddedilir.

## Denetim günlüğü {#audit-log}

SnapOtter, güvenlikle ilgili olayları `audit_log` veritabanı tablosunda saklanan yapılandırılmış bir denetim günlüğüne kaydeder.

### Denetim günlüğünü görüntüleme {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

`audit:read` iznini gerektirir. Sayfalandırmayı (`page`, `limit`) ve filtreleri (`action`, `ip`, `from`, `to`) destekler.

### Araç işlemi denetimi {#tool-operation-auditing}

::: warning 
`TOOL_EXECUTED` olayları varsayılan olarak günlüğe **kaydedilmez**. İki yoldan biri aracılığıyla katılım (opt-in) sağlanır:

1. `auditToolOperations` yönetici ayarını `true` olarak ayarlayın.
2. `audit_export` özelliğine sahip etkin bir lisans bulundurun (hem ekip hem de kurumsal planlarda mevcuttur).

Bunlardan biri olmadan, bireysel araç yürütmeleri denetim günlüğüne kaydedilmez.
:::

### Dışa aktarma {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

`audit:read` iznini ve `audit_export` kurumsal özelliğini gerektirir (hem ekip hem de kurumsal planlarda mevcuttur). CSV ve JSON formatlarını destekler; `action`, `actorId`, `targetType`, `targetId`, `from` ve `to` ile filtrelenir.

### Kurcalamaya dayanıklı imzalama {#tamper-resistant-signing}

Etkinleştirildiğinde, her denetim günlüğü girdisi `DATA_ENCRYPTION_KEY` değerinden türetilen bir HMAC ile imzalanır. Bu şunları gerektirir:

1. Ortamınızda `DATA_ENCRYPTION_KEY` ayarını yapmak.
2. `tamperResistantAudit` yönetici ayarını etkinleştirmek.
3. `tamper_resistant_audit` özelliğine sahip bir kurumsal lisans.

### Saklama {#retention}

Eski girdileri otomatik olarak temizlemek için `AUDIT_RETENTION_DAYS` ayarını yapın. Varsayılan değer `0`'tir; bu, girdilerin süresiz olarak saklandığı anlamına gelir.

### Olay referansı {#event-reference}

| Olay | Kategori |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | Kimlik doğrulama |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | Kimlik doğrulama |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | Kimlik doğrulama |
| `LOGOUT` | Kimlik doğrulama |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | Kullanıcı yönetimi |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | Kullanıcı yönetimi |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Roller |
| `API_KEY_CREATED`, `API_KEY_DELETED` | API anahtarları |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | Ayarlar |
| `FILE_UPLOADED`, `FILE_DELETED` | Dosyalar |
| `TOOL_EXECUTED` | Araçlar (katılımlı) |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | Uyumluluk |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | Uyumluluk |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | Yapılandırma |

## Oturum yönetimi {#session-management}

Oturumlar çerez tabanlıdır ve `SESSION_DURATION_HOURS` tarafından denetlenir (varsayılan: 168 saat / 7 gün).

### Rol değişiklikleri oturumları geçersiz kılar {#role-changes-invalidate-sessions}

Bir yönetici bir kullanıcının rolünü değiştirdiğinde, o kullanıcının tüm etkin oturumları silinir. Kullanıcının yeni izinlerini almak için yeniden giriş yapması gerekir.

### Güvenlik korumaları {#safety-guards}

- **Son-yönetici koruması**: kalan son yönetici daha düşük bir role indirilemez. Denerseniz API bir hata döndürür.
- **Kendini silme önleme**: yöneticiler API aracılığıyla kendi hesaplarını silemez.
