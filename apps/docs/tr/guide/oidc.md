---
description: "OpenID Connect ile Çoklu Oturum Açma kurulumu yapın. Keycloak, Authentik, Google ve diğer OIDC sağlayıcıları için adım adım kılavuzlar."
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: d14739acc1c3
---

# OIDC / Çoklu Oturum Açma {#oidc-single-sign-on}

SnapOtter, çoklu oturum açma için OpenID Connect (OIDC) desteği sunar. Kullanıcılar, yerel kullanıcı adı/parola kimlik doğrulaması yerine (veya bununla birlikte) Keycloak, Authentik veya Google gibi harici bir kimlik sağlayıcıyla oturum açabilir.

::: tip Ayrıca bkz.
[SAML SSO](/tr/guide/saml) | [SCIM Sağlama](/tr/guide/scim) | [Kullanıcılar, Roller ve İzinler](/tr/guide/users-roles)
:::

## Hızlı başlangıç {#quick-start}

Bu ortam değişkenlerini `docker-compose.yml` dosyanıza ekleyin:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

Sağlayıcınız için yönlendirme URI'si her zaman şudur:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

Örneğin, `EXTERNAL_URL` değeri `https://photos.example.com` ise, sağlayıcınızın yönlendirme URI'sini `https://photos.example.com/api/auth/oidc/callback` olarak yapılandırın.

## Yapılandırma referansı {#configuration-reference}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `OIDC_ENABLED` | `false` | OIDC oturum açmayı etkinleştirir. Oturum açma sayfasında bir "SSO ile oturum aç" düğmesi görünür. |
| `OIDC_ISSUER_URL` | | Sağlayıcının veren (issuer) URL'si. OIDC Discovery (`/.well-known/openid-configuration`) desteklemelidir. |
| `OIDC_CLIENT_ID` | | Sağlayıcınızla kayıtlı OAuth istemci kimliği. |
| `OIDC_CLIENT_SECRET` | | OAuth istemci gizli anahtarı. |
| `OIDC_SCOPES` | `openid profile email` | İstenecek kapsamların boşlukla ayrılmış listesi. |
| `OIDC_AUTO_CREATE_USERS` | `true` | İlk OIDC oturum açmasında otomatik olarak yerel bir kullanıcı hesabı oluşturur. |
| `OIDC_DEFAULT_ROLE` | `user` | Otomatik oluşturulan OIDC kullanıcılarına atanan rol. `admin`, `editor` veya `user` değerlerinden biri. |
| `OIDC_AUTO_LINK_USERS` | `false` | E-posta adresi eşleşiyorsa bir OIDC kimliğini mevcut bir yerel kullanıcıya bağlar. |
| `OIDC_PROVIDER_NAME` | | Oturum açma düğmesinde gösterilen görünen ad (örn. "Keycloak", "Google"). Boşsa düğmede "SSO" yazar. |
| `OIDC_CLOCK_TOLERANCE` | `30` | Token doğrulaması için saniye cinsinden saat kayması toleransı. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | Yeni hesaplar için kullanıcı adı olarak kullanılan ID token istem değeri. |
| `EXTERNAL_URL` | | SnapOtter'ın erişilebilir olduğu genel URL. Doğru yönlendirme URI'sini oluşturmak için OIDC tarafından gereklidir. |
| `COOKIE_SECRET` | otomatik oluşturulur | Oturum çerezlerini imzalamak için gizli anahtar. Birden fazla kopya çalıştırırken bunu açıkça ayarlayın. |

## Sağlayıcı kılavuzları {#provider-guides}

### Keycloak {#keycloak}

1. Yeni bir realm oluşturun (veya mevcut birini kullanın).
2. **Clients** bölümüne gidin ve yeni bir istemci oluşturun:
   - **Client ID**: `snapotter`
   - **Client authentication**: On (confidential)
   - **Authentication flow**: Standard flow (Authorization Code)
3. İstemcinin **Settings** sekmesi altında, **Valid redirect URIs** öğesini geri çağırma URL'nize ayarlayın (örn. `https://photos.example.com/api/auth/oidc/callback`).
4. **Credentials** sekmesinden **Client secret** öğesini kopyalayın.
5. `OIDC_ISSUER_URL` değerini `https://keycloak.example.com/realms/your-realm` olarak ayarlayın.

### Authentik {#authentik}

1. Yönetici arayüzünde, **Applications > Providers** bölümüne gidin ve yeni bir **OAuth2/OpenID Provider** oluşturun.
   - **Client type**: Confidential
   - **Redirect URIs**: Geri çağırma URL'niz
   - **Signing key**: Mevcut bir anahtarı seçin veya bir tane oluşturun
2. Bir **Application** oluşturun ve sağlayıcıya bağlayın.
3. Sağlayıcı ayarlarından **Client ID** ve **Client Secret** öğelerini kopyalayın.
4. `OIDC_ISSUER_URL` değerini `https://authentik.example.com/application/o/snapotter/` olarak ayarlayın (sondaki eğik çizgi önemlidir).

### Google {#google}

1. [Google Cloud Console](https://console.cloud.google.com/) adresine gidin.
2. Bir proje oluşturun (veya mevcut birini seçin).
3. **APIs & Services > OAuth consent screen** bölümüne gidin ve yapılandırın.
4. **APIs & Services > Credentials** bölümüne gidin ve bir **OAuth 2.0 Client ID** oluşturun:
   - **Application type**: Web application
   - **Authorized redirect URIs**: Geri çağırma URL'niz
5. **Client ID** ve **Client secret** öğelerini kopyalayın.
6. `OIDC_ISSUER_URL` değerini `https://accounts.google.com` olarak ayarlayın.
7. `OIDC_USERNAME_CLAIM` değerini `email` olarak ayarlayın (Google `preferred_username` sağlamaz).

## Kullanıcı sağlama {#user-provisioning}

### Otomatik oluşturma {#auto-create}

`OIDC_AUTO_CREATE_USERS` değeri `true` olduğunda (varsayılan), birisi OIDC aracılığıyla ilk kez oturum açtığında yerel bir kullanıcı hesabı oluşturulur. Kullanıcı adı `OIDC_USERNAME_CLAIM` ile belirtilen istemden alınır ve rol `OIDC_DEFAULT_ROLE` olarak ayarlanır.

Bir kullanıcı adı çakışması olursa, sayısal bir sonek eklenir (örn. `jane`, `jane_2` olur).

### Otomatik bağlama {#auto-link}

`OIDC_AUTO_LINK_USERS` değeri `true` olduğunda, SnapOtter, e-posta adresleri eşleşiyorsa bir OIDC kimliğini mevcut bir yerel hesaba bağlar. Bu, önceden oluşturulmuş kullanıcı hesaplarınız olduğunda ve verilerini kaybetmeden SSO kullanmaya başlamalarını istediğinizde yararlıdır.

::: warning 
Yalnızca OIDC sağlayıcınızın e-posta adreslerini doğrulamasına güveniyorsanız otomatik bağlamayı etkinleştirin. Doğrulanmamış bir e-posta, birinin başka bir kullanıcının hesabını ele geçirmesine olanak tanıyabilir.
:::

### Yerel oturum açmayı devre dışı bırakma {#disabling-local-login}

OIDC, yerel kullanıcı adı/parola oturum açmayı devre dışı bırakmaz. Her iki yöntem de kullanılabilir kalır. OIDC sağlayıcısı erişilemez durumdaysa, yöneticiler yine de yerel kimlik bilgileriyle oturum açabilir.

## Kendinden imzalı sertifikalar {#self-signed-certificates}

OIDC sağlayıcınız kendinden imzalı veya özel bir CA sertifikası kullanıyorsa, CA paketini konteynere bağlayın ve `NODE_EXTRA_CA_CERTS` öğesini ona yönlendirin:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - ./my-ca.pem:/etc/ssl/certs/custom-ca.pem:ro
    environment:
      NODE_EXTRA_CA_CERTS: /etc/ssl/certs/custom-ca.pem
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.internal.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

::: danger 
`NODE_TLS_REJECT_UNAUTHORIZED=0` ayarlamayın. Bu, tüm TLS doğrulamasını devre dışı bırakır ve bir güvenlik riskidir.
:::

## Sorun giderme {#troubleshooting}

### Yönlendirme URI'si uyuşmazlığı {#redirect-uri-mismatch}

En yaygın hata. Sağlayıcınızın beklediği ile SnapOtter'ın gönderdiği arasındaki şu farklılıkları kontrol edin:

- `http` ile `https` karşılaştırması - şema tam olarak eşleşmelidir
- Sondaki eğik çizgi - bazı sağlayıcılar bu konuda katıdır
- Port numarası - standart değilse portu ekleyin
- Yol - `/api/auth/oidc/callback` olmalıdır

`EXTERNAL_URL` öğesini iki kez kontrol edin. Kullanıcıların tarayıcılarına yazdığı URL ile eşleşmelidir.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

OIDC sağlayıcısı, Node.js'in güvenmediği bir sertifika kullanıyor. Yukarıdaki [Kendinden imzalı sertifikalar](#self-signed-certificates) bölümüne bakın.

### Saat kayması hataları {#clock-skew-errors}

Sunucu saatiniz ve OIDC sağlayıcı saati senkronize değilse, token doğrulaması başarısız olabilir. `OIDC_CLOCK_TOLERANCE` değerini artırın (varsayılan 30 saniyedir). Daha iyi bir çözüm, her iki makinede de NTP çalıştırmaktır.

### "OIDC sağlayıcısı erişilemez" {#oidc-provider-unreachable}

SnapOtter, sağlayıcının keşif belgesini başlangıçta ve oturum açma sırasında getirir. Kontrol edin:

- Docker konteynerinin içinden DNS çözümlemesi (`docker exec snapotter nslookup auth.example.com`)
- Konteyner ile sağlayıcı arasındaki güvenlik duvarı kuralları
- `OIDC_ISSUER_URL` değeri - yalnızca tarayıcınızdan değil, sunucudan da erişilebilir olmalıdır

### Eksik istemler {#missing-claims}

Oturum açtıktan sonra kullanıcı adları veya e-postalar boşsa, sağlayıcınız beklenen istemleri döndürmüyor olabilir. Doğrulayın:

- `OIDC_SCOPES` içinde yapılandırılan kapsamlar `profile` ve `email` içerir
- Sağlayıcı, `OIDC_USERNAME_CLAIM` içinde belirtilen istemi ID token'a dahil edecek şekilde yapılandırılmıştır
- Bazı sağlayıcılar istemleri yayınlamak için açık eşleyici/kapsam yapılandırması gerektirir
