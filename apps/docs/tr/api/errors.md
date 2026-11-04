---
title: "Hata kodları"
description: "Hata gövdesinin yapısı, kararlı kodlar ve her biri için yapılması gerekenler."
i18n_source_hash: ed6e0590a6fd
i18n_provenance: machine
i18n_output_hash: d8b7077b9ec4
i18n_hash_version: 2
---

# Hata kodları {#error-codes}

Her JSON hata yanıtı aynı yapıdadır:

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Alan | Her zaman var | Anlamı |
|-------|----------------|---------|
| `error` | Evet | İnsanın okuyabileceği bir mesaj. Kullanıcılara göstermek güvenlidir. Ayrıştırmayın. |
| `code` | Evet | Kararlı, makine tarafından okunabilir bir kod. Mantığı bu koda göre dallandırın. |
| `requestId` | Evet | Sunucunun bu istek için verdiği kimlik. Sorun bildirirken belirtin; sunucu günlüğüyle eşleşir. |
| `details` | Bazen | Bazı 4xx hataları için ek bağlam, örneğin doğrulama mesajı. |

Mesajlar sürümler arasında değişebilir. Kodlar değişmez, bu yüzden istemci mantığını `code` üzerine yazın.

## HTTP durumundan gelen kodlar {#status-codes}

Bir rota kendi kodunu belirlemediğinde sunucu kodu durumdan türetir:

| HTTP durumu | `code` |
|-------------|--------|
| 400 | `BAD_REQUEST` |
| 401 | `AUTH_REQUIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 501 | `NOT_IMPLEMENTED` |
| 503 | `SERVICE_UNAVAILABLE` |
| 507 | `INSUFFICIENT_STORAGE` |

Diğer tüm 4xx durumları `BAD_REQUEST` koduna, diğer tüm 5xx durumları ise `INTERNAL_ERROR` koduna döner.

Bir rota daha özel bir kod belirleyebilir; bu durumda yanıt o kodu taşır. Örneğin AI paketi eksik olduğu için çalışamayan bir araç, özelliğe özgü bir kod döndürür. Bu kodlar, onları üreten özellikle birlikte açıklanır.

## Kimlik doğrulama ve erişim {#auth-codes}

| `code` | Durum | Yapılacak |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | `Authorization: Bearer <token>` değerini bir oturum belirteci veya API anahtarıyla (`si_...`) gönderin. |
| `FORBIDDEN` | 403 | Kimlik bilgisi geçerli ancak izin eksik. Bir yöneticiden bu izni isteyin. |
| `MUST_CHANGE_PASSWORD` | 403 | Hesap, diğer uç noktaları çağırmadan önce parolasını değiştirmelidir. Oturum belirteciyle `POST /api/auth/change-password` uç noktasını çağırın, ardından yeniden deneyin. |
| `USER_DISABLED` | 403 | Hesap devre dışı. Bir yöneticinin hesabı yeniden etkinleştirmesi gerekir. |
| `LOGIN_THROTTLED` | 429 | Çok fazla başarısız oturum açma denemesi. Yeniden denemeden önce bekleyin. |
| `VALIDATION_ERROR` | 400 | İstek gövdesi veya parametreleri doğrulamayı geçemedi. `details` sorunu belirtir. |

İlk çalıştırmadaki yönetici hesabı `admin` kullanıcı adı ve `admin` parolasıyla gelir; `DEFAULT_USERNAME` veya `DEFAULT_PASSWORD` bunu değiştirmediyse geçerlidir. `SKIP_MUST_CHANGE_PASSWORD` ayarlanmadıkça, parola değişene kadar bu hesap her çağrıda `MUST_CHANGE_PASSWORD` yanıtını alır.

## İşler {#job-codes}

Başarısız olan bir iş, nedenini HTTP hatasında değil işin kendisinde bildirir. `GET /api/v1/jobs/{jobId}` içinden `error.code` ve `error.message` değerlerini okuyun. Bkz. [İlerleme Takibi](/tr/api/rest#progress-tracking).

Başarısız bir iş, `error.code` alanını yalnızca hata bir girdi hatası veya sunucu arızası olduğunda korur. Diğer hatalar yalnızca mesajı taşır.

| `code` | Anlamı | Yapılacak |
|--------|---------|------------|
| `CANCELED` | İş bir kullanıcı tarafından iptal edildi. Bir HTTP durumu değildir. İlerleme olayları bu kodla `phase: failed` taşır. | Kullanıcı iptali olarak değerlendirin. Otomatik olarak yeniden denemeyin. |
| `INPUT_MISSING` | Girdi, iş çalışmadan önce kaldırıldı. | Dosyayı yeniden yükleyin. |
| `ENGINE_UNAVAILABLE` | Gerekli bir motor sunucuda başlatılamadı. | Bir yönetici kurulumu onardıktan sonra yeniden deneyin. |

## Kimlik doğrulama ve MFA {#mfa-codes}

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | MFA ilkesi kayıt gerektiriyor ve bu örnek kullanıcıyı kaydedemiyor (kurumsal lisans yok). Lisanslı örnekler bunun yerine `requiresMfaEnrollment: true` ile 200 döndürür ve kullanıcıyı kayıt adımlarında yönlendirir. | Yeniden denemeyin. Bir yöneticinin ilkeyi değiştirmesi veya çevrimdışı kurtarma CLI'sini kullanması gerekir. |
| `MFA_POLICY_UNAVAILABLE` | 503 | Sunucu, oturum açma sırasında MFA ilkesini okuyamadı. | Oturum açmayı kısa süre sonra yeniden deneyin. |
| `INVALID_CODE` | 401 | TOTP veya kurtarma kodu yanlış. | Kullanıcıdan yeni bir kod isteyin ve yeniden deneyin. Tekrarlanan hatalar `MFA_ATTEMPTS_EXHAUSTED` ile sonuçlanır. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Çok fazla yanlış kod girildi. Doğrulama sorgusu iptal edilir. | Yeni bir doğrulama sorgusu almak için oturum açmayı baştan başlatın. |
| `MFA_EXPIRED` | 401 | MFA veya kayıt doğrulama sorgusunun süresi doldu ya da eşleşmiyor. | Oturum açmayı baştan başlatın. |
| `MFA_NOT_CONFIGURED` | 401 | Hesapta TOTP gizli anahtarı yok, bu yüzden kod doğrulanamıyor. | Kodla oturum açmadan önce MFA'ya kaydolun. |
| `MFA_ALREADY_ENABLED` | 409 | MFA hesapta zaten etkin. | Yeniden kaydolmayın. |
| `NO_PENDING_ENROLLMENT` | 400 | Bekleyen bir kayıt olmadan kayıt onayı geldi. | Önce kayıt uç noktasını çağırın. |
| `MFA_NOT_ENABLED` | 400 | İşlem için MFA'nın açık olması gerekiyor, ancak bu kullanıcı için kapalı. | İşlemi atlayın veya önce MFA'yı etkinleştirin. |
| `MFA_DECRYPTION_FAILED` | 500 | Saklanan TOTP gizli anahtarının şifresi çözülemiyor. | Operatör işlemi. Bu genellikle şifreleme anahtarının değiştiği anlamına gelir. `DATA_ENCRYPTION_KEY` ve `DATA_ENCRYPTION_KEY_PREVIOUS` değerlerini kontrol edin. |
| `DECRYPTION_FAILED` | 500 | Saklanan bir değerin (bir ayar, bir webhook kimlik doğrulama üstbilgisi veya bir TOTP gizli anahtarı) şifresi çözülemiyor. | Yukarıdaki gibi operatör işlemi. Yeniden denemeyin. |
| `IDLE_TIMEOUT` | 401 | Oturum, bir süre işlem yapılmadığı için sona erdi. | Yeniden oturum açın. |
| `INVALID_PASSWORD` | 401 | Parola değişikliğinde mevcut parola yanlış. | Kullanıcıdan mevcut parolasını isteyin. |
| `PASSWORD_CHANGED` | 409 | Bu istek çalışırken parola başka bir oturumda değişti veya bir yönetici sıfırladı. | Yeniden oturum açın. |
| `OIDC_NO_PASSWORD` | 400 | SSO ile oluşturulmuş bir hesap için parola değişikliği veya sıfırlama istendi. | Kullanıcıyı kimlik sağlayıcıya yönlendirin. |

## OIDC {#oidc-codes}

Oturum açma sırasındaki OIDC hataları bir JSON gövdesi döndürmez. Oturum açma rotası, genel bir nedenle oturum açma sayfasına yönlendirir ve denetim günlüğü kodu kaydeder. Kimlik sağlayıcıya ulaşılamasa bile çıkış rotası yerel oturumu sonlandırır.

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Yok (yönlendirme) | Veren URL'si `http`, ancak `EXTERNAL_URL` değeri `https` olduğundan istemci keşfi reddediyor. | Yönetici: vereni `https` üzerinden sunun veya örneği `http` üzerinden çalıştırın. |
| `OIDC_DISCOVERY_TIMEOUT` | Yok (yönlendirme) | Verenin keşfi zaman aşımına uğradı. | Sunucunun verene ulaşabildiğini kontrol edin, ardından yeniden deneyin. |
| `OIDC_DISCOVERY_FAILED` | Yok (yönlendirme) | Keşif başka bir nedenle başarısız oldu. | Veren URL'sini ve sunucunun giden erişimini kontrol edin. |
| `OIDC_END_SESSION_INVALID` | Yok (çıkış devam eder) | Kimlik sağlayıcının `end_session_endpoint` değeri geçerli bir URL değil. Yerel oturum yine de temizlenir. | Yönetici: sağlayıcının meta verilerini düzeltin. |
| `OIDC_END_SESSION_SCHEME` | Yok (çıkış devam eder) | `end_session_endpoint`, sunucunun izin vermediği bir şema kullanıyor. Yerel oturum yine de temizlenir. | Yönetici: sağlayıcının meta verilerini düzeltin. |

## SAML {#saml-codes}

SAML hataları bir `code` ayarlamaz. Başarısız bir doğrulama ifadesi, `saml_auth_failed` ile oturum açma sayfasına yönlendirir ve `SAML_LOGIN_FAILED` denetim olayı nedeni kaydeder.

## SCIM {#scim-codes}

SCIM rotaları RFC 7644 hata zarfıyla yanıt verir (`schemas`, `detail`, `status` ve bazen `scimType`). `code` ayarlamazlar. HTTP durumuna göre dallandırın.

## Ekipler, roller ve kullanıcılar {#team-role-codes}

Yinelenen ekip veya rol adları genel `CONFLICT` kodunu, eksik bir ekip veya rol ise `NOT_FOUND` kodunu döndürür.

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | Çağıranın rolü bu değişikliğe izin vermiyor. Hedef çağıranın yetkisinin üzerinde, rol yerleşik veya istek çağıranın sahip olmadığı izinleri veriyor. | Yeniden denemeyin. Daha yetkili bir kullanıcıdan isteyin. |
| `UNKNOWN_ROLE` | 400 | Rol kimliği mevcut bir rolle eşleşmiyor. | Rol kimliğini düzeltin. Bulmak için rolleri listeleyin. |
| `UNKNOWN_TEAM` | 400 | Ekip kimliği mevcut bir ekiple eşleşmiyor. | Ekip kimliğini düzeltin. |
| `SELF_DEMOTE` | 400 | Bir yönetici kendi yönetici rolünü kaldırmaya çalıştı. | Değişikliği başka bir yöneticiye yaptırın. |
| `SELF_DELETE` | 400 | Bir yönetici kendi hesabını silmeye çalıştı. | Hesabı başka bir yöneticiye sildirin. |
| `LAST_ADMIN` | Kullanıcı rotalarında 400, GDPR temizleme rotalarında 409 | Değişiklik hiç yönetici bırakmayacak veya tüm yöneticileri barındıran bir ekibi temizleyecek. | Önce başka bir kullanıcıyı yönetici yapın. |
| `USER_LIMIT_REACHED` | 403 | Örnek, `MAX_USERS` sınırına ulaştı. | Bir kullanıcıyı kaldırın veya `MAX_USERS` değerini yükseltin. |

## Özellikler ve AI paketleri {#feature-codes}

İsteğe bağlı bir AI paketi gerektiren araçlar, toplu çalıştırmalar ve işlem hatları bu kodları kullanır.

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501 | Araç veya bir işlem hattının ya da toplu çalıştırmanın bir adımı, kurulu olmayan bir pakete ihtiyaç duyuyor. Gövde `feature` (paket kimliği) ve `featureName` içerir. | Paketi Ayarlar'dan kurun, ardından yeniden deneyin. |
| `FEATURE_INCOMPATIBLE` | 501 | Kurulu özellik, istenen kaliteyi veya dili işleyemiyor. | Ayarı değiştirin veya bunu destekleyen bir paket kurun. |
| `ENGINE_UNAVAILABLE` | 503 | Gerekli bir motor başlatılamadı veya bir OCR çalışma zamanı, istek doğrulandıktan sonra kaldırıldı. | Bir yönetici özelliği onarıp yeniden kurduktan sonra yeniden deneyin. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium kurulu değil, bu yüzden HTML'den görsele dönüştürme çalışamıyor. | Bir yöneticiden tarayıcıyı kurmasını isteyin. |
| `BROWSER_CRASHED` | 503 | Ekran görüntüsü tarayıcısı işleme sırasında çöktü. | İsteği yeniden deneyin. |

## Araçlar {#tool-codes}

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | Yüklenen girdi, iş çalışmadan önce kaldırıldı. | Dosyayı yeniden yükleyin ve işi gönderin. |
| `ANALYSIS_EXPIRED` | 410 | Vesikalık fotoğraf analizinin süresi, oluşturma öncesinde doldu. | Fotoğrafı yeniden analiz edin, ardından oluşturun. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Arka plan kaldırma sonucunun süresi, sonraki adımdan önce doldu. | Arka planı yeniden kaldırın. |
| `NOT_ANIMATED` | 400 | GIF Arka Planını Kaldır aracı sabit bir görsel aldı. | Sabit görseller için Arka Planı Kaldır aracını kullanın. |
| `TOO_MANY_FRAMES` | 400 | Animasyonun kare sayısı sunucunun izin verdiğinden fazla (`GIF_BG_MAX_FRAMES`). | Daha kısa bir animasyon gönderin veya bir yöneticiden sınırı yükseltmesini isteyin. |

## Dosyalar {#file-codes}

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Dosyalar'a kaydetmek kullanıcının depolama kotasını aşar. | Dosyaları silin veya bir yöneticiden daha fazla alan isteyin. |
| `INVALID_STORED_NAME` | 400 | Sunucu, saklanan bir dosya adını reddetti. | Dosyayı yeniden yükleyin. |

## İşlem hatları ve toplu işlemler {#pipeline-codes}

İşlem hattı ve toplu işlem istekleri, paket gerektiren her adım için yukarıdaki özellik kodlarını döndürür. Zaten kullanımda olan bir iş kimliği, 409 durumuyla `CONFLICT` döndürür. Yeni bir iş kimliği gönderin.

## Ayarlar {#settings-codes}

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | Anahtar, bilinen bir ayar değil. | Anahtar adını kontrol edin. |
| `READONLY_SETTING` | 400 | Ayar API üzerinden değiştirilemez. | Ortam değişkenleri veya yönetici arayüzü üzerinden değiştirin. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | Yeni değer diğer ayarlarla çakışıyor. Gövde, ayarı `setting` içinde belirtir ve sorunları `validationErrors` içinde listeler. | Listelenen ayarları düzeltin, ardından yeniden deneyin. |
| `SETTING_DECRYPTION_FAILED` | 500 | Saklanan bir ayarın şifresi çözülemiyor. | `DECRYPTION_FAILED` için olduğu gibi operatör işlemi. |

Bir ayarda `VALIDATION_ERROR` için `details` şema sorunlarını içerir.

## Kurumsal {#enterprise-codes}

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | Ayar veya ilke, SSO zorlaması ya da MFA ilkesi gibi kurumsal bir lisans gerektiriyor. | Lisanslı bir örnek kullanın veya ayarı kapalı bırakın. |
| `IP_NOT_ALLOWED` | 403 | İsteğin IP adresi izin listesinde değil. | İzin verilen bir ağdan bağlanın. |
| `INVALID_CIDR` | 400 | Bir izin listesi girdisi geçerli bir CIDR değil. Mesaj, hatalı girdileri listeler. | Girdileri düzeltin ve yeniden kaydedin. |
| `SELF_LOCKOUT` | 400 | İzin listesini kaydetmek, çağıranın geçerli IP adresini engelleyecek. | Önce geçerli IP adresinizi listeye ekleyin. |

GDPR temizleme rotaları, bir kullanıcı veya ekip yasal saklama altındayken 409 durumuyla düz bir `CONFLICT` döndürür.

## İstemcilerin almadığı kodlar {#internal-codes}

Bu kodlar sunucu kaynağında günlükler, telemetri veya Fastify'ın kendi hataları için bulunur. Bir istemci bunları yanıt gövdesinde veya iş satırında almaz, bu yüzden istemci mantığını bunlara göre yazmayın.

| `code` | Nereye gider |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Uyarı değerlendiricisi tarafından hata izlemeye bildirilir. Bir uyarı webhook'unun kimlik doğrulama üstbilgisinin şifresi çözülemiyor. |
| `SIEM_DECRYPTION_FAILED` | SIEM iletimi tarafından hata izlemeye bildirilir. SIEM kimlik doğrulama üstbilgisinin şifresi çözülemiyor. |
| `WEBHOOK_DECRYPTION_FAILED` | Hata izlemeye bildirilir. Aynı hataya takılan istek `DECRYPTION_FAILED` ile yanıt verir. |
| `STAGED_DISCARD_FAILED` | Hazırlanmış bir yükleme kaldırılamadığında hata izlemeye bildirilir. |
| `USERNAME_RACE_EXHAUSTED` | SSO otomatik oluşturma, her denemede kullanıcı adı yarışını kaybettiğinde oluşur. Oturum açma sayfası bunun yerine bir hata gösterir. |
| `ERR_OUT_OF_RANGE` | Nesne depolama okuyucusu tarafından geçersiz bir bayt aralığı için fırlatılır. |
| `ETIMEDOUT` | Bir GDPR dışa aktarımının zaman aşımı hatasına atanır. Dışa aktarım başarısız olur ve yeniden istenebilir. |
| `FST_REQ_FILE_TOO_LARGE` | Sınırı aşan bir yükleme için Fastify'ın kodu. İstemciler `PAYLOAD_TOO_LARGE` ile 413 veya rotanın kendi 413 mesajını alır. |
| `TARGET_SIZE_EXCEEDED` | Hedef boyuta göre sıkıştırma hedefi tutturamadığında fırlatılır. Hatanın durumu veya kodu yoktur, bu yüzden istemciler genel bir hata alır. |
