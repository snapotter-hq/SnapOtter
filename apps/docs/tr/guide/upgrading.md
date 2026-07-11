---
i18n_source_hash: 9a6abf3fc8ae
i18n_provenance: human
i18n_output_hash: 3d7a6e570ac3
---
# 1.x sürümünden 2.0 sürümüne yükseltme {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x her şeyi tek bir SQLite dosyasında saklıyor ve tek bir konteyner olarak çalışıyordu. SnapOtter 2.0, PostgreSQL ve Redis kullanır. Bu kılavuz, bir 1.x kurulumunu veri kaybetmeden 2.0'a taşımayı adım adım anlatır.

Kısa versiyonu: mevcut `/data` birimini (volume) yeniden kullanın; 2.0, ilk açılışta 1.x veritabanınızı otomatik olarak içe aktarır. Kullanıcılarınız, kayıtlı dosyalarınız, ayarlarınız, API anahtarlarınız ve işlem hatlarınız (pipeline) taşınır. Eski veritabanı asla değiştirilmez, bu nedenle her zaman geri dönebilirsiniz.

::: tip 1.x kullanıcılarımıza bir not
Çoğunuz SnapOtter'a ilk günden beri güvendiniz ve geri bildirimleriniz bu sürüme şekil verdi. 2.0, kapağın altında pek çok şeyi değiştiriyor ve bu kılavuz, geçişin önemsediğiniz hiçbir şeye mal olmaması için var. Hesaplarınız, dosyalarınız, ayarlarınız, API anahtarlarınız ve işlem hatlarınız taşınır ve eski veritabanınıza asla dokunulmaz. Bizimle birlikte yükselttiğiniz için teşekkür ederiz.
:::

## Başlamadan önce: `/data` biriminin tamamını yedekleyin {#before-you-start-back-up-the-whole-data-volume}

Bunu her seferinde ilk olarak yapın. Yalnızca `snapotter.db` dosyasını değil, **tüm** `/data` birimini yedekleyin.

Bunun neden önemli olduğunu açıklayalım. 1.x, SQLite'ı WAL modunda çalıştırır; bu nedenle durdurulmuş bir 1.x konteyneri, işlenmiş verilerinin çoğunu neredeyse boş bir `snapotter.db` dosyasının yanındaki `snapotter.db-wal` dosyasında rutin olarak bırakır. Yalnızca `snapotter.db` dosyasını kopyalamak boş bir veritabanı yakalar ve sessizce her şeyi kaybeder. Birim; `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` ve `files/` dizininizi bir arada taşır ve bunlar bir küme olarak taşınmalıdır.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Önce 1.17.2 sürümüne yükseltin {#upgrade-to-1-17-2-first}

2.0'a geçmeden önce 1.x kurulumunuzu en son 1.x sürümüne (1.17.2) yükseltin. Bu, 1.x'in kendi son şema geçişlerini (migration) çalıştırmasına olanak tanır, böylece 2.0, bilinen ve eksiksiz bir şemadan içe aktarır. Daha eski bir 1.x sürümünden doğrudan 2.0'a yükseltme desteklenmez.

## Birim adınızı kontrol edin {#check-your-volume-name}

İçe aktarıcı, verilerinizi yalnızca 2.0 yığını (stack), 1.x kurulumunuzun kullandığı birimi bağlarsa görebilir. Docker birim adları büyük/küçük harfe duyarlıdır ve eski README parçacıkları küçük harfli `snapotter-data` kullanırken Compose dosyaları `SnapOtter-data` kullanır. Hangisine sahip olduğunuzu onaylayın:

```bash
docker volume ls | grep -i snapotter
```

2.0 yapılandırmanızda tam olarak o adı kullanın.

## Yol A: tek konteyner (en hızlısı) {#path-a-single-container-quickest}

SnapOtter'ı tek bir `docker run` ile çalıştırıyorsanız, bunu yapmaya devam edin. 2.0, `DATABASE_URL` veya `REDIS_URL` ayarını yapmadığınızda konteyner içinde gömülü bir PostgreSQL ve Redis başlatır ve ilk açılışta `/data/snapotter.db` dosyasını otomatik olarak algılayıp içe aktarır.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Günlüklerde şuna benzer bir satır izleyin:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Hepsi bu kadar. Mevcut kimlik bilgilerinizle giriş yapın.

## Yol B: Compose (üretim için önerilir) {#path-b-compose-recommended-for-production}

2.0 Compose yığını üç hizmet çalıştırır (uygulama, Postgres, Redis). Uygulama hizmeti için 1.x `/data` biriminizi yeniden kullanın. Uygulama, `/data/snapotter.db` dosyasını otomatik olarak algılar ve ilk açılışta Postgres'e içe aktarır.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Eski veritabanına açıkça işaret etmeyi tercih ederseniz, `SQLITE_MIGRATE_PATH=/data/snapotter.db` ayarını yapın. Açık bir yol her zaman otomatik algılamaya üstün gelir.

## Önce içe aktarımı önizleyin (isteğe bağlı) {#preview-the-import-first-optional}

Hiçbir şey yazmadan tam olarak neyin içe aktarılacağını görmek için veritabanı dosyanıza karşı bir kuru çalıştırma (dry run) yapın:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Tablo başına satır sayılarını, diskte bulduğu kayıtlı kitaplık dosyası sayısını ve normalleştireceği tüm iş durumlarını yazdırır. Çalışan bir Postgres'e ihtiyaç duymaz.

## Neler taşınır, neler taşınmaz {#what-carries-over-and-what-does-not}

Taşınanlar:

- Kullanıcılar ve giriş yapma yeteneği. Parola karmaları (hash) değişmez, bu nedenle aynı kullanıcı adı ve parola çalışır.
- Ekipler, ayarlar (örnek kimliğiniz dahil), roller, API anahtarları (çalışmaya devam ederler) ve kayıtlı işlem hatları.
- İş geçmişi kayıtları.
- Hem kayıtlar hem de gerçek dosyalar olmak üzere kayıtlı dosya kitaplığınız, çünkü `/data/files` birimde korunur.

Taşınmayanlar:

- Giriş oturumları. Yükseltmeden sonra herkes bir kez giriş yapar. Kimlik bilgileri değişmez, bu nedenle bu tek seferlik bir yeniden giriştir, başka bir şey değil.
- Eski işlem işlerinin girdi ve çıktı dosyaları. Bunlar geçici bir çalışma alanında bulunuyordu ve tasarım gereği gitti. İş geçmişi kayıtları kalır.
- 1.x'ten kullanıcı başına analitik onay bayrakları; bunların 2.0 karşılığı yoktur (2.0 analitiği örnek düzeyinde bir ayardır).

## İçe aktarımı kapatma {#turning-the-import-off}

Birimde bir `snapotter.db` mevcut olsa bile bilerek yeni bir veritabanı istiyorsanız, `SQLITE_MIGRATE_PATH=off` ayarını yapın.

## 2.0 örneğinde zaten veriniz varsa {#if-you-already-have-data-in-the-2-0-instance}

İçe aktarıcı yalnızca boş bir veritabanına çalışır. 2.0'ı sıfırdan başlattıysanız (veri oluşturarak) ve daha sonra eski bir `snapotter.db` dosyasını bağladıysanız, 2.0 onu algılar ancak içe aktarmaz, çünkü iki veri kümesini birleştirmek kimliklerde (ID) çakışabilir. Günlüklerde bir uyarı görürsünüz. 1.x verilerini içe aktarmak için boş bir örneğe ihtiyacınız var:

- 2.0 örneği yalnızca varsayılan yöneticiyi tutuyorsa (gerçekten kullanmadıysanız), yığını durdurun, Postgres birimini kaldırın (`SnapOtter-pgdata`) ve eski `/data` mevcutken yeniden başlatın. Temiz bir şekilde içe aktarır. Bu yalnızca kullanılmayan Postgres verilerini siler, 1.x veritabanınızı değil.
- 2.0 örneği saklamak istediğiniz gerçek verileri tutuyorsa, iki veri kümesi otomatik olarak birleştirilemez. İhtiyacınız olanı dışa aktarın ve 1.x verilerini ayrı bir temiz dağıtıma içe aktarın.

## Geri alma {#rolling-back}

Yükseltme, 1.x `snapotter.db` dosyanızı asla değiştirmez veya silmez. 1.x'e geri dönmeniz gerekiyorsa, 1.x görüntüsünü aynı birime karşı yeniden dağıtın. Yükseltmeden sonra 2.0'da oluşturduğunuz her şey Postgres'te bulunur ve 1.x veritabanında olmaz, bu nedenle geri dönecekseniz hemen geri dönün.
