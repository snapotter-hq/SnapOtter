---
description: "SnapOtter'ın hangi anonim kullanım verilerini topladığı, ne zaman gönderildiği ve örnek genelindeki ürün analitiğinin nasıl kapatılacağı."
i18n_source_hash: 1a68d9371570
i18n_provenance: machine
i18n_output_hash: f4aa2109f42c
i18n_hash_version: 2
---

# SnapOtter neleri toplar {#what-snapotter-collects}

Anonim Ürün Analitiği varsayılan olarak açıktır ve bir yönetici tarafından tüm örnek için ayarlanır. Ayarlar > System > Privacy altında kapatın.

## Gönderdiğimiz olaylar (etkinken) {#events-we-send-when-enabled}

- tool_used: araç kimliği, durum, süre, kategori, AI aracı olup olmadığı, başarısızlıkta bir hata kodu.
- pipeline_executed: adım sayısı, araç kimlikleri, toplu işlem bayrağı, dosya sayısı, süre, durum.
- ai_bundle_action: paket kimliği, eylem, süre.
- Frontend kullanımı: hangi araç sayfalarının açıldığı, eklenen dosyalar (yalnızca sayılar), başlatılan araç, indirmeler, kaydetmeler, arama (yalnızca sonuç sayısı), işlenen toplu işlem.
- Çökme raporları: hata türü, temizlenmiş bir hata mesajı (dosya adları, yollar, e-postalar ve tırnak içindeki değerler çıkarılmış), dosya temel adlarını içeren bir kaynak yığını ve AI araçları için yalnızca dosya temel adlarını içeren bir Python traceback'i.

## Asla toplamadıklarımız {#what-we-never-collect}

- Dosya adları veya yolları
- Dosya içerikleri
- OCR çıktı metni
- Görüntü meta verileri (EXIF)
- Çıkarılan belge metni
- Hesap kimliğiniz

PostHog, her sunucu gibi, her isteğin geldiği IP adresini görür. PostHog projemiz bu adresi saklamak yerine atar ve SnapOtter'ın kendi sunucu olayları onun yerine bir yer tutucu gönderir.

## Güncelleme bildirimleri {#update-notices}

Analitik açıkken sunucu, örneğin anonim kimliğini ve sürümünü kullanarak birkaç saatte bir PostHog'a en yeni SnapOtter sürümünü sorar. Daha yeni bir sürüm varsa yöneticiler, sürüm notlarına bağlantı içeren bir bildirim görür. Bildirimi kapatırsanız bir sonraki sürüme kadar gizli kalır. Sizin yerinize hiçbir şey yüklenmez veya indirilmez ve analitik kapalıyken sunucu hiç sormaz.

## Kapatma {#turning-it-off}

Yöneticiler: Ayarlar > System > Privacy, "Anonymous Product Analytics" ayarını kapatın. Örnek genelinde hemen durur. Asla yayamayacak bir image derlemek için `SNAPOTTER_ANALYTICS=off` build arg'ını ayarlayın.

Yeni bir örneği analitik baştan kapalı olarak başlatmak için, ilk açılıştan önce sunucunun ortamına `SNAPOTTER_ANALYTICS_DEFAULT=off` ekleyin. Docker Compose kullanıyorsanız bunu uygulama servisinin `environment:` bölümüne yazın; yalnızca `.env` içinde ayarlamak konteynere ulaşmaz.
