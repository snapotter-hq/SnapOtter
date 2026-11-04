---
description: "SnapOtter için güvenlik sıkılaştırma rehberi. Kapsayıcı güvenliği, ağ yalıtımı, Docker secrets, Kubernetes dağıtımı ve uyumluluk çıktıları."
i18n_source_hash: 630381c08cde
i18n_provenance: machine
i18n_output_hash: 6bc38c978150
i18n_hash_version: 2
---

# Güvenlik ve Sıkılaştırma {#security-hardening}

SnapOtter dosyaları tamamen kendi altyapınızda işler. Projeyi geliştirmeye yardımcı olmak için varsayılan olarak anonim, içerik içermeyen ürün analitiği ve çökme raporları gönderir. Dosyalarınızı, dosya adlarını, dosya içeriklerini, OCR çıktısını, görsel meta verilerini veya belge metnini asla göndermez. İsteğe bağlı geri bildirim yalnızca kullanıcı gönderdikten sonra, yalnızca analitik etkinken ve iletişim alanları yalnızca açık iletişim onayıyla gönderilir. Bir yönetici, yeniden derleme gerekmeden Ayarlar > Sistem > Gizlilik altında analitiği ve geri bildirim toplamayı tek tıkla kapatabilir. Dosya işleme her zaman kapsayıcınızın içinde kalır.

Kapsayıcı, gereken asgari küme dışındaki tüm Linux yetenekleri kaldırılmış olarak özel bir root olmayan kullanıcıyla (`snapotter`) çalışır. Tam güvenlik açığı bildirim ilkesi ve güvenlik mimarisi için GitHub'daki [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) dosyasına bakın.

## Kapsayıcı Sıkılaştırma {#container-hardening}

Kanonik [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) ve [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) Compose dosyaları esas kaynaktır. Üretime kısaltılmış bir örnek kopyalamayın; doğruladığınız sürüm etiketindeki dosyayı dağıtın.

Her iki yığın da aşağıdaki denetimleri uygular:

- Bellek, takas, CPU ve PID sınırları kontrolden çıkan yerel işlemeyi sınırlar.
- Her servis tüm Linux yeteneklerini bırakır. Uygulama yalnızca birim sahipliği, tek yönlü `gosu` kimlik düşürme ve düzgün sinyal iletimi için `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` yeteneklerini geri ekler. PostgreSQL ve Redis yalnızca resmi giriş noktalarının ihtiyaç duyduğu alt kümeyi alır.
- `security_opt: [no-new-privileges:true]`, uygulama, PostgreSQL ve Redis kapsayıcılarındaki işlemlerin ek ayrıcalık kazanmasını önler. Bu, `gosu` ile uyumlu kalır: giriş noktası root olarak başlar, birimleri hazırlar ve yalnızca özel `snapotter` kullanıcısına düşer.
- PostgreSQL ve Redis imaj girdileri özet (digest) ile sabitlenmiştir. Uygulama da `latest` yerine doğrulanmış bir sürüm etiketine veya özete sabitlenmelidir.
- Sağlık denetimleri, sınırlı JSON günlük döndürme, kalıcı Redis AOF ve yeniden başlatma ilkesi kanonik dosyalarda merkezi olarak tanımlanmıştır.

İnternete açık bir dağıtım için 1349 numaralı bağlantı noktasını loopback'e bağlayın ve TLS'i bakımı yapılan bir ters vekil sunucuda sonlandırın. Benzersiz PostgreSQL ve Redis kimlik bilgileri oluşturun, gizli bilgileri korumalı dosyalarda veya bir gizli bilgi yöneticisinde saklayın ve ilk yönetici parolasını hemen değiştirin.

### `read_only` Neden Ayarlanmaz {#why-read-only-is-not-set}

PUID/PGID yeniden eşlemesi başlangıçta `/etc/passwd` ve `/etc/group` dosyalarına yazdığı için `read_only: true` ayarlanmaz. PUID/PGID yerine Docker'ın `--user` bayrağını veya Kubernetes `runAsUser` ayarını kullanırsanız salt okunur bir kök dosya sistemini güvenle etkinleştirebilirsiniz.

## Ağ Yalıtımı {#network-isolation}

Dosya işleme yereldir, ancak varsayılan bir kurulum **dışarıya trafik çıkmayan bir sistem değildir**. Telemetri etkinken anonim ürün analitiği PostHog'u, çökme raporlama ise Sentry'yi kullanır. İkisini de kapatmak için `SNAPOTTER_TELEMETRY=0` ayarlayın (veya analitiği Ayarlar > Sistem > Gizlilik altından devre dışı bırakın). SnapOtter, yüklenen dosyaları, dosya adlarını, OCR çıktısını, belge metnini veya diğer dosya içeriklerini bu olaylara asla dahil etmez.

Diğer giden trafik özellik kaynaklıdır: yapay zeka paketi/model kurulumu imzalı sürüm girdilerini indirir; URL içe aktarma, kullanıcının istediği herkese açık bir URL'yi getirir; açıkça yapılandırılmış OIDC, SAML, OpenTelemetry, webhook'lar, S3 uyumlu depolama veya benzeri entegrasyonlar yöneticinin seçtiği hedeflerle iletişim kurar. Çalışma zamanı model indirmeleri varsayılan olarak devre dışıdır. Otomatik yedek indirmelere açıkça izin vermek için `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` değerini yalnızca bilinçli olarak ayarlayın. Bir [çevrimdışı paket içe aktarma](/tr/guide/deployment), çalışma zamanında model çıkışı olmadan yapay zeka özelliklerini sağlayabilir.

**Güvenlik duvarı önerileri:**

| Senaryo | Giden kural |
|---|---|
| Hava boşluklu (air-gapped) | `SNAPOTTER_TELEMETRY=0` ve `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0` ayarlayın, çevrimdışı yapay zeka paketi içe aktarmayı kullanın, URL içe aktarmayı ve harici entegrasyonları devre dışı bırakın, ardından çıkışı engelleyin |
| Varsayılan telemetri | Tarayıcı/ağ günlüklerinizde listelenen PostHog ve Sentry uç noktalarına izin verin; ilkeniz izin vermiyorsa telemetriyi devre dışı bırakın |
| Yapay zeka paketleri gerekli | Kurulum sırasında `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org` adreslerine HTTPS'e izin verin; ardından bu ana makineleri engelleyin |
| Harici entegrasyonlar | Yalnızca yönetici tarafından yapılandırılmış tam OIDC/SAML/OTLP/webhook/nesne depolama hedeflerine izin verin |

Paket arşivleri Hugging Face'in Xet depolamasından sunulur; bu depolama `*.xethub.hf.co` uç noktaları üzerinden paralel aktarım yapar ve çok GB'lık paket indirmelerini hızlı kılan şeydir. Güvenlik duvarınız `huggingface.co` adresine izin verip `*.xethub.hf.co` adresini engellerse kurulumlar yine başarılı olur ancak daha yavaş, tek akışlı bir indirmeye döner; bu yüzden hızlı yolda kalmak için Xet ana makinelerini izin listesine ekleyin. Tamamen çevrimdışı kurulumlar bunların hepsini atlayıp bunun yerine [Çevrimdışı Paket İçe Aktarma](/tr/guide/deployment) yöntemini kullanabilir.

Ters vekil sunucu yapılandırması için (Nginx, Traefik, Caddy, Cloudflare Tunnels) [Dağıtım rehberine](/tr/guide/deployment#reverse-proxy) bakın.

## Docker Secrets {#docker-secrets}

Üretim dağıtımlarında gizli bilgileri düz metin ortam değişkenleri olarak geçirmekten kaçının. Giriş noktası Docker'ın `_FILE` kuralını destekler: bir gizli bilgiyi dosya olarak bağlayın ve karşılık gelen `_FILE` değişkenini onun yoluna ayarlayın.

**Desteklenen gizli bilgiler:**

| Değişken | `_FILE` karşılığı |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Docker Compose secrets ile örnek:**

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD_FILE=/run/secrets/snapotter_password
      - COOKIE_SECRET_FILE=/run/secrets/cookie_secret
    secrets:
      - snapotter_password
      - cookie_secret

secrets:
  snapotter_password:
    file: ./secrets/snapotter_password.txt
  cookie_secret:
    file: ./secrets/cookie_secret.txt
```

::: tip 
Docker Compose secrets (Swarm olmadan) Compose v2.23 veya üstünü gerektirir.
:::

## Kubernetes Dağıtımı {#kubernetes-deployment}

Giriş noktası, kapsayıcının zaten root olmayan olarak çalıştığını algıladığında (örneğin Kubernetes `runAsUser` ile) gosu ayrıcalık düşürmeyi otomatik olarak atlar. Bu durumda bağlanan birimlerin sahipliğini kendisi değiştiremez; bu yüzden yazılabilir olduklarını doğrular ve değillerse uygulanabilir yönlendirmeyle erken çıkar. `fsGroup` ve yabancı UID kurulumları (TrueNAS, OpenShift) için [Depolama izinleri](/tr/guide/deployment#storage-permissions) sayfasına bakın.

**Önerilen Pod SecurityContext:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: snapotter
spec:
  replicas: 1
  selector:
    matchLabels:
      app: snapotter
  template:
    metadata:
      labels:
        app: snapotter
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        runAsGroup: 999
        fsGroup: 999
      containers:
        - name: snapotter
          image: snapotter/snapotter:latest
          ports:
            - containerPort: 1349
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
          resources:
            requests:
              cpu: "1"
              memory: 2Gi
            limits:
              cpu: "4"
              memory: 6Gi
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 60
            periodSeconds: 30
            timeoutSeconds: 5
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
          volumeMounts:
            - name: data
              mountPath: /data
            - name: workspace
              mountPath: /tmp/workspace
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: snapotter-data
        - name: workspace
          emptyDir:
            medium: Memory
            sizeLimit: 2Gi
```

`runAsUser: 999` pod düzeyinde ayarlandığından giriş noktası gosu'yu tamamen atlar. Bu, `allowPrivilegeEscalation: false` ve `drop: [ALL]` yeteneklerinin çakışma olmadan kullanılmasına olanak tanır.

Kaynak boyutlandırması için [Donanım Gereksinimleri](/tr/guide/deployment#hardware-requirements) sayfasına bakın.

## Yedekleme ve Kurtarma {#backup-and-recovery}

Üretim Compose yığını dört birim tanımlar. PostgreSQL, Redis ve dosya durumunun aynı zaman noktasını yansıtması için eşgüdümlü bir yedek almadan önce girişi durdurun ve etkin işlerin bitmesini bekleyin.

| Birim | İçerik | Kurtarma yaklaşımı |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL kullanıcıları, ayarlar, iş hatları, işler, dosya meta verileri ve denetim günlüğü | Kritik; taşınabilir kurtarma için ilk hatada duran mantıksal bir döküm kullanın |
| `SnapOtter-data` | Kayıtlı kitaplık nesneleri, günlükler ve yapay zeka durumu (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | Birimin tamamını yedekleyin; yer kazanmak için tüm yapay zeka durumunu bilinçli olarak dışarıda bırakıp paketlerini yeniden kurun |
| `SnapOtter-redisdata` | Kalıcı BullMQ kuyruk durumu için Redis AOF | Uygulamayı duraklatıp `SAVE` zorladıktan sonra yedekleyin; kuyruktaki işleri tam olarak sürdürmek için gereklidir |
| `SnapOtter-workspace` | Geçici nesne depolama anahtarları (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | Tüm işler boşaltıldıktan veya iptal edildikten sonra yedeklemeyin; işler etkinken asla atmayın |

Compose normalde birim adlarının başına proje adını ekler. `SnapOtter-data` gibi bir görünen adın Docker birim adı olduğunu varsaymak yerine gerçek kaynak birimi bağlanan kapsayıcıdan çözümleyin.

### Veritabanı yedeği {#database-backup}

PostgreSQL'in özel arşiv biçimini kullanın ve yedeği tamamlanmış saymadan önce arşivi doğrulayın:

```bash
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore only into a fresh/disposable target first; any SQL error fails the command.
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Her yedeği yalıtılmış bir yığına geri yükleyerek, veritabanı kayıtlarını ve dosya sağlama toplamlarını denetleyerek ve uygulamayı başlatarak test edin. Deponun `tests/qa/backup-restore-drill.sh` betiği bu sürüm kapısını açık bir `QA_IMAGE` üzerinde otomatikleştirir.

Platformunuz bunun yerine çökme tutarlı birim anlık görüntüleri alıyorsa önce tüm yığını durdurun ve tüm kritik birimlerin anlık görüntüsünü tek bir küme olarak alın. Çalışan bir kapsayıcıdan ham PostgreSQL veri dizini kopyası, desteklenen bir mantıksal yedek değildir.

### Dosya ve kuyruk yedeği {#file-and-queue-backup}

Dosya ve kuyruk birimlerini yakalamadan önce uygulamayı duraklatın. Gerçek birim adını çözümlemek için `docker inspect` kullanın, Redis'in mevcut durumunu kalıcılaştırmaya zorlayın ve sahiplik ile izinleri koruyarak arşivleyin:

```bash
docker stop SnapOtter
docker exec SnapOtter-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE
docker stop SnapOtter-redis

DATA_VOLUME="$(docker inspect SnapOtter --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
REDIS_VOLUME="$(docker inspect SnapOtter-redis --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"

install -d -m 700 backup
docker run --rm -v "$DATA_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-data.tar.gz -C /source .
docker run --rm -v "$REDIS_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-redis.tar.gz -C /source .
sha256sum backup/snapotter-*.tar.gz > backup/SHA256SUMS
```

Redis'i uygulamadan önce yeniden başlatın. `/data/ai` dizinini bilerek hariç tutuyorsanız, modelleri veya sanal ortamı olmadan bir `installed.json` kaydını korumak yerine tüm yapay zeka alt ağacını kaldırın. Yedek dosyalarını şifreli, erişim denetimli ve SnapOtter'ı çalıştıran ana makineden ayrı tutun.

## Uyumluluk Çıktıları {#compliance-artifacts}

Her SnapOtter sürümü aşağıdaki güvenlik çıktılarını içerir:

| Çıktı | Biçim | Nerede bulunur |
|---|---|---|
| Sürüm konusu bağlama | Kanonik JSON + GitHub onayı (attestation) | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) varlığı: `snapotter-v{version}-release-subjects.json` |
| Arşiv SBOM | CycloneDX ve SPDX JSON | Sürüm varlıkları: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| İmaj SBOM | CycloneDX ve SPDX JSON | Sürüm varlıkları: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Güvenlik açığı taramaları | Trivy JSON | Eşleşen `archive-linux-{arch}` veya `image-linux-{arch}` öneklerine sahip sürüm varlıkları |
| Güvenlik açığı taraması | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) sekmesi |
| Statik analiz | CodeQL (JS/TS + Python) | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) sekmesi, haftalık ve her PR'da çalışır |
| Bağımlılık incelemesi | GitHub yerel | PR başına denetim, yüksek önem derecesindeki eklemelerde başarısız olur |
| Python bağımlılık denetimi | pip-audit | Her push'ta CI çalıştırma günlüğü |
| Güvenlik ilkesi | Markdown | Depodaki [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| Bağımlılık güncellemeleri | Dependabot | npm, pip, Docker, Actions için otomatik haftalık PR'lar |

**Kendi taramanızı çalıştırma:**

Sürüm konusu manifestosunu indirin ve sürüm iş akışı tarafından onaylandığını (attested) doğrulayın:

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Manifesto `releaseTag`, `releaseCommit` ve `workflowTriggerCommit` değerlerini ayrı ayrı kaydeder. `releaseCommit` değerinin değişmez etiketten çözülen commit olduğunu doğrulayın, ardından kullandığınız arşivin, imajın, SBOM'un veya taramanın SHA-256 özetini `subjects` içindeki girdisiyle doğrulayın. Bu ayrım bilinçlidir: yeni oluşturulmuş bir sürüm commit'ini checkout etmek, iş akışının OIDC kimlik bilgisindeki commit kimliğini değiştirmez.

İndirilen bir SBOM'u veya imajı doğrudan da tarayabilirsiniz:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
İmaj SBOM'ları ve taramaları, o sürüm için yayımlanan mimariye özgü imajı birebir yansıtır. Arşiv SBOM'ları ve taramaları, önceden derlenmiş arşivi ayrı olarak tanımlar. Dağıtımdan sonra kurulan yapay zeka model paketleri çalışma zamanında indirildikleri için bu SBOM'lara dahil değildir.
:::
