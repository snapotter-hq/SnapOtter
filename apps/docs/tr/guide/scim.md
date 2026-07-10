---
description: "Kullanıcıları ve grupları kimlik sağlayıcınızdan SnapOtter'a senkronize etmek için SCIM 2.0 sağlamayı kurun. Okta, Azure AD / Entra ID ve özel entegrasyonları kapsar."
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: b966d13d06fc
---

# SCIM Sağlama {#scim-provisioning}

SnapOtter, otomatik kullanıcı ve grup sağlaması için SCIM 2.0'ı (System for Cross-domain Identity Management) uygular. Kimlik sağlayıcınız kullanıcı hesaplarını oluşturabilir, güncelleyebilir, devre dışı bırakabilir ve yeniden etkinleştirebilir; ayrıca grup üyeliklerini otomatik olarak senkronize edebilir.

::: tip Enterprise özelliği
SCIM sağlaması, `scim` özelliğine sahip bir **enterprise** lisansı gerektirir. Team planında kullanılamaz. Bu özellik olmadan tüm SCIM uç noktaları (keşif hariç) 403 döndürür.
:::

## Önkoşullar {#prerequisites}

- Genel bir URL üzerinden erişilebilen, çalışan bir SnapOtter örneği
- `scim` özelliğine sahip bir enterprise lisans anahtarı
- SnapOtter'a admin erişimi (SCIM token oluşturmak veya iptal etmek için `users:manage` izni gerekir)
- Kimlik sağlayıcınızın sağlama ayarlarına admin erişimi

## Hızlı başlangıç {#quick-start}

1. Bir SCIM bearer token oluşturun:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

Yanıt token'ı içerir. Hemen kaydedin; bir daha alınamaz.

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. Kimlik sağlayıcınızda SCIM sağlamasını şunlarla yapılandırın:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Kimlik doğrulama**: Bearer token (1. adımdaki token'ı yapıştırın)

## Kimlik doğrulama {#authentication}

SCIM uç noktaları, kullanıcı oturumlarından ve API anahtarlarından ayrı, özel bir Bearer token kullanır.

### Token oluşturma {#generating-a-token}

`POST /api/v1/enterprise/scim/token` yeni bir SCIM token oluşturur. Bu uç nokta, `users:manage` iznine sahip geçerli bir oturum gerektirir.

Token düz metin olarak yalnızca bir kez döndürülür. SnapOtter yalnızca bir scrypt karması saklar. Token'ı kaybederseniz iptal edin ve yeni bir tane oluşturun.

Aynı anda yalnızca bir SCIM token etkindir. Yeni bir token oluşturmak öncekinin yerini alır.

### Token iptali {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` mevcut SCIM token'ını iptal eder. Bu uç nokta da `users:manage` gerektirir.

### Hız sınırlama {#rate-limiting}

SCIM uç noktaları, token başına dakikada 1000 istekle sınırlandırılmıştır. Bu sınırın aşılması HTTP 429 döndürür.

## Desteklenen kaynaklar {#supported-resources}

| SCIM kaynağı | SnapOtter kavramı | Oluştur | Oku | Güncelle | Sil |
|---|---|---|---|---|---|
| User | Kullanıcı hesabı | Evet | Evet | Evet | Yumuşak silme |
| Group | Team | Evet | Evet | Evet | Evet |

::: warning 
SCIM Grupları, rollere değil SnapOtter **team**'lerine eşlenir. SCIM, bir kullanıcının rolünü ayarlayamaz. SCIM aracılığıyla oluşturulan tüm kullanıcılara `user` rolü atanır. Bir kullanıcının rolünü değiştirmek için SnapOtter admin arayüzünü kullanın.
:::

## Kullanıcı işlemleri {#user-operations}

### Kullanıcı oluşturma {#create-user}

`POST /api/v1/scim/v2/Users`

`authProvider` değeri `scim` ve rolü `user` olarak ayarlanmış yeni bir kullanıcı hesabı oluşturur. Kullanıcı Default team'e atanır. `active` değeri `false` ise rol bunun yerine `disabled` olarak ayarlanır.

Gerekli öznitelikler: `userName`. İsteğe bağlı: `externalId`, `emails`, `active` (varsayılan `true`).

### Kullanıcıları listeleme ve filtreleme {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

Sayfalanmış bir kullanıcı listesi döndürür. `startIndex` ve `count` sorgu parametrelerini destekler (sayfa başına en fazla 200 sonuç).

Filtreleme yalnızca şu öznitelikler üzerinde `eq` (eşittir) destekler:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

Diğer filtre operatörleri ve öznitelikler HTTP 400 döndürür.

### Kullanıcı getirme {#get-user}

`GET /api/v1/scim/v2/Users/:id`

SnapOtter kullanıcı kimliğine göre tek bir kullanıcı döndürür.

### Kullanıcıyı değiştirme {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

Kullanıcının özniteliklerini değiştirir. `userName`, `externalId`, `emails` ve `active` destekler. Kullanıcı adı değişiklikleri çakışma açısından denetlenir (yeni kullanıcı adı başka bir kullanıcı tarafından alınmışsa 409).

### Kullanıcıyı yamalama {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

SCIM PatchOp kullanan kısmi güncelleme. Desteklenen işlemler:

| İşlem | Yollar |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | `replace` ile aynı |
| `remove` | `externalId`, `emails` |

`name.formatted` ve `displayName` yolları uyumluluk için kabul edilir ancak kalıcı bir etkisi yoktur (SnapOtter ayrı bir görünen ad saklamaz).

Değersiz `replace` işlemleri (değerin bir `path` içermeyen bir nesne olduğu durumlar) da `userName`, `externalId`, `emails` ve `active` anahtarlarıyla desteklenir.

### Kullanıcıyı devre dışı bırakma (yumuşak silme) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter, SCIM aracılığıyla kullanıcıları kalıcı olarak silmez. Bunun yerine DELETE bir yumuşak devre dışı bırakma gerçekleştirir:

1. Kullanıcının rolü mevcut değerinden (örn. `editor`) `disabled:editor` değerine değiştirilir ve orijinal rol korunur.
2. Kullanıcının parolası temizlenir.
3. Tüm etkin oturumlar iptal edilir.
4. Tüm API anahtarları iptal edilir.

Kullanıcı artık oturum açamaz veya herhangi bir API anahtarı kullanamaz. Verileri (dosyalar, geçmiş) korunur.

### Kullanıcıyı yeniden etkinleştirme {#reactivate-user}

Daha önce devre dışı bırakılmış bir kullanıcıyı yeniden etkinleştirmek için `active: true` içeren bir `PUT` veya `PATCH` isteği gönderin. SnapOtter, devre dışı bırakmadan önceki orijinal rolü geri yükler (örn. `disabled:editor` yeniden `editor` olur). Orijinal rol belirlenemezse `user` değerine geri döner.

::: details Örnek: PATCH ile devre dışı bırakma ve yeniden etkinleştirme
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

## Grup işlemleri {#group-operations}

SCIM Grupları SnapOtter team'lerine eşlenir. Bir grup oluşturmak bir team oluşturur. Grup üyeliği, bir kullanıcının hangi team'e ait olduğunu denetler.

### Grup oluşturma {#create-group}

`POST /api/v1/scim/v2/Groups`

Gerekli: `displayName`. İsteğe bağlı: `members` (`{ value: userId }` dizisi).

### Grupları listeleme ve filtreleme {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

Filtreleme yalnızca `displayName eq "..."` destekler. `startIndex` ve `count` ile sayfalanır (sayfa başına en fazla 200 sonuç).

### Grup getirme {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### Grubu değiştirme {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

Grup adını ve tam üyelik listesini değiştirir. Yeni listede olmayan mevcut üyeler Default team'e taşınır.

### Grubu yamalama {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

Şu işlemleri destekler:

| İşlem | Yol | Etki |
|---|---|---|
| `add` | `members` | Kullanıcıları team'e ekler |
| `remove` | `members[value eq "userId"]` | Kullanıcıyı Default team'e taşır |
| `replace` | `displayName` | Team'i yeniden adlandırır |
| `replace` | `members` | Tüm üyeleri değiştirir (kaldırılan üyeler Default team'e taşınır) |

### Grubu silme {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

Team'i siler. Silinen team'in tüm üyeleri Default team'e taşınır. Kullanıcılar devre dışı bırakılmaz veya silinmez.

## IdP kurulumu {#idp-setup}

### Okta {#okta}

1. Okta admin konsolunda SnapOtter uygulamanızı açın (veya oluşturun).
2. **Provisioning** sekmesine gidin ve **Configure API Integration**'a tıklayın.
3. **Enable API Integration**'ı işaretleyin ve şunları girin:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API Token**: Yukarıda oluşturulan SCIM bearer token
4. **Test API Credentials**'a, ardından **Save**'e tıklayın.
5. **Provisioning > To App** altında şunları etkinleştirin:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. **Push Groups** altında, hangi Okta gruplarının SnapOtter team'leri olarak senkronize edileceğini yapılandırın.

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Azure portalında SnapOtter enterprise uygulamanıza gidin.
2. **Provisioning**'e gidin ve **Provisioning Mode**'u **Automatic** olarak ayarlayın.
3. **Admin Credentials** altında şunları girin:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: Yukarıda oluşturulan SCIM bearer token
4. **Test Connection**'a, ardından **Save**'e tıklayın.
5. **Mappings** altında kullanıcı ve grup öznitelik eşlemelerini yapılandırın. Varsayılanlar genellikle işe yarar, ancak `userName` değerinin istediğiniz gibi `userPrincipalName` veya `mail` değerine eşlendiğini doğrulayın.
6. **Provisioning Status**'u **On** olarak ayarlayın ve kaydedin.

Azure, kullanıcıları ve grupları sabit bir senkronizasyon döngüsünde sağlar (genellikle her 40 dakikada bir).

## Keşif uç noktaları {#discovery-endpoints}

Bu üç uç nokta kimlik doğrulama olmadan kullanılabilir ve SCIM sunucusunun yeteneklerini tanımlar:

| Uç nokta | Açıklama |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | Sunucu yetenekleri ve desteklenen özellikler |
| `GET /api/v1/scim/v2/Schemas` | User ve Group şema tanımları |
| `GET /api/v1/scim/v2/ResourceTypes` | Kullanılabilir kaynak türleri (User, Group) |

`ServiceProviderConfig` şu yetenekleri duyurur:

| Özellik | Destekleniyor |
|---|---|
| Patch | Evet |
| Bulk | Hayır |
| Filter | Evet (en fazla 200 sonuç, yalnızca `eq` operatörü) |
| Change password | Hayır |
| Sort | Hayır |
| ETag | Hayır |

## Sınırlamalar {#limitations}

- **Filtreleme**: Yalnızca `eq` operatörü desteklenir. Karmaşık filtreler, `and`/`or` operatörleri, `co` (içerir) ve `sw` (ile başlar) uygulanmamıştır.
- **Toplu işlemler**: Desteklenmez.
- **Sort ve ETag**: Desteklenmez.
- **Roller**: SCIM, SnapOtter rolleri atayamaz. Sağlanan tüm kullanıcılar `user` rolünü alır.
- **MAX_USERS**: `MAX_USERS` ortam değişkeni sınırı SCIM kullanıcı oluşturmada uygulanmaz. Kullanıcı sayılarını sınırlamanız gerekiyorsa atamaları IdP'nizde yönetin.
- **Tek token**: Aynı anda yalnızca bir SCIM token etkin olabilir. Birden fazla IdP'nin SCIM erişimine ihtiyacı varsa token'ı paylaşmaları gerekir.
- **Gruplar team'lerdir**: SCIM Grupları rollere veya izin gruplarına değil, team'lere karşılık gelir.

## Sorun giderme {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

Lisansınız `scim` özelliğini içermiyor veya yapılandırılmış bir lisans yok. SCIM, bir enterprise plan lisansı gerektirir. `SNAPOTTER_LICENSE_KEY` değerinin ayarlandığını ve lisansın `scim` özelliğini içerdiğini doğrulayın.

### 401 "Bearer token required" {#_401-bearer-token-required}

SCIM isteği bir `Authorization: Bearer <token>` başlığı içermiyordu. IdP'nizin sağlama yapılandırmasını kontrol edin.

### 401 "Invalid token" {#_401-invalid-token}

Token, saklanan karmayla eşleşmiyor. Bu, token iptal edilip yeniden oluşturulduğunda olur. IdP'nizin sağlama ayarlarındaki token'ı güncelleyin.

### 401 "SCIM not configured" {#_401-scim-not-configured}

Henüz bir SCIM token oluşturulmadı. Bir tane oluşturmak için `POST /api/v1/enterprise/scim/token` uç noktasını kullanın.

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

Aynı kullanıcı adına sahip bir kullanıcı zaten var. Bu, bir IdP başarısız bir oluşturmayı yeniden denediğinde olabilir. SnapOtter admin panelinde yinelenen kullanıcı adlarını kontrol edin.

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

IdP dakikada 1000'den fazla istek gönderiyor. Bu genellikle büyük bir ilk senkronizasyon sırasında olur. Çoğu IdP, hız sınırı penceresi sıfırlandıktan sonra otomatik olarak yeniden dener. Sorun devam ederse IdP'nizin sağlama senkronizasyon aralığını kontrol edin.

### Kullanıcılar sağlaması kaldırıldı ancak arayüzden kaldırılmadı {#users-deprovisioned-but-not-removed-from-the-ui}

SCIM DELETE bir yumuşak devre dışı bırakmadır. Devre dışı bırakılan kullanıcılar admin kullanıcı listesinde devre dışı durumla görünmeye devam eder. Bu, verilerinin korunması için tasarım gereğidir. Rolleri `disabled:<original-role>` olarak görünür.
