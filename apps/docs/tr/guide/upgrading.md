---
i18n_source_hash: 959cca5c298c
i18n_provenance: machine
i18n_output_hash: 72896606027e
i18n_hash_version: 2
---
# 1.x Sürümünden 2.0'a Yükseltme {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x her şeyi tek bir SQLite dosyasında saklıyor ve tek bir kapsayıcı olarak çalışıyordu. SnapOtter 2.0 ise PostgreSQL ve Redis kullanır. Bu rehber, bir 1.x kurulumunu veri kaybetmeden 2.0'a taşımayı adım adım anlatır.

Kısaca: mevcut `/data` biriminizi yeniden kullanın; 2.0, ilk açılışta 1.x veritabanınızı otomatik olarak içe aktarır. Kullanıcılarınız, kayıtlı dosyalarınız, ayarlarınız, API anahtarlarınız ve iş hatlarınız taşınır. Eski veritabanı hiçbir zaman değiştirilmez, bu yüzden her zaman geri dönebilirsiniz.

::: tip 1.x kullanıcılarımıza not
Pek çoğunuz SnapOtter'a ilk günden beri güvendi ve geri bildirimleriniz bu sürümü şekillendirdi. 2.0 kaputun altında çok şey değiştiriyor; bu rehber, geçişin önem verdiğiniz hiçbir şeye mal olmaması için var. Hesaplarınız, dosyalarınız, ayarlarınız, API anahtarlarınız ve iş hatlarınız taşınır, eski veritabanınıza da dokunulmaz. Bizimle birlikte yükselttiğiniz için teşekkürler.
:::

## Başlamadan önce: `/data` biriminin tamamını yedekleyin {#before-you-start-back-up-the-whole-data-volume}

Bunu her seferinde ilk iş olarak yapın. Yalnızca `snapotter.db` dosyasını değil, `/data` biriminin **tamamını** yedekleyin.

Bunun önemi şudur. 1.x, SQLite'ı WAL modunda çalıştırır; bu yüzden durdurulmuş bir 1.x kapsayıcısı, işlenmiş verilerinin çoğunu neredeyse boş bir `snapotter.db` dosyasının yanındaki `snapotter.db-wal` içinde bırakır. Yalnızca `snapotter.db` dosyasını kopyalamak boş bir veritabanı alır ve her şeyi sessizce kaybeder. Birim `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` ve `files/` dizininizi birlikte taşır ve bunlar bir takım olarak taşınmalıdır.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Önce 1.17.2 sürümüne yükseltin {#upgrade-to-1-17-2-first}

2.0'a geçmeden önce 1.x kurulumunuzu en son 1.x sürümüne (1.17.2) yükseltin. Bu, 1.x'in kendi son şema geçişlerini çalıştırmasını sağlar; böylece 2.0 bilinen, eksiksiz bir şemadan içe aktarır. Daha eski bir 1.x sürümünden doğrudan 2.0'a yükseltme desteklenmez.

## Birim adınızı kontrol edin {#check-your-volume-name}

İçe aktarıcı, verilerinizi yalnızca 2.0 yığını 1.x kurulumunuzun kullandığı birimin aynısını bağlıyorsa görür. Docker birim adları büyük/küçük harfe duyarlıdır ve eski README parçacıkları küçük harfli `snapotter-data` kullanırken Compose dosyaları `SnapOtter-data` kullanır. Hangisine sahip olduğunuzu doğrulayın:

```bash
docker volume ls | grep -i snapotter
```

2.0 yapılandırmanızda tam olarak bu adı kullanın.

## Yol A: tek kapsayıcı (en hızlısı) {#path-a-single-container-quickest}

SnapOtter'ı tek bir `docker run` ile çalıştırıyorsanız bunu sürdürün. `DATABASE_URL` veya `REDIS_URL` ayarlamadığınızda 2.0, kapsayıcının içinde gömülü bir PostgreSQL ve Redis başlatır ve ilk açılışta `/data/snapotter.db` dosyasını otomatik algılayıp içe aktarır.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Günlüklerde şuna benzer bir satır arayın:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Hepsi bu kadar. Mevcut kimlik bilgilerinizle oturum açın.

## Yol B: Compose (üretim için önerilir) {#path-b-compose-recommended-for-production}

2.0 Compose yığını üç servis çalıştırır (uygulama, Postgres, Redis). Uygulama servisi için 1.x `/data` biriminizi yeniden kullanın. Uygulama `/data/snapotter.db` dosyasını otomatik algılar ve ilk açılışta Postgres'e aktarır.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Eski veritabanını açıkça göstermek isterseniz `SQLITE_MIGRATE_PATH=/data/snapotter.db` ayarlayın. Açıkça verilen yol her zaman otomatik algılamaya üstün gelir.

## Önce içe aktarmayı önizleyin (isteğe bağlı) {#preview-the-import-first-optional}

Hiçbir şey yazmadan tam olarak nelerin içe aktarılacağını görmek için veritabanı dosyanıza karşı bir deneme çalıştırması yapın:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Tablo başına satır sayılarını, diskte bulduğu kayıtlı kitaplık dosyası sayısını ve normalleştireceği iş durumlarını yazdırır. Çalışan bir Postgres gerektirmez.

## Nelerin taşındığı ve nelerin taşınmadığı {#what-carries-over-and-what-does-not}

Taşınanlar:

- Kullanıcılar ve oturum açabilme yeteneği. Parola özetleri değişmez, bu yüzden aynı kullanıcı adı ve parola çalışır.
- Ekipler, ayarlar (örnek kimliğiniz dahil), roller, API anahtarları (çalışmaya devam ederler) ve kayıtlı iş hatları.
- İş geçmişi kayıtları.
- Kayıtlı dosya kitaplığınız, hem kayıtlar hem de gerçek dosyalar, çünkü `/data/files` birimde korunur.

Taşınmayanlar:

- Oturumlar. Yükseltmeden sonra herkes bir kez yeniden oturum açar. Kimlik bilgileri değişmediği için bu yalnızca tek bir yeniden girişten ibarettir.
- Eski işleme işlerinin girdi ve çıktı dosyaları. Bunlar geçici bir çalışma alanında tutuluyordu ve tasarım gereği yoktur. İş geçmişi kayıtları kalır.
- 1.x'teki kullanıcı başına analitik onay bayrakları; 2.0'da bir karşılıkları yoktur (2.0 analitiği örnek düzeyinde bir ayardır).

## İçe aktarmayı kapatma {#turning-the-import-off}

Birimde bir `snapotter.db` bulunmasına rağmen bilerek yeni bir veritabanı istiyorsanız `SQLITE_MIGRATE_PATH=off` ayarlayın.

## 2.0 örneğinde zaten veriniz varsa {#if-you-already-have-data-in-the-2-0-instance}

İçe aktarıcı yalnızca boş bir veritabanına aktarım yapar. 2.0'ı sıfırdan başlatıp (veri oluşturup) sonra eski bir `snapotter.db` bağladıysanız, 2.0 onu algılar ancak içe aktarmaz, çünkü iki veri kümesini birleştirmek kimlik çakışmalarına yol açabilir. Günlüklerde bir uyarı göreceksiniz. 1.x verilerini içe aktarmak için boş bir örneğe ihtiyacınız var:

- 2.0 örneği yalnızca varsayılan yöneticiyi içeriyorsa (gerçekten kullanmadıysanız), yığını durdurun, Postgres birimini (`SnapOtter-pgdata`) kaldırın ve eski `/data` mevcutken yeniden başlatın. Temiz biçimde içe aktarır. Bu yalnızca geçici Postgres verilerini siler, 1.x veritabanınızı değil.
- 2.0 örneği saklamak istediğiniz gerçek veriler içeriyorsa iki veri kümesi otomatik birleştirilemez. İhtiyacınız olanı dışa aktarın ve 1.x verilerini ayrı, yeni bir dağıtıma içe aktarın.

## Geri alma {#rolling-back}

Yükseltme 1.x `snapotter.db` dosyanızı asla değiştirmez veya silmez. 1.x'e dönmeniz gerekirse aynı birime karşı 1.x imajını yeniden dağıtın. 2.0'da yükseltmeden sonra oluşturduğunuz her şey Postgres'te yaşar ve 1.x veritabanında olmaz; bu yüzden geri dönecekseniz çabuk dönün.
