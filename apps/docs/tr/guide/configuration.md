---
description: "Varsayılan değerleriyle tüm SnapOtter ortam değişkenleri. Kimlik doğrulamayı, depolamayı, AI modellerini, analitiği ve daha fazlasını yapılandırın."
i18n_source_hash: 02edb8bd70e5
i18n_provenance: machine
i18n_output_hash: 8d953d0c8e83
i18n_hash_version: 2
---

# Yapılandırma {#configuration}

Tüm yapılandırma ortam değişkenleri üzerinden yapılır. Her değişkenin makul bir varsayılan değeri vardır, bu yüzden SnapOtter hiçbirini ayarlamadan da kutudan çıktığı gibi çalışır.

## Ortam değişkenleri {#environment-variables}

### Sunucu {#server}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `1349` | Sunucunun dinlediği port. |
| `HOST` | `0.0.0.0` | Sunucunun dinlediği IP adresi. Bir köprü (bridge) ağında (`docker run` ve Compose için varsayılan) `0.0.0.0` (veya `::`) değerini koruyun; aksi halde yayımlanan portlar çalışmaz hale gelir. Doğrudan (native) bir kurulumda veya ana makine ağındaki bir konteynerde `127.0.0.1`, API'yi ağın dışında tutar; uzaktan erişim için önüne bir ters vekil sunucu (reverse proxy) koyun. [Gömülü mod](#embedded-mode) yalnızca `0.0.0.0`, `::` veya `127.0.0.1` ile çalışır, çünkü başlangıç denetimi `127.0.0.1` adresini çağırır. Başka herhangi bir adresle, `::1` dahil, konteyner hiçbir zaman başlamış sayılmaz ve sonradan yaşanan bir çökme, sunucuyu yeniden başlatmak yerine konteyneri durdurur. IP adresi olmayan her değer, `localhost` dahil, sunucuyu başlangıçta durdurur. |
| `BASE_PATH` | (boş) | Genel dağıtım yolu, örn. `/snapotter`. Boş bırakılırsa veya `/` verilirse alan adının kökünden sunulur. Çalışma zamanında uygulanır; imajın yeniden derlenmesi gerekmez. |
| `RATE_LIMIT_PER_MIN` | `1000` | IP başına dakikadaki en fazla istek sayısı. Hız sınırlamasını kapatmak için 0 yapın. |
| `CORS_ORIGIN` | (boş) | CORS için izin verilen kaynakların virgülle ayrılmış listesi. Boşsa yalnızca aynı kaynağa izin verilir. |
| `LOG_LEVEL` | `info` | Günlük ayrıntı düzeyi. Şunlardan biri: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Hangi eşlerin istemci IP'sini `X-Forwarded-For` üzerinden ayarlayabileceği. Varsayılan değer yalnızca özel ağdaki bir eşe güvenir; böylece Docker ağındaki veya LAN'daki bir ters vekil sunucu (reverse proxy) güvenilir sayılır, genel ağdaki bir istemcinin taklit ettiği başlık ise sayılmaz. `true` değerini yalnızca önünüzde, genel bir adreste kontrol ettiğiniz bir vekil sunucu varsa ayarlayın. |
| `SNAPOTTER_ANALYTICS_DEFAULT` | (ayarlanmamış) | İlk çalıştırmadaki analitik sorusunu önceden yanıtlar, böylece kimseye sorulmaz. Ayarlanmamışsa yeni bir örnek yöneticisine sorar ve yanıt alana kadar hiçbir şey göndermez. `off` örneği "Anonim Ürün Analitiği" kapalı olarak, `on` ise açık olarak başlatır. Bu değişken ayarı yalnızca henüz kimse bir seçim yapmamışken doldurur. Ayar bir kez kaydedildikten sonra, ister bir yönetici ister bu değişken tarafından, değişkeni değiştirmenin hiçbir etkisi olmaz; bir yönetici ayarı yine de Ayarlar > Sistem > Gizlilik altından değiştirebilir. |

### Kimlik doğrulama {#authentication}

Aşağıdaki iki boolean değişken yalnızca `true` ve `false` değerlerini kabul eder. Bunun dışındaki her değer (`1`, `yes` veya `on`) doğrulamadan geçemez ve sunucu dinlemeye başlamadan çıkar.

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `AUTH_ENABLED` | `true` | Oturum açmayı zorunlu kılar. Hiç hesap olmadan çalıştırmak için `false` yapın; bu durumda her isteğe yönetici hakları verilir, bu yüzden yalnızca güvenilir bir ağda kullanın. |
| `DEFAULT_USERNAME` | `admin` | İlk yönetici hesabının kullanıcı adı. Yalnızca ilk çalıştırmada kullanılır. |
| `DEFAULT_PASSWORD` | `admin` | İlk yönetici hesabının parolası. İlk oturum açmadan sonra değiştirin. |
| `MAX_USERS` | `0` (sınırsız) | Kayıtlı kullanıcı hesaplarının en fazla sayısı. Sınırsız için 0 yapın. |
| `SESSION_DURATION_HOURS` | `168` | Oturum ömrü, saat cinsinden (varsayılan 7 gündür). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | İlk oturum açmadaki zorunlu parola değiştirme istemini atlamak için `true` yapın. |

### Depolama {#storage}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` veya `s3`. S3 ve MinIO, s3_storage özelliğini içeren bir lisansın yanı sıra aşağıdaki `S3_*` değişkenlerini gerektirir. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL bağlantı dizesi ve her isteğin sunulduğu bağlantı. 2.3.0 ve sonrasında `DATABASE_MIGRATION_URL` değerini de ayarlayın; bu durumda bu bağlantı, uygulamanın tabloları üzerinde yalnızca DML yetkisine sahip olan en düşük yetkili çalışma zamanı rolü olur. Compose yığını bunu `postgres` servisine yönlendirir; gömülü modu kullanmak için bunu (`REDIS_URL` ile birlikte) ayarlamadan bırakın. |
| `DATABASE_MIGRATION_URL` | (boş) | Yalnızca açılış sırasında, migrasyonları çalıştırmak ve çalışma zamanı rolüne yetki vermek için kullanılan, ilk istekten önce kapatılan yetkili bağlantı. Boş bırakırsanız SnapOtter tek rolle çalışır ve her iki işi de `DATABASE_URL` yapar. Bkz. [En düşük yetkili roller](/tr/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Redis bağlantı dizesi (BullMQ iş kuyrukları için kullanılır). Compose bunu `redis` servisine yönlendirir. |
| `WORKSPACE_PATH` | `./tmp/workspace` | İşleme sırasında geçici dosyalar için dizin. Otomatik olarak temizlenir. İmaj `/tmp/workspace` değerini ayarlar. |
| `FILES_STORAGE_PATH` | `./data/files` | Kalıcı kullanıcı dosyaları (yüklenen görseller, kaydedilen sonuçlar) için dizin. İmaj `/data/files` değerini ayarlar. |

### S3 nesne depolama {#s3-object-storage}

Yalnızca `STORAGE_MODE=s3` olduğunda okunur. Zorunlu üç değişkenden biri eksikse başlatma, atladığınız değişkenin adıyla birlikte başarısız olur.

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `S3_BUCKET` | (boş) | Yüklemeleri ve çıktıları tutan bucket. Zorunlu. |
| `S3_ACCESS_KEY_ID` | (boş) | Erişim anahtarı. Zorunlu. Konteynerde bunun yerine `S3_ACCESS_KEY_ID_FILE` üzerinden bağlayabilirsiniz. |
| `S3_SECRET_ACCESS_KEY` | (boş) | Gizli anahtar. Zorunlu. Aynı dosya kuralı geçerlidir: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Bucket bölgesi. |
| `S3_ENDPOINT` | (boş) | MinIO, R2, Backblaze ve diğer S3 uyumlu depolar için özel uç nokta. Boşsa AWS kullanılır. |
| `S3_FORCE_PATH_STYLE` | `false` | MinIO ve sanal ana makine adresleme yerine `endpoint/bucket/key` isteyen her şey için `true` yapın. |
| `S3_PREFIX` | (boş) | Anahtar öneki; böylece tek bir bucket birden fazla örneği barındırabilir. |

### Hareketsiz durumda şifreleme {#encryption-at-rest}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (boş) | 64 onaltılık karakter (32 bayt). Veritabanında saklanan hassas ayarları şifreler. 64 onaltılık karakter olmayan her değer başlatmada reddedilir. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (boş) | Terk ettiğiniz anahtar, aynı biçimde. Mevcut satırların şifresi çözülebilsin diye rotasyon sırasında ikisini de ayarlayın, ardından bunu kaldırın. |

### Gömülü mod {#embedded-mode}

İmajı `DATABASE_URL` ve `REDIS_URL` olmadan çalıştırırsanız imaj, konteynerin içinde kendi PostgreSQL 17 ve Redis'ini başlatır; ikisi de loopback'e bağlıdır ve tüm veriler `/data` biriminde durur. Bu, hızlı başlangıç, homelab ve 1.x'ten yükseltmeler için tek komutluk `docker run` deneyimini geri getirir. Bu bir kolaylık yoludur, üretim dağıtımı değildir: üretimde ayrı PostgreSQL ve Redis içeren 3 konteynerli Compose yığınını çalıştırın. Gömülü mod konteynerin root olarak çalışmasını gerektirir ve keyfi UID kullanan çalışma zamanlarıyla (OpenShift, Kubernetes `runAsNonRoot`) uyumsuzdur; orada Compose kullanın.

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `EMBEDDED` | `auto` | `DATABASE_URL` ve `REDIS_URL` ikisi de ayarlı değilse otomatik olarak etkinleşir. Kapatmak için `0` yapın (bu durumda harici bir `DATABASE_URL`/`REDIS_URL` ayarlı değilse uygulama, konteyner içinde sessizce bir veritabanı başlatmak yerine hemen hata verir). |
| `REDIS_MAXMEMORY` | `512mb` | Gömülü Redis için bellek sınırı (yalnızca gömülü mod). Raspberry Pi gibi belleği kısıtlı ana makinelerde düşürün. |
| `EMBEDDED_PG_PORT` | `5432` | Gömülü PostgreSQL için loopback portu (yalnızca gömülü mod). Bunu yalnızca konteyner, 5432 portunun dolu olduğu bir ağı paylaşıyorsa değiştirin; örneğin `--network host`. `EMBEDDED_REDIS_PORT` değerinden farklı ve 1023'ten büyük olmalıdır, çünkü PostgreSQL, ana makine ağında ayrıcalıklı bir porta bağlanamayan ayrıcalıksız bir kullanıcı olarak çalışır. |
| `EMBEDDED_REDIS_PORT` | `6379` | Gömülü Redis için aynısı; o da ayrıcalıksız bir kullanıcı olarak çalışır. |
| `EMBEDDED_DB_PASSWORDS` | (boş) | Bir sonraki açılışta gömülü PostgreSQL rolleri ve Redis için rastgele parolalar oluşturmak üzere `1` yapın; parolalar `/data/.embedded-db-secrets` içinde saklanır. Bundan sonra TCP üzerinden oturum açmak için bu parolalar gerekir. İlk kez 2.3.0 veya sonraki bir sürümle oluşturulmuş bir birimde PostgreSQL süper kullanıcısı TCP üzerinden hiç oturum açamaz; daha eski bir birimde veritabanı sahibi süper kullanıcıdır ve onu koruyan şey parolasıdır. Konteynerin ağını başka programlar da paylaşıyorsa, örneğin `--network host` ile, her zaman kullanın. Bu ayar o birim için açık kalır: bu değişkeni kaldırsanız bile parolalar her açılışta kullanılır; `/data/.embedded-db-secrets` dizinini silmek ise size yalnızca yeni parolalar kazandırır ya da değişken ayarlı değilse başarısız olan bir açılışa yol açar. Konteyner bu dosyalardan biri bozuk olduğu için başlamıyorsa, o dosyayı `docker run --rm -v <volume>:/data --entrypoint rm snapotter/snapotter:<your tag> -r /data/.embedded-db-secrets/<name>` ile silin ve konteyneri yeniden başlatın; bir sonraki açılış yenisini oluşturur. Değişken `1`, `0` veya boş değer alır; başka herhangi bir değer açılışı durdurur. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Açılışın, vazgeçmeden önce gömülü Redis'in `PING` yanıtını vermesini beklediği saniye sayısı. Zaman aşımında konteyner takılıp kalmak yerine durur ve nedenini günlüğe yazar. 1 ile 999999 arasında tam saniye; sınırsız değer yoktur, çünkü sonsuza kadar beklemek bu sınırın önlemek için var olduğu hatanın ta kendisidir. Yalnızca yavaş bir ana makine bu sınıra takılıyorsa artırın. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | Gömülü PostgreSQL için aynısı. Süre, ilk açılıştaki `initdb` bittikten sonra başlar; bu nedenle ilk veritabanı oluşturmayı değil, sunucu başlatmayı ve çökme kurtarmayı kapsar. |

1.x'ten yükseltme: eski `snapotter.db` dosyanızı birimde `/data/snapotter.db` konumuna koyun; gömülü mod, ilk açılışta onu gömülü PostgreSQL'e aktarır. İçe aktarma bir kez çalışır; sonraki açılışlar onu atlar.

Telemetri notu: gömülü mod, diğer tüm yapılandırmalar gibi imajın analitik varsayılanını devralır. Yayımlanan imaj analitik gönderebilir, ancak yeni bir örnek önce yöneticisine sorar ve yanıt alana kadar hiçbir şey göndermez. Kapatmak için hayır yanıtını verin, `--build-arg SNAPOTTER_ANALYTICS=off` ile derleyin, ilk açılıştan önce `SNAPOTTER_ANALYTICS_DEFAULT=off` ayarlayın veya uygulama içi yönetici devre dışı bırakma seçeneğini kullanın.

### İşleme sınırları {#processing-limits}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (sınırsız) | Yükleme başına en büyük dosya boyutu, megabayt cinsinden. Sınırsız için 0 yapın. Yayımlanan imaj `0` ile gelir; kaynaktan derlemede değer 100 ile başlar. |
| `MAX_BATCH_SIZE` | `0` (sınırsız) | Tek bir toplu istekteki en fazla dosya sayısı. Sınırsız için 0 yapın. Yayımlanan imaj `0` ile gelir; kaynaktan derlemede değer 100 ile başlar. |
| `CONCURRENT_JOBS` | `0` (otomatik) | Paralel çalışan toplu iş sayısı. Kullanılabilir CPU çekirdeklerine göre otomatik algılamak için 0 yapın. |
| `MAX_MEGAPIXELS` | `0` (sınırsız) | İzin verilen en yüksek görsel çözünürlüğü, megapiksel cinsinden. Sınırsız için 0 yapın. |
| `MAX_WORKER_THREADS` | `0` (otomatik) | Görsel işleme için en fazla worker thread sayısı. Kullanılabilir CPU çekirdeklerine göre otomatik algılamak için 0 yapın. |
| `PROCESSING_TIMEOUT_S` | `0` (sınır yok) | AI araçlarını çalıştıran Python sidecar'a yapılan her çağrı için zaman aşımı, saniye cinsinden. Zaman aşımı olmaması için 0 yapın. Görsel, PDF veya medya işlerini sınırlamaz; bunu `JOB_TIMEOUT_FAST_S` ve `JOB_TIMEOUT_LONG_S` yapar. |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Python AI sidecar'ının ve doğru OCR çalışma zamanının, kapanıp belleklerini serbest bırakmadan önce boşta bekledikleri saniye sayısı (ısındıktan sonra yaklaşık 1,3 GB ve 0,7 GB). İkisi de bir sonraki istekte yeniden başlar; bu yüzden boşta kapanmanın ardından yapılan ilk AI çağrısı, birkaç saniyelik kitaplık başlatma maliyetini öder. Çalışır durumda tutmak için 0 yapın. Varsayılan değer `AI_SESSION_IDLE_TIMEOUT` ile aynıdır; böylece yüklenen modeller o ayarın belirttiğinden daha erken bırakılmaz. `AI_SESSION_IDLE_TIMEOUT` değerini artırırsanız bunu da aynı değere artırın. |
| `JOB_TIMEOUT_FAST_S` | `120` | Hızlı havuzlardaki (görsel ve belge araçları) tek bir iş için süre sınırı, saniye cinsinden. Daha uzun süren bir iş zaman aşımı hatasıyla başarısız olur. Sınır olmaması için 0 yapın. |
| `JOB_TIMEOUT_LONG_S` | `7200` | Uzun havuzlardaki (AI ve medya araçları ile uzun süreli olarak işaretlenmiş her araç) tek bir iş için süre sınırı, saniye cinsinden. Sınır olmaması için 0 yapın. Dengeli ve En İyi PDF OCR kendi süre sınırlarını sayfa sayısına göre (sayfa başına 2 ve 5 dakika) en fazla 6 saate kadar uzatır; bu yüzden büyük bir PDF için bunu artırmanız gerekmez. |
| `SYNC_WAIT_MS` | `8000` | Bir araç isteğinin, API beklemeyi bırakıp SSE üzerinden takip edilecek bir iş kimliğiyle `202` döndürmeden önce işini ne kadar beklediği, milisaniye cinsinden. İşi durdurmaz. İş ne kadar sürerse sürsün beklemek için 0 yapın. |
| `MAX_PIPELINE_STEPS` | `20` | Bir pipeline'daki en fazla adım sayısı. Sınır olmaması için 0 yapın. |
| `MAX_CANVAS_PIXELS` | `0` (sınır yok) | Çıktı görselleri için piksel cinsinden en büyük tuval boyutu. Sınır olmaması için 0 yapın. |
| `MAX_SVG_SIZE_MB` | `50` | Temizlemeden önce kabul edilen en büyük SVG, megabayt cinsinden. `0` burada çevresindeki satırlardan farklı davranır. Ön ayrıştırma boyut sınırını yükseltmek yerine tamamen kaldırır, bu yüzden bunu ayarlı bırakın. |
| `MAX_PDF_PAGES` | `0` (sınırsız) | PDF'den görsele dönüştürmede en fazla PDF sayfa sayısı. Sınırsız için 0 yapın. |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | Bir araç isteğinin taşıyabileceği en büyük `settings` alanı, kilobayt cinsinden ve UTF-8 bayt olarak sayılır. Sınırı aşan istekler `400` alır. Sınır olmaması için 0 yapın. Gerçek araç ayarları 64 KB'tan çok daha küçüktür; bu yüzden bunu yalnızca bir istemci alışılmadık derecede büyük ayarlar gönderiyorsa artırın. |

### Motorlar {#engines}

SnapOtter her işleme ikili dosyasını konteyner içinde `$PATH` üzerinde arar; bu yüzden kendi derlemenizi bağlamadığınız sürece bunlar boş kalır.

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `FFMPEG_PATH` | (boş) | Video ve ses araçlarının arkasındaki `ffmpeg` ikili dosyasının yolu. |
| `FFPROBE_PATH` | (boş) | Medya dosyalarını işlenmeden önce okuyan `ffprobe` yolu. `FFMPEG_PATH` ile aynı derlemeye yönlendirin. |
| `QPDF_PATH` | (boş) | PDF araçları tarafından ve yüklenen PDF'leri denetlemek için kullanılan `qpdf` yolu. |
| `SOFFICE_PATH` | (boş) | Ofis belgesi dönüştürmeleri için kullanılan LibreOffice'in `soffice` yolu. |
| `PDFCPU_PATH` | (boş) | Bazı PDF araçlarının kullandığı `pdfcpu` yolu. |
| `GS_PATH` | (boş) | PDF araçları ve PDF OCR tarafından kullanılan Ghostscript'in `gs` yolu. |
| `PANDOC_PATH` | (boş) | Belge dönüştürmelerinin kullandığı `pandoc` yolu. |
| `SNAPOTTER_FONT_FILE` | (boş) | Videonun üzerine çizilen metin için yazı tipi dosyası (altyazı yakma, video filigranı). Boşsa imajın bulduğu ilk yazı tipi kullanılır. |
| `SNAPOTTER_FONT_FAMILY` | (boş) | `SNAPOTTER_FONT_FILE` dosyasının yazı tipi ailesi adı. Boş, `Sans` anlamına gelir. |
| `SNAPOTTER_HW_ACCEL` | (boş) | Donanım video kodlayıcı ailesi, `nvenc` veya `vaapi`. Boşsa yazılımla kodlar. |

`SNAPOTTER_HW_ACCEL` için o kodlayıcı ailesiyle derlenmiş bir ffmpeg gerekir ve imajdaki ffmpeg ikisine de sahip değildir. İmajın kendi ikili dosyasıyla bu ayar yazılımla kodlamaya geri döner ve bunu açılış günlüğünde belirtir. Kullanmak için kendi ffmpeg derlemenizi bağlayın, `FFMPEG_PATH` ve `FFPROBE_PATH` değişkenlerini ona yönlendirin ve konteynere GPU aygıtını verin. `nvenc` için ayrıca `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video` değerini de ayarlayın: imaj yalnızca `compute,utility` ister ve `video` olmadan NVIDIA çalışma zamanı kodlama kitaplığını bağlamaz; bu durumda kodlayıcı listelenir ama her kodlama başarısız olur. Var olmayan veya çalıştırılabilir olmayan bir yol geçersiz kılması da açılış günlüğünde adıyla belirtilir ve o ikili dosyayı gerektiren her iş, yolu düzeltene veya ayarı kaldırana kadar başarısız olur.

Yayımlanan Compose dosyaları bunların hepsini `.env` dosyasından aktarır, bu yüzden orada ayarlamak yeterlidir.

### Temizlik {#cleanup}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Kaydedilmemiş işleme sonuçlarının (ham yüklemeler ve araç çıktıları) otomatik silinmeden önce ne kadar süre tutulacağı. Dosyalar kitaplığına açıkça kaydettiğiniz dosyalar etkilenmez ve siz silene kadar kalır. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Temizlik işinin ne sıklıkta çalıştığı. |

### Görünüm {#appearance}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `DEFAULT_THEME` | `light` | Yeni oturumlar için varsayılan tema. `light`, `dark` veya `system`. |
| `DEFAULT_LOCALE` | `en` | Varsayılan arayüz dili. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Varsayılan araç düzeni. `sidebar` veya `fullscreen`. |

### Docker izinleri {#docker-permissions}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PUID` | `999` | Konteyner işlemini bu UID ile çalıştırır. Bind mount'lar için ana makinedeki kullanıcınızla eşleşecek şekilde ayarlayın (`id -u`). |
| `PGID` | `999` | Konteyner işlemini bu GID ile çalıştırır. Bind mount'lar için ana makinedeki grubunuzla eşleşecek şekilde ayarlayın (`id -g`). |

## Docker örneği {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## Birimler {#volumes}

Docker Compose yığını dört birim kullanır:

- `/data` (app) - AI modelleri, Python venv ve kullanıcı dosyaları. Yüklenen dosyaları ve kurulu AI paketlerini yeniden başlatmalar boyunca korumak için bunu bağlayın.
- `/tmp/workspace` (app) - İşlenmekte olan dosyalar için geçici depolama. Geçici olabilir, ancak bağlamak konteynerin yazılabilir katmanının dolmasını önler.
- `SnapOtter-pgdata` (postgres) - PostgreSQL veri dizini. Tüm ilişkisel veriler (kullanıcılar, ayarlar, pipeline'lar, işler, denetim günlüğü) burada tutulur. `pg_dump` veya birim anlık görüntüsü ile yedekleyin.
- `SnapOtter-redisdata` (redis) - Kalıcı iş kuyrukları için Redis append-only dosyası.
