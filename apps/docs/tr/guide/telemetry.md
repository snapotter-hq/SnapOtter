---
description: "SnapOtter'ın hangi anonim kullanım verilerini topladığı, ne zaman gönderildiği ve örnek genelindeki ürün analitiğinin nasıl kapatılacağı."
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: 0111270b4a5d
---

# SnapOtter neleri toplar {#what-snapotter-collects}

Anonim Ürün Analitiği varsayılan olarak açıktır ve bir yönetici tarafından tüm örnek için ayarlanır. Ayarlar > System > Privacy altında kapatın.

## Gönderdiğimiz olaylar (etkinken) {#events-we-send-when-enabled}

- tool_used: araç kimliği, durum, süre, kategori, AI aracı olup olmadığı, başarısızlıkta bir hata kodu.
- pipeline_executed: adım sayısı, araç kimlikleri, toplu işlem bayrağı, dosya sayısı, süre, durum.
- ai_bundle_action: paket kimliği, eylem, süre.
- Frontend kullanımı: hangi araç sayfalarının açıldığı, eklenen dosyalar (yalnızca sayılar), başlatılan araç, indirmeler, kaydetmeler, arama (yalnızca sonuç sayısı), işlenen toplu işlem.
- Çökme raporları: hata türü ve yalnızca dosya temel adlarını içeren bir kaynak yığını.

## Asla toplamadıklarımız {#what-we-never-collect}

- Dosya adları veya yolları
- Dosya içerikleri
- OCR çıktı metni
- Görüntü meta verileri (EXIF)
- Çıkarılan belge metni
- IP adresiniz veya hesap kimliğiniz

## Kapatma {#turning-it-off}

Yöneticiler: Ayarlar > System > Privacy, "Anonymous Product Analytics" ayarını kapatın. Örnek genelinde hemen durur. Asla yayamayacak bir image derlemek için `SNAPOTTER_ANALYTICS=off` build arg'ını ayarlayın.
