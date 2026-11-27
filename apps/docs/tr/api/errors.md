---
title: "Hata kodları"
description: "Hata gövdesinin yapısı, kararlı kodlar ve her biri için yapılması gerekenler."
i18n_source_hash: 7e48ef36024d
i18n_provenance: machine
i18n_output_hash: 1b8fc32f7845
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

Başarısız olan bir iş, nedenini HTTP hatasında değil işin kendisinde bildirir. `error.code` içinden `error.message` ve `GET /api/v1/jobs/{jobId}` değerlerini okuyun. Bkz. [İlerleme Takibi](/tr/api/rest#progress-tracking).

Başarısız bir iş, `error.code` değerini yalnızca hata bir girdi hatası veya sunucu arızası olduğunda tutar. Diğer hatalar yalnızca mesajı taşır.

| `code` | Anlamı | Yapılacak |
|--------|---------|------------|
| `CANCELED` | İş bir kullanıcı tarafından iptal edildi. Bu bir HTTP durumu değildir. İlerleme olayları bu kodla `phase: failed` taşır. | Bunu kullanıcı iptali olarak ele alın. Otomatik olarak yeniden denemeyin. |
| `INPUT_MISSING` | Girdi, iş çalışmadan önce kaldırıldı. | Dosyayı yeniden yükleyin. |
| `ENGINE_UNAVAILABLE` | Gerekli bir motor sunucuda başlatılamadı. | Bir yönetici kurulumu onardıktan sonra yeniden deneyin. |
| `JOB_STALLED` | İstemcilere döndürülmez; sunucunun hata raporunu etiketler. İşçi, işin kilidini kuyruğun izin verdiğinden daha fazla kez kaybetti; bunun nedeni genellikle sunucunun yeniden başlaması veya bellek ya da CPU yetersizliğidir. İş, kesintiye uğradığını belirten bir mesajla başarısız olur. | Yeniden deneyin. Sürekli oluyorsa sunucuya daha fazla bellek verin veya `CONCURRENT_JOBS` değerini düşürün. |

## Kimlik doğrulama ve MFA {#mfa-codes}

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | MFA ilkesi kayıt gerektiriyor ve bu örnek kullanıcıyı kaydedemiyor (kurumsal lisans yok). Lisanslı örnekler bunun yerine `requiresMfaEnrollment: true` ile 200 döndürür ve kullanıcıyı kayıt adımlarında yönlendirir. | Yeniden denemeyin. Bir yöneticinin ilkeyi değiştirmesi veya çevrimdışı kurtarma CLI'sını kullanması gerekir. |
| `MFA_POLICY_UNAVAILABLE` | 503 | Sunucu, oturum açma sırasında MFA ilkesini okuyamadı. | Oturum açmayı kısa süre sonra yeniden deneyin. |
| `INVALID_CODE` | 401 | TOTP veya kurtarma kodu yanlış. | Kullanıcıdan yeni bir kod isteyip yeniden deneyin. Tekrarlanan hatalar `MFA_ATTEMPTS_EXHAUSTED` ile sonuçlanır. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Çok fazla yanlış kod. Sınama iptal edilir. | Yeni bir sınama almak için oturum açmayı baştan başlatın. |
| `MFA_EXPIRED` | 401 | MFA veya kayıt sınamasının süresi doldu ya da eşleşmiyor. | Oturum açmayı baştan başlatın. |
| `MFA_NOT_CONFIGURED` | 401 | Hesabın TOTP sırrı yok, bu yüzden kod doğrulanamaz. | Kodla oturum açmadan önce MFA'ya kaydolun. |
| `MFA_ALREADY_ENABLED` | 409 | MFA hesapta zaten etkin. | Yeniden kaydolmayın. |
| `NO_PENDING_ENROLLMENT` | 400 | Bekleyen bir kayıt olmadan kayıt onayı geldi. | Önce kayıt uç noktasını çağırın. |
| `MFA_NOT_ENABLED` | 400 | İşlem için MFA'nın açık olması gerekiyor, ancak bu kullanıcı için kapalı. | İşlemi atlayın veya önce MFA'yı etkinleştirin. |
| `MFA_DECRYPTION_FAILED` | 500 | Saklanan TOTP sırrının şifresi çözülemiyor. | Operatör müdahalesi gerekir. Bu genellikle şifreleme anahtarının değiştiği anlamına gelir. `DATA_ENCRYPTION_KEY` ve `DATA_ENCRYPTION_KEY_PREVIOUS` değerlerini kontrol edin. |
| `DECRYPTION_FAILED` | 500 | Saklanan bir değerin (bir ayar, bir webhook kimlik doğrulama üst bilgisi veya bir TOTP sırrı) şifresi çözülemiyor. | Yukarıdaki gibi operatör müdahalesi gerekir. Yeniden denemeyin. |
| `IDLE_TIMEOUT` | 401 | Oturum, bir süre hareketsizlikten sonra sona erdi. | Yeniden oturum açın. |
| `INVALID_PASSWORD` | 401 | Parola değişikliğinde mevcut parola yanlış. | Kullanıcıdan mevcut parolasını isteyin. |
| `PASSWORD_CHANGED` | 409 | Bu istek çalışırken parola başka bir oturumda değişti veya bir yönetici sıfırladı. | Yeniden oturum açın. |
| `OIDC_NO_PASSWORD` | 400 | SSO ile oluşturulmuş bir hesap için parola değişikliği veya sıfırlama istendi. | Kullanıcıyı kimlik sağlayıcıya yönlendirin. |

## OIDC {#oidc-codes}

Oturum açma sırasındaki OIDC hataları JSON gövdesi döndürmez. Giriş rotası, genel bir nedenle giriş sayfasına yönlendirir ve denetim günlüğü kodu kaydeder. Çıkış rotası, kimlik sağlayıcıya ulaşılamasa bile yerel oturumu sonlandırır.

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Yok (yönlendirme) | Yayımcı URL'si `http`, ancak `EXTERNAL_URL` değeri `https` olduğundan istemci keşfi reddeder. | Yönetici: yayımcıyı `https` üzerinden sunun veya örneği `http` üzerinden çalıştırın. |
| `OIDC_DISCOVERY_TIMEOUT` | Yok (yönlendirme) | Yayımcının keşfi zaman aşımına uğradı. | Sunucunun yayımcıya ulaşabildiğini kontrol edin, ardından yeniden deneyin. |
| `OIDC_DISCOVERY_FAILED` | Yok (yönlendirme) | Keşif başka bir nedenle başarısız oldu. | Yayımcı URL'sini ve sunucunun dışa erişimini kontrol edin. |
| `OIDC_END_SESSION_INVALID` | Yok (çıkış devam eder) | Kimlik sağlayıcının `end_session_endpoint` değeri geçerli bir URL değil. Yerel oturum yine de temizlenir. | Yönetici: sağlayıcının meta verilerini düzeltin. |
| `OIDC_END_SESSION_SCHEME` | Yok (çıkış devam eder) | `end_session_endpoint`, sunucunun izin vermediği bir şema kullanıyor. Yerel oturum yine de temizlenir. | Yönetici: sağlayıcının meta verilerini düzeltin. |

## SAML {#saml-codes}

SAML hataları `code` belirlemez. Başarısız bir doğrulama, giriş sayfasına `saml_auth_failed` ile yönlendirir ve `SAML_LOGIN_FAILED` denetim olayı nedeni kaydeder.

## SCIM {#scim-codes}

SCIM rotaları RFC 7644 hata zarfıyla yanıt verir (`schemas`, `detail`, `status` ve bazen `scimType`). `code` belirlemezler. HTTP durumuna göre dallandırın.

## Ekipler, roller ve kullanıcılar {#team-role-codes}

Yinelenen ekip veya rol adları genel `CONFLICT` döndürür, eksik bir ekip veya rol ise `NOT_FOUND` döndürür.

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | Çağıranın rolü değişikliğe izin vermiyor. Hedef çağıranın yetkisinin üstünde, rol yerleşik veya istek çağıranın sahip olmadığı izinleri veriyor. | Yeniden denemeyin. Daha yetkili bir kullanıcıdan isteyin. |
| `UNKNOWN_ROLE` | 400 | Rol kimliği mevcut bir rolle eşleşmiyor. | Rol kimliğini düzeltin. Bulmak için rolleri listeleyin. |
| `UNKNOWN_TEAM` | 400 | Ekip kimliği mevcut bir ekiple eşleşmiyor. | Ekip kimliğini düzeltin. |
| `SELF_DEMOTE` | 400 | Bir yönetici kendi yönetici rolünü kaldırmaya çalıştı. | Değişikliği başka bir yöneticiye yaptırın. |
| `SELF_DELETE` | 400 | Bir yönetici kendi hesabını silmeye çalıştı. | Hesabı başka bir yöneticiye sildirin. |
| `LAST_ADMIN` | Kullanıcı rotalarında 400, GDPR temizleme rotalarında 409 | Değişiklik hiç yönetici bırakmayacak veya tüm yöneticileri barındıran bir ekibi temizleyecek. | Önce başka bir kullanıcıyı yönetici yapın. |
| `USER_LIMIT_REACHED` | 403 | Örnek `MAX_USERS` sınırına ulaştı. | Bir kullanıcıyı kaldırın veya `MAX_USERS` değerini yükseltin. |

## Özellikler ve AI paketleri {#feature-codes}

İsteğe bağlı bir AI paketi gerektiren araçlar, toplu çalıştırmalar ve işlem hatları bu kodları kullanır.

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501, veya Smart Crop'un yüz modunda 400 | Araç ya da bir işlem hattı veya toplu çalıştırmanın bir adımı, yüklü olmayan bir paket gerektiriyor. Gövde `feature` (paket kimliği) ve `featureName` içerir. | Paketi Settings bölümünden yükleyin, ardından yeniden deneyin. |
| `FEATURE_CPU_UNSUPPORTED` | 409 | Paketin x86-64 kitaplıkları AVX gerektirdiği ve bu sunucunun CPU'sunda AVX bulunmadığı için bir kurulum veya çevrimdışı içe aktarma reddedildi. Hiçbir şey indirilmedi veya kurulmadı. Gövde `feature` (paket kimliği) ve `reason` (`cpu-no-avx`) içerir. `GET /api/v1/features` aynı paketi `compatibility: "incompatible"` ve `compatibilityReason: "cpu-no-avx"` ile bildirir. | SnapOtter'ı AVX'li bir CPU'da veya arm64 üzerinde çalıştırın. Diğer paketler yine de kurulur. |
| `FEATURE_INSTALL_BUSY` | 409 | Yükleyici paylaşılan AI ortamına yazdığı ve orada durdurmak yüklü her AI aracını bozacağı için bir iptal isteği reddedildi. | Kurulumun bitmesini bekleyin, ardından paketi istemiyorsanız kaldırın. |
| `FEATURE_INCOMPATIBLE` | 501, veya Fast OCR okuyamadığı bir dil aldığında 400 | Yüklü özellik, istenen kaliteyi veya dili yapamıyor. | Ayarı değiştirin veya bunu destekleyen bir paket yükleyin. |
| `ENGINE_UNAVAILABLE` | 503 | Gerekli bir motor başlatılamadı veya istek doğrulandıktan sonra bir OCR çalışma zamanı kaldırıldı. | Bir yönetici özelliği onardıktan veya yeniden kurduktan sonra yeniden deneyin. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium yüklü değil, bu yüzden HTML'den görüntüye aracı çalışamaz. | Bir yöneticiden tarayıcıyı kurmasını isteyin. |
| `BROWSER_CRASHED` | 503 | Ekran görüntüsü tarayıcısı işleme sırasında çöktü. | İsteği yeniden deneyin. |

## Araçlar {#tool-codes}

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | Yüklenen girdi, iş çalışmadan önce kaldırıldı. | Dosyayı yeniden yükleyin ve işi gönderin. |
| `ANALYSIS_EXPIRED` | 410 | Vesikalık fotoğraf analizinin süresi, oluşturmadan önce doldu. | Fotoğrafı yeniden analiz edin, ardından oluşturun. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Arka plan kaldırma sonucunun süresi, sonraki adımdan önce doldu. | Arka planı yeniden kaldırın. |
| `NOT_ANIMATED` | 400 | Remove GIF Background bir sabit görüntü aldı. | Sabit görüntüler için Remove Background aracını kullanın. |
| `TOO_MANY_FRAMES` | 400 | Animasyon, sunucunun izin verdiğinden daha fazla kare içeriyor (`GIF_BG_MAX_FRAMES`). | Daha kısa bir animasyon gönderin veya bir yöneticiden sınırı yükseltmesini isteyin. |
| `TOO_MANY_PIXELS` | 400 | Animasyonun tuval boyutu ile kare sayısının çarpımı sunucunun sınırını aşıyor: Remove GIF Background için 268.402.689 piksel (16383 x 16383), diğer animasyonlu araçlar için GIF iş yükü sınırı. | Daha az kare veya daha küçük bir animasyon gönderin. |
| `MULTI_FRAME_UNSUPPORTED` | 400 | Bir AI görüntü aracı çok sayfalı bir TIFF veya animasyonlu bir GIF ya da WebP aldı ve çıktı biçimi her kareyi koruyacak. Bu araçlar modellerini her seferinde tek bir görüntü üzerinde çalıştırır. | Dosyayı ayrı görüntülere bölün. Aracın bir çıktı biçimi ayarı varsa, PNG gibi sabit bir biçim yalnızca ilk kareyi işler. |
| `IMAGE_TOO_LARGE` | 400 | Görüntü, kod çözücünün kabul ettiğinden daha fazla piksele sahip. | Daha küçük bir görüntü gönderin. |
| `SVG_TOO_COMPLEX` | 400 | SVG, `JOB_TIMEOUT_FAST_S` içinde rasterleştirmeyi bitiremedi. Nedeni genellikle `<use>` ile tekrarlanan şekillerdeki filtrelerdir, çünkü her kopya filtreyi yeniden boyar. | Filtreleri veya tekrarlanan şekilleri basitleştirin ya da bir yöneticiden sınırı yükseltmesini isteyin. |
| `RESULT_TOO_LARGE` | 400 | Ayarlar, kodlayıcının veya piksel sınırının izin verdiğinden daha büyük bir görüntü üretecek. | Daha küçük bir görüntü veya daha küçük sonuç veren ayarlar kullanın. |
| `DOCUMENT_UNREADABLE` | 400 | LibreOffice veya pandoc belgeyi açamadı. Belge hasarlı, parola korumalı ya da uzantısının belirttiği biçimde olmayabilir. | Dosyanın bir ofis uygulamasında açıldığını kontrol edin, ardından yeniden gönderin. |
| `PDF_DAMAGED` | 400 | PDF motoru bozuk belge yapısı buldu. | Dosyayı Repair PDF'den geçirin, ardından yeniden deneyin. |
| `PDF_PASSWORD_PROTECTED` | 400 | PDF şifreli ve bu araç onu açamıyor. | Önce Unlock PDF ile kilidini açın. |
| `NO_AUDIO_TRACK` | 400 | Dosyada, bir ses aracının kullanabileceği ses akışı yok. | Sesli bir dosya gönderin. |
| `MEDIA_UNDECODABLE` | 400 | ffmpeg sesi veya videoyu okuyamadı: paket, codec parametresi, `moov` atomu veya ayrıştırabildiği veri bulamadı. | Dosyanın bir medya oynatıcıda çalıştığını kontrol edin veya yeniden dışa aktarın, ardından yeniden deneyin. |
| `ENCODED_TEXT_INVALID` | 400 | Base64 Encode / Decode, Base64 olmayan bir girdi aldı. Boşluklar yok sayılır ve hem standart hem de URL-safe alfabeler kabul edilir. | Metinde başıboş karakter veya kesilmiş bir son olup olmadığını kontrol edin. |
| `DECODED_DATA_NOT_TEXT` | 400 | Base64 geçerli ancak UTF-8 metni değil, ikili veriye çözülüyor. | Metin göstermek yerine dosya kaydeden bir araçla çözün. |
| `PAGE_OUT_OF_RANGE` | 400 | Sayfa aralığı, PDF'de bulunmayan bir sayfayı belirtiyor. | Sayfa sayısını kontrol edin ve bunun içinde kalan bir aralık gönderin. |
| `INVALID_PAGE_RANGE` | 400 | Sayfa aralığı geçerli bir söz diziminde değil. | `1-3,5` gibi sayfa numaraları kullanın. |
| `CANNOT_REMOVE_ALL_PAGES` | 400 | Remove Pages'ten her sayfayı kaldırması istendi. | En az bir sayfa bırakın. |
| `NESTING_TOO_DEEP` | 400 | JSON veya XML 100 seviyeden daha derin iç içe. | Belgeyi düzleştirin, ardından dönüştürün. |
| `IMAGE_UNDECODABLE` | 400 | Görüntünün kodu çözülemiyor veya boyutları okunamıyor. Dosya hasarlı olabilir veya kod çözücünün desteklemediği bir kodlama kullanıyor olabilir. | Görüntüyü başka bir uygulamadan yeniden dışa aktarın veya önce PNG ya da JPEG'e dönüştürün. |
| `INVALID_SETTINGS` | 400 | Bir ayar aralık dışında veya bu dosyaya uymuyor: görüntünün dışında bir kırpma, sıfır boyutlu bir yeniden boyutlandırma, animasyonda bulunmayan bir GIF karesi, var olmayan bir vesikalık fotoğraf şartnamesi. `error` metni ayarı belirtir. | `error` içinde belirtilen ayarı düzeltin, ardından yeniden deneyin. |
| `CHART_DATA_INVALID` | 400 | Chart Maker dosyadan grafik verisini okuyamadı: CSV veya JSON ayrıştırılamıyor, sayısal sütun yok, 100'den fazla satır var veya negatif bir değer var. `error` metni hangisi olduğunu söyler. | En fazla 100 satırlık, her biri bir etiket ve sıfır veya daha büyük bir sayıdan oluşan CSV veya JSON gönderin. |
| `NO_FACE_DETECTED` | 400 | Passport Photo görüntüde yüz bulamadı. | Net, önden çekilmiş, iyi aydınlatılmış bir fotoğraf gönderin. |
| `TARGET_SIZE_UNREACHABLE` | 400 | Sıkıştırma veya vesikalık fotoğrafın boyut sınırı, ölçeği küçültülse bile dosyayı istenen boyutun altına indiremiyor. | Daha büyük bir hedef boyut isteyin veya önce görüntüyü kırpın. |
| `TOO_MANY_PAGES` | 400 | OCR'den, bir işte işlediğinden daha fazla sayfa istendi. | Sayfa aralığıyla daha az sayfa seçin. |
| `OCR_OUTPUT_TOO_LARGE` | 500 | Çok sayfalı bir TIFF üzerindeki OCR, sayfaları boyunca 1.000.000 bayttan fazla metin okudu; bu, tek bir sonucun saklayabileceğinden fazladır. | TIFF'i daha küçük dosyalara bölün ve her birinde OCR çalıştırın. |
| `METADATA_DAMAGED` | 400 | Edit Metadata, görüntünün mevcut EXIF verisini hasarlı buldu, bu yüzden güvenli şekilde yeniden yazamıyor. | Önce Remove Image Metadata ile meta verileri temizleyin, ardından düzenleyin. |
| `REMOTE_RESOURCES_DISABLED` | 400 | HTML veya Markdown'dan PDF'ye dönüştürme, ağdaki bir görüntüye, stil sayfasına veya yazı tipine başvuru buldu; sunucu bunları getirmez. | Kaynağı dosyaya gömün (örneğin `data:` URI olarak), ardından yeniden deneyin. |

## Dosyalar {#file-codes}

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Files'a kaydetmek kullanıcının depolama kotasını aşacak. | Dosyaları silin veya bir yöneticiden daha fazla alan isteyin. |
| `INVALID_STORED_NAME` | 400 | Sunucu, saklanan bir dosya adını reddetti. | Dosyayı yeniden yükleyin. |

## İşlem hatları ve toplu işlem {#pipeline-codes}

İşlem hattı ve toplu işlem istekleri, paket gerektiren her adım için yukarıdaki özellik kodlarını döndürür. Zaten kullanımda olan bir iş kimliği, 409 durumuyla `CONFLICT` döndürür. Yeni bir iş kimliği gönderin.

## Ayarlar {#settings-codes}

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | Anahtar bilinen bir ayar değil. | Anahtar adını kontrol edin. |
| `READONLY_SETTING` | 400 | Ayar API üzerinden değiştirilemez. | Ortam üzerinden veya yönetici arayüzünden değiştirin. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | Yeni değer diğer ayarlarla çakışıyor. Gövde ayarı `setting` içinde belirtir ve sorunları `validationErrors` içinde listeler. | Listelenen ayarları düzeltin, ardından yeniden deneyin. |
| `SETTING_DECRYPTION_FAILED` | 500 | Saklanan bir ayarın şifresi çözülemiyor. | `DECRYPTION_FAILED` için olduğu gibi operatör müdahalesi gerekir. |

Bir ayarda `VALIDATION_ERROR` için, `details` şema sorunlarını tutar.

## Kurumsal {#enterprise-codes}

| `code` | Durum | Anlamı | Yapılacak |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | Ayar veya ilke, SSO zorunluluğu ya da MFA ilkesi gibi, kurumsal lisans gerektiriyor. | Lisanslı bir örnek kullanın veya ayarı kapalı bırakın. |
| `IP_NOT_ALLOWED` | 403 | İsteğin IP adresi izin listesinde değil. | İzin verilen bir ağdan bağlanın. |
| `INVALID_CIDR` | 400 | Bir izin listesi girdisi geçerli bir CIDR değil. Mesaj hatalı girdileri listeler. | Girdileri düzeltin ve yeniden kaydedin. |
| `SELF_LOCKOUT` | 400 | İzin listesini kaydetmek çağıranın mevcut IP'sini engelleyecek. | Önce mevcut IP'nizi listeye ekleyin. |

GDPR temizleme rotaları, bir kullanıcı veya ekip yasal bekletme altındayken 409 durumuyla düz bir `CONFLICT` döndürür.

## İstemcilerin almadığı kodlar {#internal-codes}

Bu kodlar sunucu kaynağında günlükler, telemetri veya Fastify'ın kendi hataları için bulunur. İstemci bunları bir yanıt gövdesinde veya iş satırında almaz, bu yüzden istemci mantığını bunlara göre yazmayın.

| `code` | Nereye gider |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Uyarı değerlendiricisi tarafından hata izlemeye bildirilir. Bir uyarı webhook'unun kimlik doğrulama üst bilgisinin şifresi çözülemiyor. |
| `SIEM_DECRYPTION_FAILED` | SIEM iletimi tarafından hata izlemeye bildirilir. SIEM kimlik doğrulama üst bilgisinin şifresi çözülemiyor. |
| `WEBHOOK_DECRYPTION_FAILED` | Hata izlemeye bildirilir. Aynı hataya takılan istek `DECRYPTION_FAILED` ile yanıt verir. |
| `STAGED_DISCARD_FAILED` | Hazırlanmış bir yükleme kaldırılamadığında hata izlemeye bildirilir. |
| `RETENTION_DEADLINE_BACKFILLED` | Depolama TTL taraması, tamamlanmış bir işin eksik ekip saklama süresini doldururken hata izlemeye bildirir. İşin dosyaları bundan sonra ekibin saklama süresini izler. |
| `USERNAME_RACE_EXHAUSTED` | SSO otomatik oluşturma, her yeniden denemede kullanıcı adı yarışını kaybettiğinde ortaya çıkar. Giriş sayfası bunun yerine bir hata gösterir. |
| `ERR_OUT_OF_RANGE` | Geçersiz bir bayt aralığı için nesne depolama okuyucusu tarafından fırlatılır. |
| `ETIMEDOUT` | Bir GDPR dışa aktarımının zaman aşımı hatasına atanır. Dışa aktarım başarısız olur ve yeniden istenebilir. |
| `FST_REQ_FILE_TOO_LARGE` | Sınırı aşan bir yükleme için Fastify'ın kodu. İstemciler `PAYLOAD_TOO_LARGE` ile bir 413 veya rotanın kendi 413 mesajını alır. |
| `TARGET_SIZE_EXCEEDED` | Hedef boyutlu bir sıkıştırma hedefini tutturamadığında fırlatılır. Hatanın durumu veya kodu yoktur, bu yüzden istemciler genel bir hata alır. |
| `OCR_CACHE_PERMISSIONS` | AI veri birimi OCR çalışma zamanı önbelleğini herkes tarafından yazılabilir bıraktığında operasyonel arıza olarak hata izlemeye bildirilir. Kurulum işi, depolama sorununu belirten bir mesajla başarısız olur. |
| `OCR_RUNTIME_UNREACHABLE` | Sunucu OCR çalışma zamanını indirmek için huggingface.co adresine hiç ulaşamadığında operasyonel arıza olarak hata izlemeye bildirilir. Kurulum işi, ağ erişimi, `HTTPS_PROXY`, `HF_ENDPOINT` ve çevrimdışı içe aktarma hakkında bir mesajla başarısız olur. |
