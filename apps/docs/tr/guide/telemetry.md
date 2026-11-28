---
description: "SnapOtter'ın hangi anonim kullanım verilerini topladığı, bunların ne zaman gönderildiği, varsayılan olarak açık olduğu ve bir yöneticinin örnek genelindeki ürün analizini nasıl kapatacağı."
i18n_source_hash: 22d89115c8e5
i18n_provenance: machine
i18n_output_hash: b123e0253291
i18n_hash_version: 2
---

# SnapOtter neler toplar {#what-snapotter-collects}

Anonymous Product Analytics, her örnekte varsayılan olarak açıktır ve ilk çalıştırmada herhangi bir istem gösterilmez. Bir yönetici bunu Settings > System > Privacy altından tüm örnek için kapatabilir ve bu, PostHog ve Sentry'ye giden tüm analiz trafiğini durdurur.

Analiz açıkken SnapOtter, PostHog'a hangi araçların ve pipeline'ların çalıştığını, ne kadar sürdüklerini, başarılı olup olmadıklarını, hata kodlarını ve dosya sayılarını; ayrıca örneğin anonim kimliğini, sürümünü, CPU mimarisini, işletim sistemini, kurulum türünü ve GPU'su olup olmadığını gönderir. Çökme raporları, dosya adları, yollar, e-posta adresleri ve tırnak içindeki değerler çıkarılarak Sentry'ye gider. Dosyalarınızı, adlarını veya yollarını, içeriklerini, OCR çıktısını ya da çıkarılan metni, görüntü meta verilerini veya hesap kimliğinizi asla göndermez. PostHog ve Sentry bir şey gönderdiği tek iki yerdir ve analiz kapalıyken ikisine de hiçbir şey göndermez.

## Gönderdiğimiz olaylar (etkinleştirildiğinde) {#events-we-send-when-enabled}

- tool_used: araç kimliği, durum, süre, kategori, AI aracı olup olmadığı, başarısızlıkta bir hata kodu ve bir aşamayı ayrı bildiren araçlar için adım adı (Passport Photo'nun analiz adımı).
- pipeline_executed: adım sayısı, araç kimlikleri, toplu işlem bayrağı, dosya sayısı, süre, durum.
- ai_bundle_action: paket kimliği, eylem (`install_started`, `installed`, `install_failed`, `uninstalled`, `reset_environment` veya `imported`), süre ve başarısız bir kurulumda sabit bir listeden hata kategorisi (`oom`, `network`, `disk`, `checksum`, `cpu_unsupported`, `timeout` veya `other`). Yükleyici çıktısı, yollar ve hata mesajları asla gönderilmez.
- Frontend kullanımı: hangi araç sayfalarının açıldığı, eklenen dosyalar (yalnızca sayılar), başlatılan araç, indirmeler, kaydetmeler, arama (yalnızca sonuç sayısı), işlenen toplu işlem.
- Çökme raporları: hata türü, temizlenmiş bir hata mesajı (dosya adları, yollar, e-postalar ve tırnak içindeki değerler çıkarılmış), dosya temel adlarını içeren bir kaynak yığını ve AI araçları için yalnızca dosya temel adlarını içeren bir Python traceback'i.

## Asla toplamadıklarımız {#what-we-never-collect}

- Dosya adları veya yolları
- Dosya içerikleri
- OCR çıktı metni
- Görüntü meta verileri (EXIF)
- Belgelerden çıkarılan metin
- Hesap kimliğiniz

PostHog, her sunucu gibi, her isteğin geldiği IP adresini görür. PostHog projemiz onu saklamak yerine atar ve SnapOtter'ın kendi sunucu olayları onun yerine bir yer tutucu gönderir.

## Güncelleme bildirimleri {#update-notices}

Analiz açıkken sunucu, birkaç saatte bir PostHog'a hangi SnapOtter sürümünün en yeni olduğunu sorar ve bunun için örneğin anonim kimliğini ve sürümünü kullanır. Daha yeni bir sürüm olduğunda yöneticiler, sürüm notlarına bağlantı içeren bir bildirim görür. Bildirimi kapatırsanız bir sonraki sürüme kadar gizli kalır. Sizin için hiçbir şey kurulmaz veya indirilmez ve analiz kapalıyken sunucu hiçbir zaman sormaz.

## Kapatma {#turning-it-off}

Yöneticiler: Settings > System > Privacy, "Anonymous Product Analytics" seçeneğini kapatın. Bu işlem hemen durur, tüm örneği kapsar ve PostHog ya da Sentry'ye artık hiçbir şey gönderilmez. Hiçbir zaman veri göndermeyecek bir imaj oluşturmak için `SNAPOTTER_ANALYTICS=off` derleme argümanını ayarlayın. Sunucunun ortamındaki `SNAPOTTER_TELEMETRY=off` çalışma zamanında aynı işi yapar, yeniden derleme gerekmez.

Yeni bir örneği analiz zaten kapalı olarak başlatmak için `SNAPOTTER_ANALYTICS_DEFAULT=off` değerini sunucunun ortamına ilk açılıştan önce ekleyin. Docker Compose ile bunu uygulama servisinin `environment:` bölümüne koyun, çünkü yalnızca `.env` içinde ayarlamak kapsayıcıya ulaşmaz.
