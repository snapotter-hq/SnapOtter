---
description: "SnapOtter için sürüm notları ve sürüm geçmişi. Her sürümde nelerin yeni olduğunu, geliştirildiğini ve düzeltildiğini görün."
i18n_source_hash: 952098c65251
i18n_provenance: machine
i18n_output_hash: e6ef84034a08
i18n_hash_version: 2
---

# Değişiklik günlüğü {#changelog}

## v2.3.0 {#v2-3-0}

SnapOtter, Docker Hub ve GHCR genelinde bir milyon imaj çekmeyi ve GitHub'da 3.000 yıldızı geride bıraktı. Bu çok sayıda kendi kendine barındırılan sunucu demek; bu sürüm, onları çalıştıran herkese teşekkürümüzdür.

Yükseltmeyi geciktirmeyin. 2.3.0, biri yüksek önem derecesinde olmak üzere altı güvenlik bültenini kapatıyor. Ayrıntılar aşağıdaki Güvenlik bölümünde.

Düzeltmelerin ötesinde yeni araçlar da var: bir PDF Multi-Tool sayfa düzenleyicisi, görseller ve PDF'ler için tek tıklamayla boyuta göre sıkıştırma ön ayarları ve Organize PDF'de sürükle bırak ile sayfa sıralama. OCR artık Arapça okuyor ve pdf-to-text, taranmış bir PDF ile karşılaştığında OCR öneriyor. SnapOtter, bir ters vekil sunucunun arkasında `/snapotter` gibi bir alt yol altında çalışabiliyor. Uygulamanın çalışması için artık bir Postgres süper kullanıcısına gerek yok. Kilitlenen yöneticiler komut satırından kurtarma yapabiliyor. Geri kalanı, çoğu sizin bildirdiğiniz sorunlara yönelik yaklaşık 1.400 düzeltme.

> [!IMPORTANT]
> Aşağıdaki altı bültenin tümü 2.2.0'ı etkiliyor, bazıları 2.0.0'a kadar uzanıyor. Bir örneği başka kullanıcılarla paylaşıyorsanız veya kendi ağınızın dışına açıyorsanız yükseltin.

### Güvenlik {#v2-3-0-security}

- **SVG yüklemeleri temizlemeyi atlayabiliyordu (GHSA-9c7h-xjrp-8gh3, yüksek).** Görsel kod çözücünün reddettiği bir SVG, temizlenmek yerine olduğu gibi saklanıp sunuluyordu. Etkilenen: 2.2.0 ve öncesi. @xaferima tarafından bildirildi. (#1211)
- **İş ilerleme akışı, isteyenin kim olduğunu denetlemiyordu (GHSA-ff22-w6x2-fm98, orta).** Artık oturum açmayı ve işin sahipliğini gerektiriyor. Etkilenen: 2.0.0 ile 2.2.0 arası. (#1750)
- **Sonuç indirme bağlantıları özgün yüklemeyi de sunuyordu (GHSA-jgv3-2jc6-f628, orta).** Etkilenen: 2.2.0 ve öncesi. @emirhancatkin tarafından bildirildi. (#3623)
- **Vesikalık fotoğraf ve arka plan efektleri, istemcinin sağladığı bir iş kimliğine güveniyordu (GHSA-3c8g-8v4x-qq9j, orta).** Etkilenen: 2.2.0 ve öncesi. @shaoyuuuuu tarafından bildirildi. (#3623)
- **URL içe aktarma, yükleme ve önizleme, rol ve API anahtarı izin denetimlerini atlıyordu (GHSA-8xxr-g2w8-7f9r, orta).** Etkilenen: 2.2.0 ve öncesi. @nguyenvantiennani tarafından bildirildi. (#3780, #707)
- **SSO zorlaması, break-glass kullanıcı adını ele veriyordu (GHSA-q6fg-vvw9-cr8r, düşük).** Reddedilen yerel oturum açma artık diğer başarısız oturum açmalarla aynı 401 yanıtını alıyor. Etkilenen: 2.0.0 ile 2.2.0 arası. (#2148)
- **Postgres artık süper kullanıcı olarak çalışmıyor.** Uygulama artık yalnızca veri okuyup yazabilen bir rolle bağlanıyor. Migrasyonlar ayrı, isteğe bağlı bir bağlantı kullanıyor. Bkz. Yükseltme notları. (#918)
- **Yamalanan bağımlılıklar**: dompurify ve handlebars override alt sınırları düzeltilmiş sürümlere yükseltildi. (#4247)

### Yeni özellikler {#v2-3-0-new-features}

- **PDF Multi-Tool**: sayfaları yeniden sıralayan, çoğaltan, döndüren ve silen, ayrıca diğer PDF'lerden sayfa çeken bir sayfa düzenleyici. Nihai dosyayı sunucu bir araya getirir. (#1338)
- **Tek tıkla hedef boyuta sıkıştırma**: beş görsel ön ayarı (20, 50, 100, 200, 500 KB) ve beş PDF ön ayarı (100, 200, 500 KB, 1 MB, 2 MB). (#1250, #1377)
- **SnapOtter'ı bir alt yol altında çalıştırın**: `BASE_PATH=/snapotter` değerini ayarlayın; aynı imaj oradan sunulur. Sonuç bağlantıları, çerezler, SSO yönlendirmeleri ve API belgeleri de buna uyar. (#1252, #1324)
- **Arapça OCR**: Arapçayı açıkça seçin veya otomatik modun algılamasına bırakın. Görsel ve PDF OCR için çalışır. (#4130, #4183)
- **pdf-to-text, OCR önerir**: bir PDF'in veya toplu işin tamamının metin katmanı yoksa boş dosya döndürmek yerine OCR önerir. (#4142, #4198)
- **Organize PDF'de sürükle bırak ile sayfa sıralama**, fare ve dokunmatik ile. (#1249, #2601)
- **Çok dosyalı bir çalıştırmadan önce dosyaları yeniden sıralama**: birleştirme, stitch, kolaj ve diğer çok dosyalı araçlar belirlediğiniz sırayı korur. (#756, #757)
- **Toplu ve pipeline çalıştırmalarını iptal etme**; iş sunucuda gerçekten durur. (#807)
- **`snapotter-admin` kurtarma komutları**: `reset-password`, `create-admin`, `unlock-user` ve MFA sıfırlama; web arayüzünden kilitlenen yöneticiler için. (#4016)
- **Oturum açarken MFA kaydı**: MFA zorunlu olduğunda, MFA'sı olmayan kullanıcılar engellenmek yerine onu hemen kurar.
- **Kamera yakalama ve yüklenebilir uygulama**: mobilde doğrudan bir araca fotoğraf çekin ve SnapOtter'ı PWA olarak yükleyin. (#773)
- **Düzenleyicinin Tuval Boyutu iletişim kutusunda saydam dolgu.** (#4111)
- **Yöneticiler için güncelleme bildirimleri**: daha yeni bir SnapOtter çıktığında yöneticiler, sürüm notlarına bağlantı veren, kapatılabilir bir bildirim görür. Denetim mevcut analitik bağlantısı üzerinden çalışır, bu yüzden analitik kapalıyken o da kapalıdır.

### İyileştirmeler {#v2-3-0-improvements}

- **Arka plan kaldırma tekrar çalıştırmalarda daha hızlı**: model her seferinde yeniden yüklenmek yerine istekler arasında bellekte kalır. (#4144)
- **Toplu yüklemeler çok daha az bellek kullanıyor**: her dosya RAM'de beklemek yerine geçici diske gidiyor ve tek tek işleniyor. (#2687)
- **AI paket kurulumları temiz biçimde başarısız olur ve geri alınır**; yarım kurulmuş bir venv bırakmaz. Proxmox LXC arka plan kaldırma kurulumları yeniden çalışıyor ve düşük bellekli ana makineler bir iş başlamadan önce makul CPU sınırları alıyor. (#2628, #2597, #2526, #2546)
- **GPU algılama daha güvenilir**: CUDA sürücü üzerinden algılanıyor, RTX 50 serisi kartlar başarısız olmak yerine CPU'ya geri dönüyor ve donanım video kodlayıcıları kullanılmadan önce deneme çalıştırmasından geçiyor. (#4225, #4075, #3980, #3983)
- **`MAX_WORKER_THREADS` artık çalışıyor**. Ayrıştırılıyordu ama hiç uygulanmıyordu. (#3249)
- **Uzun süren araçlar uzun zaman aşımını alıyor**: pdf-to-word, compress-pdf, convert-document ve içeriğe duyarlı yeniden boyutlandırma büyük dosyalarda artık erken zaman aşımına uğramıyor. (#3276)
- **Compress PDF taramaları okunaklı tutuyor** ve hedef boyuta ulaşılamadığında okunamaz bir dosya üretmek yerine bunu söylüyor. (#4112)
- **Başarısız oturum açmalar kullanıcı adı başına sınırlanıyor**: on beş dakikada ondan fazlası `Retry-After` ile birlikte 429 alır. (#827)
- **Hatalar neyin ters gittiğini söylüyor**: eksik ikili dosyalar, depolama arızaları, bellek yetersizliği nedeniyle sonlandırmalar ve yükleme sınırları artık çıplak bir 500 veya 422 yerine özel mesajlar alıyor.
- **Denetim günlüğü araç, toplu iş ve pipeline çalıştırmalarını kapsıyor**; kullanıcı, rol, takım ve GDPR olayları kimin kime ne yaptığını kaydediyor. (#3991, #3984)
- **Hepsi bir arada konteyner, bozuk bir ilk açılışta** sonsuza kadar yeniden başlamak yerine duruyor; gömülü Postgres ve Redis'in başlatma süre sınırları var. (#3008, #1130)
- **Tarihler ve çoğul biçimler dilinize uyuyor** ve kalan son sabit kodlu İngilizce dizeler çevrildi.
- **Mobil ve düzenleyici cilası**: telefonlarda kaydırıcı, Sign PDF ve kırpma düzenleri, dokunmatik sürükleme, daha hızlı piksel fırçaları ve geri alma ile otomatik kaydetmede Levels ve Curves.

### Hata düzeltmeleri {#v2-3-0-bug-fixes}

- **Adjust Colors ayarları yanlış birleştiriyordu**: sıcaklık, doygunluk, ton, kontrast ve sepya üst üste binmek yerine birbirini eziyordu. (#3153, #3120, #3469)
- **Pixelate pikselleştirmiyordu** ve PNG çıktısı görsel araçlarında sessizce palet indirgemesine uğruyordu. (#709, #716)
- **Animasyonlu GIF ve WebP, birçok araçta kare kaybediyordu**; GIF paletleri ve saydamlığı yanlış çıkıyordu. (#1184, #1225, #3407, #2573)
- **Döndürülen yüklemeler kalite kaybediyordu**: otomatik yönlendirme kayıpsız kodlamayı, saydamlığı ve 16 bit derinliği atıyordu. Animasyonlu WebP artık her kareyi döndürüyor. (#2384, #2529)
- **Saydamlığa sahip TIFF'ler, AV1 HEIF dosyaları ve birkaç RAW biçimi** başarısız oluyor veya alfa kanalını kaybediyordu. (#2609, #2572, #1120)
- **Düzenleyici tuvalini yeniden boyutlandırmak görseli ölçekliyordu**; etrafına boşluk eklemek yerine. (#2081)
- **Çıktı dosya adları bozuluyordu**: `.jpeg` ve `.tif` başka bir şeye dönüşüyordu; nokta ile başlayan dosyalar veya uzantısını tekrar eden adlar bozuluyordu. (#3495, #3382)
- **Kitaplık otomatik kaydı depolama kotasını yok sayıyordu** ve depolama sayaçları negatife düşebiliyordu. (#2389, #2585)
- **Yeniden başlatmadan sonra takılı kalan işler** artık açılışta sonlandırılıyor; sonsuza kadar "işleniyor" göstermiyor. (#3219, #3193)
- **OIDC oturum açma her yeni kullanıcıyı "admin" olarak adlandırıyordu** ve iOS Safari oturum açmaları başarılı olduktan sonra bir hata sayfasında bitiyordu. (#862, #4021)
- **Devre dışı bırakılmış parola kuralları** kullanıcı oluşturulurken yine de uygulanıyordu. (#1028)
- **Hasarlı PDF'ler başarısız olmadan önce 30 saniye takılıyordu.** (#920)
- **AI paket disk denetimi** tek bir paketi kurmak için yaklaşık 18 GB istiyordu. (#1248)
- **Compress Video, değişken kare hızlı ekran kayıtlarında başarısız oluyordu.** (#2427)
- **Toplu arka plan kaldırma, tarayıcı isteği yeniden denediğinde biten sonuçları kaybediyordu.** (#2015)
- **Ayarlardaki sayı alanları yazarken temizlenemiyordu.** (#1449)
- **Analitiği kapatmak, kuyruktaki olayları** yaklaşık 30 saniye sonra gönderilmek üzere bırakıyordu. Artık devre dışı bıraktığınızda atılıyorlar. (#4270)

### Yükseltme notları {#v2-3-0-upgrade-notes}

Migrasyonlar başlatmada kendiliğinden çalışır. Herhangi bir SQL çalıştırmanız gerekmez.

- **Veritabanı rolleri.** Standart Compose dosyası artık uygulamaya yalnızca veri okuyup yazabilen bir rol (`DATABASE_URL`) ve yalnızca açılışta migrasyonlar ile yetkiler için kullanılan ayrı bir yetkili bağlantı (`DATABASE_MIGRATION_URL`) veriyor. Mevcut bir Compose dosyası eskisi gibi çalışmaya devam eder: `DATABASE_MIGRATION_URL` ayarsız bırakın, SnapOtter tek rolle çalışır. Yerel olmayan bir dağıtım için `POSTGRES_PASSWORD` ile birlikte `POSTGRES_APP_PASSWORD` da ayarlayın.
- **Daha sıkı başlatma denetimleri.** Bunlar eskiden daha sonra veya sessizce başarısız oluyordu. Artık konteyneri, değişkenin adını veren bir mesajla durduruyorlar: desteklenmeyen bir `DEFAULT_LOCALE` (`de_DE` değil, `de` gibi desteklenen bir kod kullanın), SSO açıkken hatalı biçimli `SAML_IDP_SSO_URL`, `SAML_CALLBACK_URL` veya `OIDC_ISSUER_URL`, geçersiz bir `TRUST_PROXY` listesi, hatalı bir `BASE_PATH` ve yazılamayan bir `LOG_DIR`.
- **`TRUST_PROXY` artık atlama sayısı almıyor.** `TRUST_PROXY=2` gibi bir sayı artık hiçbir vekile güvenmeyi sessizce seçmek yerine konteyneri başlatmada durduruyor. Bunu vekil adreslerine veya adlandırılmış aralıklara ayarlayın (varsayılan `loopback,linklocal,uniquelocal`), SnapOtter'ın önünde vekil yoksa `false`, önünüzde genel bir adreste kontrol ettiğiniz bir vekil varsa yalnızca `true`. (#998)
- **`MAX_WORKER_THREADS` artık etkili oluyor.** Bunu ayarlayıp daha önce bir değişiklik görmediyseniz artık göreceksiniz.
- **API durum kodları.** Motor ve depolama arızaları 503 `ENGINE_UNAVAILABLE` döndürüyor (toplu uç noktalar eskiden 422 döndürüyordu). Sınırı aşan yüklemeler 413 döndürüyor (eskiden 400). Hatalı biçimli `clientJobId` 400, yeniden kullanılmış olanı 409 döndürüyor (eskiden 500). Kendi pipeline toplu işinizi yeniden oynatmak 202 döndürüyor. `targetSizeKb` olmadan `mode=targetSize` 400 döndürüyor. SSO zorlaması altında reddedilen yerel oturum açma, 403 `SSO_ENFORCED` yerine 401 döndürüyor. Sınırlanan oturum açmalar 429 `LOGIN_THROTTLED` döndürüyor. remove-background sonucu artık `originalUrl` içermiyor.
- **Yeni isteğe bağlı değişkenler**: `BASE_PATH`, `DATABASE_MIGRATION_URL`, `GDPR_EXPORT_TIMEOUT_MS` (varsayılan 15 dakika, `0` kapatır), `EMBEDDED_REDIS_TIMEOUT_S` (180) ve `EMBEDDED_POSTGRES_TIMEOUT_S` (600).
- **Compose dosyaları sürümle birlikte geliyor.** `docker-compose.yml` ve `docker-compose-gpu.yml` bu sürüme eklenmiştir; bunları doğrudan sürüm sayfasından indirebilirsiniz.

### Teşekkürler {#v2-3-0-acknowledgements}

Bir milyon çekme, hata bildiren, düzeltme gönderen ve neyin eksik olduğunu söyleyen çok sayıda insan demek. Bu sürüm çoğunlukla onların emeği.

Kod ve katkılar:

- **@zakka258** ❤️: Bu sürümün en büyük iki özelliği olan PDF Multi-Tool sayfa düzenleyicisini ve alt yol dağıtımını, alt yol altında kimlik doğrulama ve SSO testleriyle birlikte geliştirdi. (#1338, #1252, #1324, #1295)
- **@akshat-lakhera** ❤️: Tek tıkla boyuta göre sıkıştırma görsel ön ayarlarını geliştirdi, önizleme eşzamanlılığını ve temizliğini düzeltti ve engellenmiş tarayıcı depolamasının oturum açma döndürücüsünü kilitlemesini durdurdu. (#1250, #1368, #2359)
- **@ChrisCreatesNet** ❤️: Önce Discussions'ta istedikleri, Organize PDF için sürükle bırak sayfa yeniden sıralamasını ekledi. (#1249, #965)
- **@drakeo338** ❤️: Tüm yığın genelinde on düzeltme yaptı; bunların arasında biçimi ve kaliteyi koruyan otomatik yönlendirme, tek işlemde oluşturulan SCIM grupları, cgroup v2 altında AI kurulumları ve artık 422 olarak maskelenmeyen 5xx hataları var. (#1229, #2014, #1638, #1667)
- **@SuranaSanyam** ❤️: Düzenleyiciye saydam tuval dolgusu ekledi, eski kalmış Compress PDF hedef boyut kararlarını düzeltti ve kısmi takım güncellemelerine izin verdi. (#4111, #4112, #1906, #2366, #2367)
- **@thejdubb02** ❤️: Kendi kendine barındırılan örneklerin ısı haritası verisi göndermesini durdurdu, `TRUST_PROXY` değerini çökmek yerine başlatmada doğruladı ve SCIM grup adı ile qpdf zaman aşımı işlemesini düzeltti. (#1051, #1052, #1053, #993, #994)
- **@88subarno88** ❤️: Hatalı biçimli iş kimlikleri ve multipart içe aktarmaları için birkaç 500 hatasını uygun 400 ve 409 yanıtlarına çevirdi ve Ayarlar'daki sayı alanlarının temizlenmesini düzeltti. (#1486, #1556, #1603, #1449)
- **@harshoutoftokens** ❤️: Kod çözücüsünü pakete dahil ederek barkod okumayı çevrimdışı çalışır hale getirdi, girdiyi gösteren medya önizlemelerini düzeltti ve biçim aramasını iyileştirdi. (#1401, #1512, #1388)
- **@darklabs9** ❤️: Compress Video'nun değişken kare hızlı ekran kayıtlarında başarısız olmasını bildirdi ve düzeltti. (#2426, #2427)
- **@dvd233** ❤️: Kod çözücünün desteklediği her kamera RAW biçimini erişilebilir kıldı ve favicon araçlarının ICO aramalarında görünmesini sağladı. (#1120, #1121)
- **@bercedev** ❤️: Gövdesi uzantısını tekrar eden dosya adlarını düzeltti ve AI'ın gerçekte üzerinde çalıştığı aygıtı bildirmesini sağladı. (#3382, #3613)
- **@pamod-madubashana** ❤️: Yalnızca İngilizce kalmış son MFA başlığını çevirdi ve kullanılmayan ilerleme dizelerini bağladı. (#1228, #1227)
- **@mvanhorn** ❤️: SAML oturum açmada yinelenen kullanıcı adı atamasını düzeltti. (#2640)
- **@peremunoz** ❤️: Barkod üretiminin depolama ve bellek arızalarını "Geçersiz metin" olarak gizlemesini durdurdu. (#4057)
- **@mayuriphad** ❤️: Hatalı biçimli saklanmış bir uyarı kimlik doğrulama başlığındaki çökmeyi düzeltti. (#3080)
- **@DevShoaib78** ❤️: Düzenleyicide çokgen kement aracının kapatılmasını düzeltti. (#1207)
- **@dltsum** ❤️: İlerleme göstergelerini ortak mesaj kataloğuna taşıdı. (#1262)
- **@albanobattistella** ❤️: Çeviri düzeltmeleri. (#1024)
- **@shoaibyazdani** ❤️: macOS görsel referanslarını yeniden üretti. (#2475)

Güvenlik bildirimleri:

- **@xaferima** ❤️: Kod çözücünün reddettiği SVG'lerin temizlemeyi atladığını buldu ve etkisini bizimle birlikte çözümledi. (GHSA-9c7h-xjrp-8gh3, #1211)
- **@emirhancatkin** ❤️: Sonuç bağlantılarının özgün yüklemeyi de sunduğunu buldu. (GHSA-jgv3-2jc6-f628, #3623)
- **@shaoyuuuuu** ❤️: Vesikalık fotoğraf ve arka plan efektlerinin istemcinin sağladığı bir iş kimliğine güvendiğini buldu. (GHSA-3c8g-8v4x-qq9j, #3623)
- **@nguyenvantiennani** ❤️: URL içe aktarmanın izin denetimlerini atladığını buldu. (GHSA-8xxr-g2w8-7f9r, #3780)
- **tonghuaroot** ❤️: SSRF adres denetimlerinin IPv6 ile atlatılabildiğini, çalışan kavram kanıtlarıyla bildirdi. Düzeltmeler 2.0.0'da yayımlandı ve bu teşekkür gecikmiş bir teşekkürdür. (#287)

Hata raporları:

- **@kabo** ❤️: Örnek `docker-compose.yml` çalışmıyordu. (#1027)
- **@xromen** ❤️: Hasarlı PDF'lerin 30 saniyelik qpdf zaman aşımına kadar takılı kalması. (#920)
- **@snmabaur** ❤️: OIDC oturum açmanın her profil adını "admin" yapması. (#862)
- **@CodecNomad** ❤️: Blur aracının görseli çoğaltması. (#829)
- **@ohora0923** ❤️ ve **@Alexis-VS-CSharp** ❤️: Pixelate'in çalışmaması. (#678, #775)
- **@mptpro** ❤️: Arka plan kaldırma AI indirmesinin başarısız olması. (#714)
- **@dominic427** ❤️: Düzenleyici tuvalini yeniden boyutlandırmanın görseli genişletmek yerine ölçeklemesi. (#2016)
- **@CodeByToast** ❤️: Ayarlar'daki sayı alanlarının temizlenememesi. (#1186)
- **@gioxx** ❤️: AI paket disk denetiminin tek bir paket için yaklaşık 18 GB istemesi. (#1248)
- **@rekcodocker** ❤️ ve **@madmike970** ❤️: AI paket kurulumlarının Proxmox LXC üzerinde başarısız olması; sorunu daraltmaya yardımcı olan konteyner ayrıntılarıyla birlikte. (#1030, #352)
- **@wxf26054** ❤️: Devre dışı bırakılmış parola kurallarının kullanıcı oluşturulurken yine de uygulanması. (#1028)
- **@ersil** ❤️: iOS Safari'nin OIDC geri çağrısını iki kez istemesi ve başarılı bir oturum açmadan sonra hata sayfasına düşmesi. (#4021)
- **@casi-3** ❤️: Toplu arka plan kaldırmanın, tarayıcı isteği yeniden oynattığında biten sonuçları kaybetmesi; kesin bir teşhisle birlikte. (#2015)
- **@killervette42** ❤️: unRaid üzerinde Blackwell GPU hatası; bu, RTX 50 serisi CPU geri dönüşüne yol açtı. (#120, #4075)

Özellik istekleri ve geri bildirimler:

- **@photoevents** ❤️: Arka plan kaldırmanın modeli yüklemeye yaklaşık 11 saniye, çıkarıma 1 saniye harcadığını ölçtü, oturumları önbelleğe almayı önerdi ve kendi önbelleğini çalıştırırken öğrendiklerini paylaştı. Bu, bu sürümdeki oturum önbelleği oldu. (#768, #776, #4144)
- **@benbou8231** ❤️: İçe aktarılan dosyaların çok dosyalı araçlarda ters sırayla yerleştiğini belirtti; bu, çalıştırmadan önce yeniden sıralamaya yol açtı. (#729, #756)
- **@cf3901646** ❤️: Gürültülü bir üretim hatasını Postgres hata sınıfı 58'e kadar izledi ve düzeltmeyi önerdi. İmzalı bir CLA olmadan PR'larını birleştiremedik, bu yüzden aynı düzeltmeyi kendimiz yazdık. (#4210, #4253)
- **@chiliec** ❤️: Başarısız bir otomatik yönlendirmenin sessizce yutulduğunu ve kurulum ilerlemesinin çeviri kataloğunu yok saydığını fark etti. Her iki öneri de bakımcı PR'larıyla yayımlandı. (#1266, #1416, #1258, #1262)
- **@wahajahmed010** ❤️: Eşzamanlı SCIM isteklerinin lisans konusunda anlaşamamasının çözümü olarak, enterprise modül içe aktarımını tek uçuşa indirmeyi önerdi. (#1267, #1283)
- **@chenzeyan54-commits** ❤️: Yapılandırma rehberinin motor ikili dosyası geçersiz kılmalarından veya `SNAPOTTER_HW_ACCEL` değişkeninden hiç bahsetmediğini belirtti; ikisi de artık belgelendi. (#1312, #1696)
- **@aron-intframe** ❤️: Yeni bir klonda exiftool hata işleme boşluğunu yeniden üretti ve geçici yol yarışının sorunda anlatılandan daha kötü olduğunu buldu. (#3458)

Bunları Discord ve e-posta üzerinden bildiren, adlarını kaydetmediğimiz topluluk üyelerine de teşekkür ederiz.

[GitHub'da tam fark](https://github.com/snapotter-hq/SnapOtter/compare/v2.2.0...v2.3.0)

---

## v2.2.0 {#v2-2-0}

2.2'nin büyük kısmı sıkılaştırmadır. Yetkisi devredilmiş bir `users:manage` rolüne sahip yönetici olmayan biri bir örneği ele geçirebiliyordu ve her araç uç noktasının izin denetiminin eksik olduğu ortaya çıktı. Birden fazla kullanıcı çalıştırıyorsanız yükseltin.

Geri kalanı, kendi kendine barındırmanın uzun kuyruğu: başlayıp hiç bitmeyen indirmeler, ikinci bir dosya eklediğiniz anda bozulan ön ayarlar, Postgres hâlâ ayağa kalkarken çökme döngüsüne giren konteynerler. İki yeni araç da geldi. Belgeler ve web sitesi artık 21 dile çevrildi ve arayüz sonunda WCAG AA kontrastını geçiyor.

> [!IMPORTANT]
> Özel bir rol aracılığıyla yönetici olmayan birine `users:manage` yetkisi verdiyseniz, bu rol 2.0.0 ile 2.1.0 arasında yönetici hesaplarını ele geçirebiliyordu. Ayrıntılar Güvenlik bölümünde.

### Güvenlik {#v2-2-0-security}

- **Devredilmiş bir `users:manage` rolü üzerinden yetki yükseltme (GHSA-9xgh-95qh-2x7h).** Özel bir rol aracılığıyla `users:manage` yetkisine sahip yönetici olmayan biri, daha yetkili bir hesabın (yerleşik bir yönetici dahil) parolasını sıfırlayabiliyor veya hesabı silebiliyor ve örneği ele geçirebiliyordu. Parola sıfırlama ve hesap silme artık çağıranın hedef üzerindeki yetkisini doğruluyor; böylece devredilmiş bir rol kendi seviyesinin üstüne erişemiyor. Etkilenen: 2.0.0 ile 2.1.0 arası. 李春来 (Chunlai Li) tarafından bildirildi. (#616)
- **Her araç uç noktası artık denetleniyor.** Araç erişimi rota rota uygulanıyordu; bu yüzden elle yazılmış 45 rotanın hepsinin aynı çağrıyı hatırlaması gerekiyordu ve hiçbiri hatırlamadı. `tools:use` yetkisi olmayan bir rol yine de image-to-pdf, erase-object, upscale, sign-pdf ve diğerlerini çalıştırabiliyordu. Denetim artık eşleşen rotadan beslenen tek bir preHandler içinde yaşıyor; bu nedenle alt yolları ve sonradan eklenecek her rotayı kapsıyor. (#646)
- **Docker kurulumlarında hız sınırlaması atlatılabiliyordu.** İmaj `TRUST_PROXY=true` ile geliyordu; bu yüzden istemci IP'si bir istek başlığından alınıyordu ve taklit edilmiş bir `X-Forwarded-For` oturum açma sınırlayıcısını geçiyordu. Varsayılan artık özel ağ güven listesi. (#649)
- **Ayar yazmaları ayar başına denetleniyor**, kapıda bir kez değil; ayrıca yapılandırma içe aktarma artık işlemsel, böylece reddedilen bir anahtar yapılandırmanın yarısının uygulanmış kalmasına yol açamıyor. (#618)
- **Kitaplık dosya adları depolama köklerinden çıkamaz.** Kötü niyetli bir 1.x SQLite içe aktarmasının olduğu gibi kopyaladığı, özenle hazırlanmış bir saklı ad, dosyalar dizininin dışındaki dosyaları okuyabilir veya silebilirdi. Yalnızca bir operatör, saldırganın sağladığı bir 1.x SQLite veritabanını içe aktardıktan sonra erişilebilir; saklı adın seçilebildiği tek yol budur. @Alpastx tarafından bildirildi. (GHSA-55w2-8cqf-w969, #600)
- **İş iptali sahipliği zorunlu kılıyor**, böylece kimliği doğrulanmış bir kullanıcı artık başka bir kullanıcının işini kimliğiyle iptal edemez. @Alpastx tarafından bildirildi. (GHSA-wqxf-gj2p-689x, #599)
- **Tüm 2.0 ağacının yeniden denetimi hâlâ açık olanları yakaladı**: yakalanmış bir SAML iddiası yeniden oynatılabiliyordu, bir MFA doğrulaması istenen sayıda yanlış koddan sonra bile geçerli kalıyordu, istek başına API anahtarı araması tam tablo taramasıydı, `MAX_WORKSPACE_SIZE_GB` ölü yapılandırmaydı ve SVG temizleyici tırnaksız `javascript:` href'lerine izin veriyordu. (#620)
- **Açıklanmış dokuz CVE yamalandı**: geçişli olarak fast-uri, svgo, sharp ve tar (#619), ayrıca Pillow 12.3.0 (#517). arm64 üzerinde RAW kod çözme artık yamasız bir sistem kopyasına bağlanmak yerine LibRaw 0.22.2'yi kaynaktan derliyor. (#649)

### Yeni özellikler {#v2-2-0-new-features}

- **Rounded Crop**: köşe yarıçapı denetimli, yuvarlatılmış kare ve iOS tarzı squircle maskeleri. Favicon'lar ve uygulama simgeleri için yapıldı. (#602)
- **Remove GIF Background**: animasyonlu bir GIF, WebP veya APNG'nin arka planını kare kare kaldırın ve saydam bir animasyon geri alın. (#502)
- **Object Eraser kement ve Yüksek Kalite modu**: her pikseli boyamak yerine serbest biçimli bir döngü sürükleyin ve daha temiz geniş alan dolguları için isteğe bağlı olarak bir difüzyon inpainting paketi kurun. (#503, #566)
- **Yeni olarak kaydet veya üzerine yaz.** Bir kitaplık dosyasını düzenlemek eskiden orijinalin yerini sessizce alıyordu. Artık düzenleme başına seçiyorsunuz ve varsayılan orijinali koruyor. (#564, #577)
- **Resize'da en boy oranı ön ayarları.** 1:1, 4:3 veya 16:9 seçin; iki boyut ölçeği büyütmeden kilitli kalır. (#530)
- **İki katmanlı OCR**: hızlı katman imajın içine gömülüdür ve indirme olmadan çevrimdışı çalışır; daha doğru bir çalışma zamanı ise istek üzerine kurulur. (#519)
- **Aramak için herhangi bir yere yazın.** Panoda veya ana sayfada yazmaya başlayın, metin arama kutusuna düşer. (#644)
- **21 dilde belgeler ve web sitesi**: belge sitesi, açılış sayfaları ve API referansı artık uygulama arayüzüne katılarak çevrildi. Yeni bir düşük kaynaklı dağıtım rehberi Raspberry Pi ve 2 GB'lık makineleri kapsıyor. (#548)
- **Daha net araç adları**: 18 belirsiz ad artık kendini nitelendiriyor, böylece "Compress" "Compress Image" oldu. Araç kimlikleri ve rotalar değişmedi, bu yüzden yer imlerine eklediğiniz hiçbir şey bozulmaz. (#520)

### İyileştirmeler {#v2-2-0-improvements}

- **Arayüz genelinde WCAG AA kontrastı**: palet yeniden ayarlandı; canlı turuncu dolgularda kalırken metin ve etiketler erişilebilir metin rengi belirteçlerini kullanıyor ve 57 odak göstergesinin tümü 3:1 metin dışı eşiğini geçiyor. (#567, #574)
- **Upscale ve arka plan kaldırma artık donmuş görünmüyor**: ilerleme çubuğu %30'da park etmek yerine çıkarım sırasında ilerliyor ve iki araç da yalnızca CPU kullanan bir ana makinenin çok daha yavaş olduğu konusunda uyarıyor. (#605, #608)
- **Zaman aşımı mesajları gerçek nedeni söylüyor** ve yüklemeyi suçlamak yerine yalnızca CPU kullanan ana makineleri hesaba katıyor. (#596)
- **SnapOtter başlatmada Postgres ve Redis'i bekliyor**, çökme döngüsüne girmek yerine; Compose'ta ve hepsi bir arada imajda aynı şekilde. Bir Proxmox LXC kurulumu bundan önce 76 kez yeniden başlıyordu. (#537, #595)
- **İndirmeler ters vekil sunucudan sağ çıkıyor**: SnapOtter, nginx ve uyumlu vekillerden dosya yanıtlarını arabelleğe almamalarını istiyor; kendi kendine barındırılan bir indirmenin başlayıp hiç bitmemesinin olağan nedeni budur. (#604, #607)
- **Compress PDF hedef boyuta yakın bitiyor** ve hedefe ulaşılamadığında bunu dürüstçe söylüyor. (#522)
- **Mobil araç denetimleri erişilebilir kalıyor**, artık uygulama kabukları dinamik görünüm alanına göre boyutlanıyor. (#559)
- **Convert Audio bir örnekleme hızı ayarı sunuyor.** (#561)
- **Yöneticiler minimum parola uzunluğunu gevşetebiliyor**, güvenilir bir LAN örneği için 1'e kadar. (#543)
- **MFA kendi kendine hizmet**, politika kilitlenmesi kapatıldı ve OIDC veya SAML ile oturum açmalar tam engelleme yerine gerçek bir MFA doğrulaması alıyor. (#531, #536)
- **Çıplak bir `Error: Error` artık nedenini söylüyor.** Sharp kodlama hataları, AI sidecar çıkışları, JSON olmayan belge sidecar çıktısı ve arka plan kaldırma hataları eskiden nedeni silinmiş olarak geliyordu. (#532, #534, #535, #538, #612)
- **Yardım iletişim kutusu çevrildi.** Kısayol etiketleri ve başlangıç metni sabit kodlu İngilizceydi; tamamlanmış çeviriler ise 21 yerel ayar dosyasının hepsinde kullanılmadan duruyordu. (#647)

### Hata düzeltmeleri {#v2-2-0-bug-fixes}

- **iPhone HEIC dosyaları reddediliyordu**; bunları işleyen kod çözücüye ulaşmadan okunamaz olarak değerlendiriliyordu. (#631)
- **Dönüştürme ön ayarları ikinci dosyada başarısız oluyordu**: jpg-to-pdf ve kardeşi image-to-pdf ön ayarları ile pdf-to-png, pdf-to-jpg ve pdf-to-tiff, iki dosya yüklediğinizde `Tool not found` döndürüyordu. (#633, #643)
- **PDF dönüştürme ön ayarları indirme düğmesini kaybediyordu.** (#629)
- **Sınırsız işleme zaman aşımı dikkate alınmıyordu** ve takılan ilerleme akışları artık arayüzü bekler halde bırakmak yerine toparlanıyor. (#638)
- **Saklanan bir dosya kayıtlı uzunluğundan kısa çıktığında indirmeler başarısız olmak yerine takılıyordu.** (#617)
- **PDF sayfa araçları kısa ve şifreli dosyalarda başarısız oluyordu**: Remove Pages, altı sayfadan kısa hiçbir belgede bulunmayan bir sayfa aralığını varsayılan alıyordu ve parola korumalı PDF'ler worker içinde anlaşılmaz biçimde başarısız oluyordu. (#594)
- **PDF to Text, taranmış PDF'ler için sessizce boş dosya döndürüyordu.** Artık sizi OCR'a yönlendiriyor ve metni UTF-8 olarak sunuyor. (#603)
- **PDF to Word renkli metin bloklarını kaybediyor** ve sayfaya bölüyordu. (#500)
- **Object Eraser hayalet kalıntılar bırakıyor** ve yüksek çözünürlüklü görsellerde küçük nesneleri bulanıklaştırıyordu. (#501)
- **Stabilize Video, faststart olmadan oynatılamayan çıktı yazıyordu.** (#593)
- **Görsel düzenleyici onarımları**: döndürme, çevirme, yeniden boyutlandırma, levels, curves, filtreler ve katman kilidi. (#597)
- **Sign PDF boş bir tuval gösteriyordu**; bir PDF'in neden yüklenemediğini bildirmek yerine. (#545)
- **Dosya kitaplığı 0x0 boyut kaydediyor** ve HEIC, RAW ve PSD yüklemeleri için önizlemeleri atlıyordu. (#636, #637)
- **Birden fazla AI paketi kurmak** paylaşılan sanal ortamı çok sürümlü bırakıyor ve üç aracı sessizce bozuyordu. (#649)
- **JXL'e 1 ile 4 arası kalitede dönüştürmek 500 döndürüyordu** ve eksik bir ffmpeg size bozuk bir yükleme olarak bildiriliyordu. (#649)
- **Geçici bir Postgres kesintisi biten işleri sahipsiz bırakıyordu**; çıktı diskte kalıyor ama onu gösteren bir satır olmuyordu. Bir uzlaştırıcı artık bu işi atmak yerine sahipleniyor. (#649)
- **Adresi değişen bir Redis uç noktası her tüketiciyi kilitliyordu**, sağlık denetimleri ise hâlâ 200 yanıtlıyordu. (#649)
- **Web sitesi ve belge düzeltmeleri**: yerelleştirilmiş bağlantılar artık `#` parçalarını düşürmüyor veya `zh-CN` değerini küçük harfe çevirmiyor, belge gezinmesi tabletlerde görünüm alanı içinde kalıyor ve iki site de artık tarayıcınızdan GitHub API'sini çağırmıyor. (#516, #562, #570, #560)

### Yükseltme notları {#v2-2-0-upgrade-notes}

Taşınacak bir şey yok, ancak yayımlanan iki varsayılan değişti:

- **`TRUST_PROXY` artık varsayılan olarak `loopback,linklocal,uniquelocal`** ve her eşe güvenmiyor. Docker köprüsü ve Compose ağları bu aralığın içinde yer alır, bu yüzden çoğu kurulumun değişiklik yapmasına gerek yok. Ters vekil sunucunuz SnapOtter'a genel bir adresten ulaşıyorsa `TRUST_PROXY` değerini açıkça ayarlayın; aksi halde hız sınırlama ve denetim günlükleri her isteği vekile atfeder.
- **`MAX_AI_JOBS_PER_USER` varsayılan olarak 5**, kullanıcı başına uçuştaki tek dosyalı AI işi sayısı. Toplu ve pipeline AI çalıştırmaları sınırsız kalır.

Yeni isteğe bağlı ayarlar: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (varsayılan olarak kapalı) ve `GIF_BG_MAX_FRAMES`.

### Teşekkürler {#v2-2-0-acknowledgements}

Bu sürümün önemli bir kısmı, bir başkasının hata raporuyla başladı.

Kod ve katkılar:

- **@mvanhorn** ❤️: remove-background zaman aşımı hatasını, çıplak bir zaman aşımı yerine ne yapılması gerektiğini söyleyen bir mesaja çevirdi. (#518, #494)
- **@EuanTop** ❤️: Senkron rotanın standart araç sonucu sözleşmesini döndürmesini sağlayarak PDF dönüştürme ön ayar sayfalarındaki indirme eylemini geri getirdi. (#629, #623)
- **@harshjainnn** ❤️: Başlayıp hiç bitmeyen indirmeyi teşhis etti ve düzeltmenin üzerine kurulduğu soket sıfırlama yönünü önerdi. (#617, #590)

Güvenlik bildirimleri:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Devredilmiş `users:manage` rolü üzerinden yetki yükseltmeyi, kaynaktan çıkışa tam bir analiz ve çalışan bir istismar zinciriyle birlikte özel olarak bildirdi. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): İş iptalinde kimliği doğrulanmış bir IDOR'u ve kötü niyetli bir 1.x SQLite içe aktarmasından sonra erişilebilen kitaplık saklı dosya adlarında bir yol geçişini (path traversal), her biri için çalışan bir kavram kanıtıyla birlikte bildirdi. (#599, #600)

Hata raporları:

- **@riz467** ❤️: Gerçek iPhone HEIC dosyalarının doğrulamada reddedilmesi; kök neden raporda çözümlenmişti. (#622)
- **@coupej** ❤️: PDF ön ayar sayfalarının sonsuza kadar takılması ve jpg-to-pdf'in ikinci bir dosya eklenir eklenmez başarısız olması. İki ayrı hata, doğru biçimde ayrıştırılmış. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` sınırsız olarak belgelenmişti ama beş dakikada sınırlanıyordu. (#630)
- **@bezibaerchen** ❤️: Convert Audio, kendi açıklamasının vaat ettiği örnekleme hızı ayarını gizliyordu. (#558)
- **@hell-toupee** ❤️: Doğru OCR paketinin `libpaddle` hatasıyla kurulamaması. (#505)
- **@Michael1260** ❤️ ve **@And-CSH** ❤️: Bu OCR kurulum hatasını bağımsız olarak doğruladı ve elle çıkarmanın çalışırken uygulama içi kurucunun çalışmadığını saptadı; bu da hatayı kurucuya indirgedi. (#505)
- **@TomErnst1972** ❤️: MFA zorunlu politikasını etkinleştirmenin bir yöneticiyi kendi örneğinin dışında bırakması. (#515)
- **@thokich** ❤️: Nesne silmenin bulanık, kullanılamaz dolgular üretmesi; bu hem HD inpainting yeniden yazımını hem de isteğe bağlı yüksek kaliteli paketi tetikledi. (#141)
- **@Hennie-git** ❤️: Bir Proxmox LXC kurulumunun henüz bağlantı kabul etmeyen bir Postgres karşısında 76 kez yeniden başlaması. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Bu raporu gerçek zamanlı olarak değerlendirdi ve başlatma düzeltmesinin üzerine kurulduğu teşhisi yaptı. (#537)

Özellik istekleri ve geri bildirimler:

- **@LECOQQ** ❤️: Bir ev sunucusu kurulumunda parola karmaşıklığının gevşetilmesini istedi. (#136)
- **@killervette42** ❤️: Artık Unraid CA mağazasında yayımlanan bir Unraid Community App istedi. (#96)
- **@alienatedsec** ❤️: GPU'dan CPU'ya geri dönüş düzeltmesinin kapalı bir sorunun içinde gömülü kaldığını ve bulunamadığını belirtti; bu yüzden artık dağıtım belgelerinde. (#490, #587)
- **@neilp316** ❤️: RTX 5060 üzerindeki Blackwell GPU hatasını doğruladı ve çalışan bir CUDA 12.8 yükseltme yolu çıkardı. (#120)
- **@Roiki11** ❤️: Kutu dışı AI hesaplaması için HTTP dosya aktarımı yerine yol referanslı paylaşımlı depolamayı savundu. (#189)

Bunları Discord ve e-posta üzerinden bildiren, adlarını kaydetmediğimiz topluluk üyelerine de teşekkür ederiz: squircle kırpma isteği (#602), başlayıp hiç bitmeyen image-to-PDF indirmesi (#604, #607), takılıp kalan Delete Pages aracı (#594), pdf-to-text'te eksik Arapça metin (#603) ve ONNX GPU geri dönüşünün ardındaki teşhis (#490).

[GitHub'da tam fark](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

SnapOtter 2.0, görsel araç setini tam bir dosya işleme paketine dönüştürüyor: beş modalitede (Görsel, Video, Ses, PDF ve Dosyalar) 200'den fazla araç; Postgres 17 ve Redis destekli bir iş kuyruğu üzerinde yeniden inşa edildi ve tek komutluk bir `docker run` sunuyor. Bu büyük bir sürüm; 1.x'ten yükseltmeden önce Uyumsuz değişiklikler bölümünü okuyun.

### Yeni özellikler {#new-features}

- **Dört yeni araç modalitesi**: Video, Ses, PDF ve Dosyalar, Görsel'e katılarak kataloğu 200'den fazla araca çıkarıyor.
- **Kalıcı arka plan işleri**: Redis destekli bir kuyruk (BullMQ), her aracı canlı SSE ilerlemesiyle izlenen bir iş olarak çalıştırır.
- **Hepsi bir arada tek konteyner modu**: Tek bir `docker run`, gömülü Postgres ve Redis ile eksiksiz bir örnek başlatır.
- **İstek üzerine AI paketleri**: Arka plan kaldırma, OCR, transkripsiyon, yükseltme, yüz algılama ve iyileştirme, nesne silici, renklendirme ve fotoğraf restorasyonu arayüzden kurulur. GPU hızlandırma framework başına algılanır.
- **Sign PDF**: Tarayıcıda imza çizin, yazın veya yükleyin ve bir PDF üzerine yerleştirin.
- **Automate**: Araçları zincirleyen, dokuz hazır şablonlu görsel bir pipeline oluşturucu.
- **83 tek tıkla dönüştürme ön ayarı**: Bulanık aramalı, özel JPG-to-PNG, MP4-to-GIF ve benzeri dönüştürücüler.
- **Katman tabanlı görsel düzenleyici**: Fırçalar, şekiller, ayarlamalar, filtreler ve eğrilerle `/editor` konumunda Konva destekli bir düzenleyici.
- **Dosyalar kitaplığı**: Herhangi bir sonucu kaydedin ve başka bir araca girdi olarak yeniden kullanın.
- Sabitlenmiş araçlar, tuval içi yakınlaştırma ve kaydırma, 21 dil ve enterprise yetenekleri (OIDC/SSO, SAML, SCIM, S3 depolama, araç başına izinler, denetim dışa aktarma, dağıtık izleme).

### İyileştirmeler {#improvements}

- Çalışan bir işlemi iptal etme. (#137)
- DNG dahil, LibRaw ile tam çözünürlüklü RAW kod çözme. (#289)
- Root olmayan ve yabancı UID'li dağıtımlar (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Doğru AI kurulum algılama ve sıkılaştırılmış kurulum akışı. (#214, #352)
- Gizlilik sıkılaştırması: otomatik üçüncü taraf çıkışı yok, ayrıca isteğe bağlı katı çevrimdışı mod.
- Analitik kapalı olsa bile her zaman açık geri bildirim düğmesi.

### Hata düzeltmeleri {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` artık araç rotaları için hız sınırlamasını yeniden kapatıyor. (#271)
- Docker imajı içindeki AI sanal ortam yolları onarıldı. (#390)
- sharp 0.35.2+ uyumluluğu. (#362)
- Görsel düzenleyici düzen düzeltmeleri: cetveller, dolgu davranışı, kenar çubuğu ve tuval boyutlandırma. (#258, #259)
- İtalyanca çeviri tamamlandı. (#231, #206, #425)
- Audio normalize ve loudnorm kaynak örnekleme hızını koruyor.
- SSRF sıkılaştırması: sayısal IPv6 CIDR eşleştirmesi ve genişletilmiş URL ön taraması. (#287)
- Üretilen PDF'lere Producer olarak SnapOtter damgalanıyor.
- mediapipe, Python 3.13 ve Debian 13 üzerinde kuruluyor.

### Uyumsuz değişiklikler {#breaking-changes}

2.0, gömülü SQLite veritabanını Postgres 17 ile değiştiriyor ve iş kuyruğu için Redis 8 ekliyor. 1.x verileriniz ilk açılışta otomatik olarak taşınır, ancak konteyner yığını değişti; bu yüzden önce `/data` biriminizin tamamını yedekleyin (1.x, SQLite'ı WAL modunda çalıştırır, bu yüzden işlenmiş veriler genellikle `snapotter.db-wal` içinde bulunur). Ardından tek konteynerli imajı (gömülü Postgres ve Redis, yalnızca root) veya Compose yığınını (uygulama artı Postgres 17 ve Redis 8) seçin. Bkz. [taşıma rehberi](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) ve [yükseltme rehberi](/tr/guide/upgrading).

### Yükseltme {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Veya Docker Compose ile:

```bash
docker compose pull && docker compose up -d
```

[GitHub'da tam fark](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Yeni HTML to Image aracı, WCAG 2.2 AA erişilebilirliği, sızma testinden gelen güvenlik sıkılaştırması ve 5 kritik Docker düzeltmesi.

### Yeni özellikler {#new-features-1}

- **HTML to Image**: URL'lerin veya ham HTML'in ekran görüntülerini PNG/JPEG/WebP olarak yakalayın. Tam sayfa yakalamalar, özel görünüm alanları, karanlık mod.
- **Docker _FILE gizli anahtar kuralı**: Hassas ortam değişkenlerini düz metin yerine dosya olarak bağlayın. (#205)
- **Enterprise lisanslama ve S3 depolama**: İsteğe bağlı ticari lisans anahtarı ve S3 uyumlu nesne depolama.
- **Şekil düzenleyici iyileştirmeleri**: Dolgu/çizgi saydamlığı, RGBA renk seçici, kesikli çizgi stilleri.
- **Önceden derlenmiş sürüm arşivleri**: Docker olmayan kurulumlar (Proxmox, bare metal, LXC) için GitHub Releases'tan tarball indirin. (#202)

### İyileştirmeler {#improvements-1}

- **WCAG 2.2 AA erişilebilirliği**: Gezinmeyi atlama, odak tuzağı, aria-live bölgeleri, azaltılmış hareket desteği, doğru kontrast oranları. (#209)
- **Mobil uyumluluk**: Duyarlı ayarlar, mobilde sekme değiştirildiğinde SSE otomatik yeniden bağlanma. (#203, #204)
- **Arka plan kaldırma kalitesi**: Kenar yumuşatma, renk arındırma, çıktı biçimi seçimi.
- **İtalyanca çeviri**: @albanobattistella tarafından yaklaşık 145 yeni dize. (#206)
- **Araç başına API belgeleri**: Parametreler, örnekler ve yanıt biçimleriyle 53 belge sayfası.
- **AI model indirmeleri**: HuggingFace için üstel geri çekilmeli yeniden deneme mantığı. (#201)

### Hata düzeltmeleri {#bug-fixes-1}

- Yeni Docker konteynerleri tamamen kullanılamazdı (hız sınırı tüm istekleri engelliyordu).
- Yüz algılama AI araçları (blur-faces, red-eye-removal, enhance-faces, passport-photo) tüm platformlarda başarısız oluyordu.
- ARM üzerinde HEIC dosyaları bozuktu (libheif sembol uyumsuzluğu).
- Upscale ve restore-photo AI paketleri ARM üzerinde kurulamıyordu.
- OCR, GPU konteynerlerinde yanlış CUDA sürümünü kullanıyordu.
- Onaltılık IPv4-eşlemeli IPv6 adresleri üzerinden SSRF koruması atlatılabiliyordu. (Katkı: @tonghuaroot)
- Yardımcı görseller içeren iPhone HEIC kod çözme. (#183, #199)
- 8GB GPU'larda Real-ESRGAN CUDA OOM. (#200)
- 6 üretim Sentry hatası ve 7 QA hatası. (#208)

### Güvenlik {#security}

- 10 sızma testi bulgusu giderildi (XFF atlatma, hatalı biçimli JSON çökmeleri, sınırsız pipeline'lar, denetim günlüğü XSS, TRACE yöntemi ve daha fazlası). (#207)
- SSRF onaltılık IPv6 atlatması engellendi. (Katkı: @tonghuaroot)
- Dockerfile temel imajları digest ile sabitlendi.

### Yükseltme {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Veya Docker Compose ile:

```bash
docker compose pull && docker compose up -d
```

[GitHub'da tam fark](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Canlı demo, araç başına açılış sayfaları ve bir dizi cila düzeltmesi.

### Yeni özellikler {#new-features-2}

- **Canlı demo** - [demo.snapotter.com](https://demo.snapotter.com), insanların hiçbir şey kurmadan SnapOtter'ı denemesini sağlar.
- **Araçlar dizin sayfası** - Tüm 50'den fazla aracı `/tools` adresinde arama ve kategori filtreleriyle gezin.
- **50'den fazla SEO açılış sayfası** - Her aracın artık SSS, kullanım senaryoları ve karşılaştırma tabloları içeren özel bir açılış sayfası var.
- **Arka plan önizlemesi** - Önce-sonra kaydırıcısı, saydam görsellerin arkasında dama desenli bir arka plan gösterir.
- **Güçlü parola oluşturucu** - Üye Ekle formunda tek tıklamalı düğme.

### Hata düzeltmeleri {#bug-fixes-2}

- HEIC/HEIF bilgi aracı artık başarısız olmuyor (ön kod çözme eklendi).
- AI model paketi kurulumu daha iyi hata mesajları gösteriyor ve kaynak sınırlarına uyuyor.
- Kitaplık küçük resimleri doğru yükleniyor (kimlik doğrulama başlıkları eksikti).
- Açılır menüler artık Kişiler ve Takımlar ayar tablolarında kırpılmıyor.
- Boyut karşılaştırma yüzdesi sıkıştırma olmayan araçlarda gizlendi.
- Yinelenen gizlilik politikası bağlantısı kaldırıldı.
- AI özellikleri ayarları için İtalyanca çeviri eklendi.
- Yeniden adlandırılan Lucide simgeleri güncellendi (Wand2, Columns).

### Altyapı {#infrastructure}

- OpenSSF Scorecard 4.3'ten ~7.0'a yükseltildi.
- CI testleri küçültülmüş fixture'larla 4 parçaya paralelleştirildi.
- 41 bağımlılık güncellemesi.

### Yükseltme {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Veya Docker Compose ile:

```bash
docker compose pull && docker compose up -d
```

[GitHub'da tam fark](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Beş yeni araç, tam bir görsel düzenleyici, SSO ile oturum açma, 20 dil. Muhtemelen üç ayrı sürüm olmalıydı, ama işte buradayız.

### Yeni özellikler {#new-features-3}

- **Görsel düzenleyici** - Katmanlar, fırçalar, şekiller, ayarlamalar, filtreler, eğriler, klavye kısayolları. Tarayıcınızda çalışır, sizin donanımınızda işler.
- **OIDC / SSO kimlik doğrulama** - Google, GitHub, Okta veya herhangi bir OpenID Connect sağlayıcısıyla oturum açın. Birkaç ortam değişkeni ayarlayın, ekibiniz mevcut hesaplarını kullansın.
- **Meme oluşturucu** - opentype.js ile metin işleyen 100 yerleşik şablon. Veya kendi görselinizi yükleyin.
- **Beautify** - Bir ekran görüntüsü bırakın, cilalı bir görsel alın. Cihaz çerçeveleri (macOS, Windows, tarayıcı), gölgeler, gradyanlar, sosyal medya ön ayarları.
- **Renk körlüğü simülasyonu** - Görsellerin protanopi, döteranopi, tritanopi ve diğer renk görme bozukluklarıyla nasıl göründüğünü önizleyin.
- **PNG saydamlık düzeltici** - Sahte saydam PNG'leri algılar ve BiRefNet HR-matting ile düzeltir. LaMa inpainting ile isteğe bağlı filigran kaldırma.
- **AI tuval genişletme** - Görsel sınırlarını AI dolgusuyla genişletin. Ne kadar GPU süresi harcamak istediğinize bağlı olarak üç kalite katmanı (hızlı, dengeli, kaliteli).
- **20 dil** - Arapça, Çince (Basitleştirilmiş/Geleneksel), Çekçe, Felemenkçe, Fransızca, Almanca, Hintçe, Endonezce, İtalyanca, Japonca, Korece, Lehçe, Portekizce, Rusça, İspanyolca, Tayca, Türkçe, Ukraynaca, Vietnamca. RTL Arapça için çalışır.
- **URL içe aktarma** - URL'leri bırakma alanına yapıştırın veya bir listeden toplu içe aktarın. SSRF korumalı, sunucu tarafı getirme.
- **Çok dosyalı silgi** - Birden fazla görselde silme maskeleri çizin, hepsini tek tıkla işleyin. Fırça darbeleri görsel başına kalıcıdır.
- **Pipeline içe/dışa aktarma** - Araç zincirlerini JSON olarak kaydedin, başkalarıyla paylaşın.
- **exiftool ile 17 yeni kamera RAW biçimi**, ayrıca QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ ve APNG girdi desteği. BMP, ICO, JP2, QOI için yeni çıktı kodekleri. AVIF, TIFF, GIF, JXL ve PSD dışa aktarma, daha önce kaybolmuş bir daldan kurtarıldı.

### İyileştirmeler {#improvements-2}

- **Görsel iyileştirme** - Eski pipeline, CLAHE + normalise + gamma ile değiştirildi. Yeni Deep Enhance anahtarı, daha agresif sonuçlar için AI modelini kullanır.
- **Fotoğraf restorasyonu** - Çizik algılama 8 açılı Otsu filtrelemesiyle yeniden yazıldı. LaMa inpainting artık özgün çözünürlükte çalışıyor.
- **Her yerde egzotik biçimler** - OCR, image-to-PDF, favicon oluşturucu, kompozisyon, stitch ve vectorize artık HEIC, RAW ve PSD'nin kodunu çözüyor.
- **Compress** - Hedef boyut toleransı %5'ten %1'e sıkılaştırıldı. Hedef boyut varsayılan mod. Artırma/azaltma düğmeleri ve KB/MB birim seçici eklendi.
- **Sentry temizliği** - 644 işlem gerektirmeyen olay filtrelendi. Gerçek hatalar artık düzgün işleniyor.
- **GPU algılama** - CUDA'nın mevcut olduğu ama nvidia-smi'nin olmadığı konteynerler için daha iyi tanılama.
- **Kimlik doğrulamasız mod** - Anonim kullanıcı, yönetici rolüyle veritabanına eklenir. API anahtarları, pipeline'lar ve kullanıcı dosyaları artık FK kısıtlamalarında bozulmuyor.
- Birim, entegrasyon ve E2E genelinde **2.705+ yeni test**.

### Hata düzeltmeleri {#bug-fixes-3}

- CPU üzerinde Upscale artık NAS kutularında ve düşük güçlü donanımlarda zaman aşımına uğramıyor.
- QR kod logosu artık önizlemenin kalıcı olarak kaybolmasına yol açmıyor.
- Uzun dikey görseller için kırpma taşması düzeltildi.
- TIFF alfa dosyaları bozulma üretmek yerine doğru biçimde PNG çıktısını zorluyor.
- HDR/EXR kod çözme, CLAHE'den önce 8 bite dönüştürüyor; bu, kod çözme hatalarını düzeltiyor.
- Yüz landmark girdi arabellekleri, Python sidecar'a gitmeden önce PNG'ye dönüştürülüyor; bu, çökmeleri düzeltiyor.
- Find duplicates karışık biçimli toplu işleri ve ağ hatalarını işliyor.
- Beautify önizlemesi gerçek zamanlı güncelleniyor.
- stitch ve vectorize için ilerleme çubukları.
- SVGZ, SVG-to-raster tarafından işleniyor.
- ASCII olmayan dosya adları, yüzde kodlamalı X-File-Results başlığıyla düzeltildi.

### Yükseltme {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Veya Docker Compose ile:

```bash
docker compose pull && docker compose up -d
```

[GitHub'da tam fark](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

GPU otomatik algılamalı birleşik Docker imajı. Tek imaj hem CPU hem GPU iş yüklerini yönetir. Compose, günlük döndürmeli tek bir dosyaya sadeleştirildi. Model ön indirmeleri artık doğrulama ve duman testi içeriyor.

---

## v1.13.0 {#v1-13-0}

Rol tabanlı erişim denetimi (RBAC). 14 ayrıntılı izin, üç yerleşik rol (admin, editor, user), özel rol desteği. Tüm API rotalarında izin denetimleri. Ön yüz sekmeleri kullanıcı izinlerine göre filtreleniyor.

---

## v1.12.0 {#v1-12-0}

PDF to Image aracı. PDF sayfalarını özel DPI ile PNG, JPEG, WebP veya TIFF'e dönüştürün. GPU otomatik algılamalı birleşik Docker imajı.

---

## v1.11.0 {#v1-11-0}

AI dostu belgeler için vitepress-plugin-llms ile otomatik oluşturulan llms.txt.

---

## v1.10.0 {#v1-10-0}

Yüz korumalı içeriğe duyarlı yeniden boyutlandırma (seam carving). Önemli içeriği koruyarak görselleri yeniden boyutlandırın.

---

## v1.9.0 {#v1-9-0}

Stitch / Combine aracı. Görselleri yan yana, dikey olarak üst üste veya özel bir ızgarada birleştirin.

---

## v1.8.0 {#v1-8-0}

Edit Metadata aracı. EXIF, IPTC ve XMP meta verilerini ayrıntılı bir sil/koru arayüzüyle görüntüleyin ve düzenleyin.

---

## Eski sürümler {#older-releases}

Yama sürümleri dahil, commit düzeyindeki tam değişiklik günlüğü için [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases) sayfasına bakın.
