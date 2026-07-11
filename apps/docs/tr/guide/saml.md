---
description: "SnapOtter için SAML 2.0 Çoklu Oturum Açma kurulumu yapın. Okta, Azure AD / Entra ID, Google Workspace ve diğer SAML kimlik sağlayıcıları için adım adım kılavuzlar."
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: 2d0731a89c15
---

# SAML SSO {#saml-sso}

SnapOtter, çoklu oturum açma için SAML 2.0 desteği sunar. Kullanıcılar, yerel kullanıcı adı/parola kimlik doğrulaması yerine harici bir kimlik sağlayıcı (Okta, Azure AD / Entra ID, Google Workspace veya herhangi bir standart SAML 2.0 IdP) aracılığıyla oturum açabilir.

::: tip Kurumsal özellik
SAML SSO, `saml_sso` özelliğine sahip bir **team** veya **enterprise** lisansı gerektirir. Geçerli bir lisans olmadan `SAML_ENABLED=true` ayarlanırsa, SAML rotaları sessizce atlanır ve bir uyarı günlüğe kaydedilir.
:::

## Ön koşullar {#prerequisites}

- Genel bir URL'de erişilebilir çalışan bir SnapOtter örneği
- `EXTERNAL_URL` öğesi o genel URL'ye ayarlı (örn. `https://photos.example.com`)
- `saml_sso` özelliğine sahip bir team veya enterprise lisans anahtarı
- SAML kimlik sağlayıcınıza yönetici erişimi

## Hızlı başlangıç {#quick-start}

Bu ortam değişkenlerini `docker-compose.yml` dosyanıza ekleyin:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      SNAPOTTER_LICENSE_KEY: "your-license-key"
      SAML_ENABLED: "true"
      SAML_IDP_SSO_URL: "https://idp.example.com/sso/saml"
      SAML_IDP_CERTIFICATE: |
        MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw
        ...your IdP's signing certificate in PEM format...
        EAYHKoZIzj0CAQYFK4EEACIDYgAE
```

Konteyneri yeniden başlatın. Oturum açma sayfasında bir "SAML ile oturum aç" düğmesi (veya `SAML_PROVIDER_NAME` tarafından ayarlanan etiket) görünür.

## Yapılandırma referansı {#configuration-reference}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `SAML_ENABLED` | `false` | SAML oturum açmayı etkinleştirir. |
| `SAML_IDP_SSO_URL` | | IdP'nin SSO uç nokta URL'si. SAML etkinleştirildiğinde **gereklidir**. |
| `SAML_IDP_CERTIFICATE` | | IdP'nin PEM biçimindeki X.509 imzalama sertifikası (bir dosya yolu değil, sertifika metninin kendisi). SAML etkinleştirildiğinde **gereklidir**. |
| `EXTERNAL_URL` | | SnapOtter'ın erişilebilir olduğu genel URL. SAML etkinleştirildiğinde **gereklidir**. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | IdP'ye gönderilen SP Entity ID / Audience URI. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | Assertion Consumer Service (ACS) URL'si. |
| `SAML_AUTO_CREATE_USERS` | `true` | İlk SAML oturum açmasında otomatik olarak yerel bir kullanıcı hesabı oluşturur. |
| `SAML_AUTO_LINK_USERS` | `false` | E-posta adresi eşleşiyorsa bir SAML kimliğini mevcut bir yerel kullanıcıya bağlar. |
| `SAML_DEFAULT_ROLE` | `user` | Otomatik oluşturulan SAML kullanıcılarına atanan rol. `admin`, `editor` veya `user` değerlerinden biri. |
| `SAML_PROVIDER_NAME` | | Ön uçtaki SAML oturum açma düğmesi için görünen etiket (örn. "Okta", "Azure AD"). Boşsa düğmede "SAML" yazar. |
| `SAML_USERNAME_ATTRIBUTE` | | Kullanıcı adı olarak kullanılan SAML assertion niteliği. Boşsa, önce e-postanın yerel kısmına, ardından NameID'ye geri döner. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | Kullanıcının e-posta adresi olarak kullanılan SAML assertion niteliği. |

`SAML_ENABLED=true` ayarlı olduğunda ve üç gerekli değişkenden herhangi biri (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`) eksik olduğunda sunucu başlamayı reddeder.

::: details Güvenlik notları
Hem `wantAuthnResponseSigned` hem de `wantAssertionsSigned` `true` değerine sabitlenmiştir. SnapOtter, imzasız veya yanlış imzalanmış SAML yanıtlarını reddeder. Güvenilir bir IdP'den gelen assertion'lar e-posta doğrulanmış olarak kabul edilir.

Yalnızca SP tarafından başlatılan oturum açma desteklenir. SnapOtter, IdP tarafından başlatılan (istenmemiş) oturum açmayı veya Single Logout (SLO) desteklemez. SnapOtter'dan çıkış yapmak, kullanıcının IdP'den çıkışını yapmaz.
:::

## SP meta verisi ve URL'leri {#sp-metadata-and-urls}

IdP'niz SnapOtter'dan üç değere ihtiyaç duyar:

| Alan | Değer |
|---|---|
| **ACS URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP Metadata** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

Örneğin, `EXTERNAL_URL` değeri `https://photos.example.com` ise:

- ACS URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- Meta veri uç noktası: `https://photos.example.com/api/auth/saml/metadata` (XML döndürür)

Bazı IdP'ler, ACS URL'sini ve Entity ID'yi otomatik olarak dolduran SP meta veri URL'sini doğrudan içe aktarabilir.

## Sağlayıcı kurulumu {#provider-setup}

### Okta {#okta}

1. Okta yönetici konsolunda, **Applications > Create App Integration** bölümüne gidin.
2. **SAML 2.0** öğesini seçin ve **Next** düğmesine tıklayın.
3. Bir ad ayarlayın (örn. "SnapOtter") ve **Next** düğmesine tıklayın.
4. SAML ayarlarını yapılandırın:
   - **Single sign-on URL**: ACS URL'niz (örn. `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: Entity ID'niz (örn. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. **Attribute Statements** altında, `user.email` değerine eşlenen `email` öğesini ekleyin.
6. **Next**, ardından **Finish** düğmesine tıklayın.
7. **Sign On** sekmesine gidin, **View SAML setup instructions** öğesine tıklayın ve şunları kopyalayın:
   - **Identity Provider Single Sign-On URL** öğesini `SAML_IDP_SSO_URL` içine
   - **X.509 Certificate** öğesini `SAML_IDP_CERTIFICATE` içine

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Azure portalında, **Microsoft Entra ID > Enterprise applications > New application** bölümüne gidin.
2. **Create your own application** düğmesine tıklayın, "SnapOtter" olarak adlandırın ve **Integrate any other application you don't find in the gallery** öğesini seçin.
3. **Single sign-on > SAML** bölümüne gidin ve **Basic SAML Configuration** bölümünde **Edit** düğmesine tıklayın:
   - **Identifier (Entity ID)**: Entity ID'niz (örn. `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: ACS URL'niz (örn. `https://photos.example.com/api/auth/saml/callback`)
4. **SAML Certificates** altında, **Certificate (Base64)** öğesini indirin.
5. **Set up SnapOtter** altında, **Login URL** öğesini kopyalayın.
6. `SAML_IDP_SSO_URL` değerini Login URL'ye ve `SAML_IDP_CERTIFICATE` değerini indirilen sertifika içeriğine ayarlayın.
7. **Users and groups** altında uygulamaya kullanıcıları veya grupları atayın.

### Google Workspace {#google-workspace}

1. Google Admin konsolunda, **Apps > Web and mobile apps > Add app > Add custom SAML app** bölümüne gidin.
2. Uygulamayı "SnapOtter" olarak adlandırın ve **Continue** düğmesine tıklayın.
3. **Google Identity Provider details** sayfasında, **SSO URL** öğesini kopyalayın ve **Certificate** öğesini indirin. **Continue** düğmesine tıklayın.
4. Service Provider ayrıntılarını yapılandırın:
   - **ACS URL**: ACS URL'niz (örn. `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: Entity ID'niz (örn. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. **Continue**, ardından **Finish** düğmesine tıklayın.
6. Kuruluş birimleriniz için uygulamayı **ON** konumuna getirin.
7. `SAML_IDP_SSO_URL` değerini 3. adımdaki SSO URL'ye ve `SAML_IDP_CERTIFICATE` değerini indirilen sertifika içeriğine ayarlayın.

### Genel SAML 2.0 IdP {#generic-saml-2-0-idp}

Herhangi bir SAML 2.0 uyumlu kimlik sağlayıcı için:

1. IdP'nizde yeni bir SAML uygulaması/hizmet sağlayıcısı oluşturun.
2. **ACS URL** öğesini `${EXTERNAL_URL}/api/auth/saml/callback` olarak ayarlayın.
3. **Entity ID** / **Audience** öğesini `${EXTERNAL_URL}/api/auth/saml/metadata` olarak ayarlayın.
4. IdP'yi, kullanıcının e-postasını `email` adlı bir nitelikte gönderecek şekilde yapılandırın (veya `SAML_EMAIL_ATTRIBUTE` öğesini IdP'nizin nitelik adıyla eşleşecek şekilde ayarlayın).
5. **IdP SSO URL** ve **imzalama sertifikası** öğelerini `SAML_IDP_SSO_URL` ve `SAML_IDP_CERTIFICATE` içine kopyalayın.

## Kullanıcı sağlama {#user-provisioning}

### Otomatik oluşturma {#auto-create}

`SAML_AUTO_CREATE_USERS` değeri `true` olduğunda (varsayılan), birisi SAML aracılığıyla ilk kez oturum açtığında yerel bir kullanıcı hesabı oluşturulur. Rol `SAML_DEFAULT_ROLE` olarak ayarlanır.

Kullanıcı adı şu sırayla türetilir:

1. `SAML_USERNAME_ATTRIBUTE` ile belirtilen assertion niteliğinin değeri (ayarlıysa ve mevcutsa)
2. E-posta adresinin yerel kısmı (`@` öncesindeki her şey)
3. SAML NameID

Bir kullanıcı adı çakışması olursa, sayısal bir sonek eklenir (örn. `jane`, `jane_2` olur).

### Otomatik bağlama {#auto-link}

`SAML_AUTO_LINK_USERS` değeri `true` olduğunda, SnapOtter, e-posta adresleri eşleşiyorsa bir SAML kimliğini mevcut bir yerel hesaba bağlar. Bu, önceden oluşturulmuş kullanıcı hesaplarınız olduğunda ve verilerini kaybetmeden SSO kullanmaya başlamalarını istediğinizde yararlıdır.

::: warning 
Yalnızca SAML IdP'nizin e-posta adreslerini doğrulamasına güveniyorsanız otomatik bağlamayı etkinleştirin. Yanlış yapılandırılmış bir IdP'den gelen doğrulanmamış bir e-posta, birinin başka bir kullanıcının hesabını ele geçirmesine olanak tanıyabilir.
:::

### Nitelik eşleme {#attribute-mapping}

| SnapOtter alanı | Kaynak | Yapılandırma |
|---|---|---|
| E-posta | Assertion niteliği | `SAML_EMAIL_ATTRIBUTE` (varsayılan: `email`) |
| Kullanıcı adı | Assertion niteliği, e-posta veya NameID | `SAML_USERNAME_ATTRIBUTE` (yukarıdaki türetme sırasına bakın) |
| Harici ID | NameID | Her zaman SAML NameID, yapılandırılamaz |

## SSO zorunlu kılma {#sso-enforcement}

Tüm kullanıcıların SAML (veya OIDC) aracılığıyla oturum açmasını zorunlu kılmak ve yerel parola oturum açmayı engellemek istiyorsanız, SSO zorunlu kılmayı etkinleştirin:

1. `sso_enforcement` kurumsal özelliğinin lisanslandığından emin olun (team ve enterprise planlarında mevcut).
2. **Admin Settings > Security** bölümünde, **SSO Enforcement** öğesini açın.
3. Bir **acil durum kullanıcı adı** ayarlayın: bu, IdP erişilemez olduğunda acil durum erişimi için hâlâ parolayla oturum açabilen tek yerel hesaptır.

SSO zorunlu kılma etkin olduğunda, herhangi bir yerel oturum açma denemesi (acil durum kullanıcısı hariç) "Local password login is disabled. Please use SSO." mesajıyla bir 403 hatası döndürür.

::: tip 
SSO zorunlu kılmayı etkinleştirmeden önce her zaman bir acil durum kullanıcı adı yapılandırın. Bu olmadan, IdP'niz çökerse SnapOtter'a erişiminiz engellenebilir.
:::

## SAML'i OIDC ile birlikte kullanma {#using-saml-alongside-oidc}

SAML ve OIDC aynı anda etkinleştirilebilir. Her ikisi de etkin olduğunda, oturum açma sayfası her sağlayıcı için ayrı düğmeler gösterir (`SAML_PROVIDER_NAME` ve `OIDC_PROVIDER_NAME` ile etiketlenmiş). Kullanıcılar her iki yöntemle de oturum açabilir.

Her iki sağlayıcı da aynı otomatik oluşturma, otomatik bağlama ve SSO zorunlu kılma ayarlarını bağımsız olarak paylaşır: her birinin kendi `*_AUTO_CREATE_USERS`, `*_AUTO_LINK_USERS` ve `*_DEFAULT_ROLE` değişkenleri vardır.

## Sorun giderme {#troubleshooting}

### Assertion doğrulaması başarısız oldu {#assertion-validation-failed}

SAML yanıt imzası veya assertion imzası doğrulanamadı. Kontrol edin:

- `SAML_IDP_CERTIFICATE` içindeki sertifika, IdP'nizdeki mevcut imzalama sertifikasıyla eşleşir (sertifikalar döner, bu yüzden süre dolumunu kontrol edin)
- Sertifika PEM biçimindedir (`-----BEGIN CERTIFICATE-----` ile başlar)
- Sertifika, bir dosya yolu değil, tam metindir
- IdP'nizde yapılandırılan ACS URL ve Entity ID, SnapOtter'ın değerleriyle tam olarak eşleşir (şema, ana bilgisayar, port, yol)

### Eksik nitelikler {#missing-attributes}

Oturum açtıktan sonra kullanıcı adları veya e-postalar boşsa, IdP'niz beklenen nitelikleri göndermiyor olabilir. Kontrol edin:

- IdP'niz bir `email` niteliği (veya `SAML_EMAIL_ATTRIBUTE` ne olarak ayarlanmışsa) yayınlayacak şekilde yapılandırılmıştır
- `SAML_USERNAME_ATTRIBUTE` kullanıyorsanız, o niteliğin assertion'a dahil edildiğini doğrulayın
- Bazı IdP'ler istemleri yayınlamadan önce açık nitelik eşleme yapılandırması gerektirir

### Saat kayması {#clock-skew}

SAML assertion'ları zaman damgası koşulları içerir (`NotBefore`, `NotOnOrAfter`). Sunucu saatiniz ve IdP saati senkronize değilse, assertion doğrulaması başarısız olur. Saatleri hizalı tutmak için her iki makinede de NTP çalıştırın.

### "SAML is enabled via env but saml_sso enterprise feature is not licensed" {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

Bu uyarı, `SAML_ENABLED=true` olduğunda ancak lisans `saml_sso` özelliğini içermediğinde sunucu günlüklerinde görünür. Lisans anahtarınızı ve planınızı doğrulayın. `saml_sso` özelliği team ve enterprise planlarında mevcuttur.

### Oturum açma bir hatayla geri yönlendiriyor {#login-redirects-back-with-error}

SAML oturum açma düğmesine tıklamak bir hatayla oturum açma sayfasına geri yönlendiriyorsa, ayrıntılar için sunucu günlüklerini kontrol edin. Yaygın nedenler:

- IdP SSO URL'si sunucudan erişilemez
- IdP kimlik doğrulama isteğini reddetti (IdP'nin denetim günlüklerini kontrol edin)
- IdP imzasız bir yanıt döndürdü (SnapOtter, hem yanıtın hem de assertion'ın imzalanmasını gerektirir)
