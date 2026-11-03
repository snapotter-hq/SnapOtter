---
description: "Przewodnik utwardzania bezpieczeństwa SnapOtter. Bezpieczeństwo kontenera, izolacja sieci, sekrety Docker, wdrożenie w Kubernetes i artefakty zgodności."
i18n_source_hash: 5cf773ddb4c0
i18n_provenance: machine
i18n_output_hash: 29ec324a8903
i18n_hash_version: 2
---

# Bezpieczeństwo i utwardzanie {#security-hardening}

SnapOtter przetwarza pliki w całości w Twojej infrastrukturze. Domyślnie wysyła anonimowe, pozbawione treści dane analityczne produktu i raporty o awariach, aby pomagać w rozwoju projektu. Nigdy nie wysyła plików, ich nazw, zawartości, wyników OCR, metadanych obrazów ani tekstu dokumentów. Opcjonalna opinia jest wysyłana dopiero po jej przesłaniu przez użytkownika, tylko gdy analityka jest włączona, a pola kontaktowe są dołączane wyłącznie za wyraźną zgodą na kontakt. Administrator może jednym kliknięciem wyłączyć analitykę i zbieranie opinii w Settings > System > Privacy, bez przebudowy. Przetwarzanie plików zawsze odbywa się wewnątrz kontenera.

Kontener działa jako dedykowany użytkownik bez uprawnień roota (`snapotter`), a wszystkie uprawnienia (capabilities) systemu Linux są odebrane poza minimalnym wymaganym zestawem. Pełna polityka ujawniania podatności i architektura bezpieczeństwa są opisane w [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) na GitHub.

## Utwardzanie kontenera {#container-hardening}

Kanoniczne pliki Compose dla [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) i [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) są źródłem prawdy. Nie należy kopiować skróconego przykładu do środowiska produkcyjnego, tylko wdrażać plik z zweryfikowanego tagu wydania.

Oba stosy stosują następujące zabezpieczenia:

- Limity pamięci, swap, CPU i PID ograniczają skutki niekontrolowanego przetwarzania natywnego.
- Każda usługa odrzuca wszystkie uprawnienia Linux. Aplikacja dodaje z powrotem tylko `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` na potrzeby własności woluminów, jednokierunkowego zrzucenia tożsamości `gosu` i prawidłowego przekazywania sygnałów. PostgreSQL i Redis dostają tylko podzbiór potrzebny ich oficjalnym punktom wejścia.
- `security_opt: [no-new-privileges:true]` uniemożliwia procesom w kontenerach aplikacji, PostgreSQL i Redis zdobywanie dodatkowych uprawnień. Pozostaje to zgodne z `gosu`: punkt wejścia startuje jako root, przygotowuje woluminy i dopiero potem przechodzi na dedykowanego użytkownika `snapotter`.
- Dane wejściowe obrazów PostgreSQL i Redis są przypięte przez digest. Aplikację również należy przypiąć do zweryfikowanego tagu wydania lub digestu zamiast do `latest`.
- Kontrole stanu, ograniczona rotacja logów JSON, trwały Redis AOF i polityka restartów są zdefiniowane centralnie w plikach kanonicznych.

W przypadku wdrożenia dostępnego z internetu należy powiązać port 1349 z loopback i kończyć TLS na utrzymywanym zwrotnym serwerze proxy. Należy wygenerować unikalne dane uwierzytelniające PostgreSQL i Redis, przechowywać sekrety w chronionych plikach lub menedżerze sekretów oraz zmienić początkowe hasło administratora natychmiast.

### Dlaczego `read_only` nie jest ustawione {#why-read-only-is-not-set}

`read_only: true` nie jest ustawione, ponieważ remapowanie PUID/PGID zapisuje do `/etc/passwd` i `/etc/group` przy starcie. Jeśli zamiast PUID/PGID używana jest flaga Docker `--user` lub `runAsUser` w Kubernetes, można bezpiecznie włączyć główny system plików tylko do odczytu.

## Izolacja sieci {#network-isolation}

Przetwarzanie plików jest lokalne, ale domyślna instalacja **nie jest systemem bez ruchu wychodzącego**. Anonimowa analityka produktu korzysta z PostHog, a raportowanie awarii z Sentry, gdy telemetria jest włączona. Ustawienie `SNAPOTTER_TELEMETRY=0` (lub wyłączenie analityki w Settings > System > Privacy) wyłącza oba. SnapOtter nigdy nie umieszcza przesłanych plików, ich nazw, wyników OCR, tekstu dokumentów ani innej zawartości plików w tych zdarzeniach.

Pozostały ruch wychodzący zależy od funkcji: instalacja pakietów i modeli AI pobiera podpisane dane wydania, import z URL pobiera publiczny URL wskazany przez użytkownika, a jawnie skonfigurowane integracje OIDC, SAML, OpenTelemetry, webhooki, magazyn zgodny z S3 lub podobne łączą się z miejscami wybranymi przez administratora. Pobieranie modeli w czasie działania jest domyślnie wyłączone. Ustawienie `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` należy stosować tylko po to, by jawnie włączyć automatyczne pobieranie zapasowe. [Import pakietu offline](/pl/guide/deployment) może udostępnić funkcje AI bez ruchu wychodzącego dla modeli w czasie działania.

**Zalecenia dla zapory sieciowej:**

| Scenariusz | Reguła ruchu wychodzącego |
|---|---|
| Środowisko odizolowane (air-gapped) | Ustawić `SNAPOTTER_TELEMETRY=0` i `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, użyć importu pakietu AI offline, wyłączyć import z URL i integracje zewnętrzne, a następnie zablokować ruch wychodzący |
| Domyślna telemetria | Zezwolić na punkty końcowe PostHog i Sentry widoczne w logach przeglądarki/sieci. Wyłączyć telemetrię, jeśli polityka na to nie pozwala |
| Wymagane pakiety AI | Podczas instalacji zezwolić na HTTPS do `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`, a następnie zablokować te hosty |
| Integracje zewnętrzne | Zezwolić tylko na dokładne miejsca docelowe OIDC/SAML/OTLP/webhook/magazynu obiektów skonfigurowane przez administratora |

Archiwa pakietów są serwowane z magazynu Xet w Hugging Face, który przesyła dane równolegle przez punkty końcowe `*.xethub.hf.co` i dzięki temu pobieranie wielogigabajtowych pakietów jest szybkie. Jeśli zapora zezwala na `huggingface.co`, ale blokuje `*.xethub.hf.co`, instalacje nadal się udają, ale wracają do wolniejszego pobierania jednym strumieniem, więc hosty Xet należy dodać do listy dozwolonych, aby zachować szybką ścieżkę. Instalacje w pełni offline mogą to pominąć i skorzystać z [Importu pakietu offline](/pl/guide/deployment).

Konfigurację zwrotnego serwera proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels) opisano w [Przewodnik wdrażania](/pl/guide/deployment#reverse-proxy).

## Sekrety Docker {#docker-secrets}

W środowiskach produkcyjnych należy unikać przekazywania sekretów jako zmiennych środowiskowych w postaci jawnego tekstu. Punkt wejścia obsługuje konwencję Docker `_FILE`: sekret montuje się jako plik, a odpowiednią zmienną `_FILE` ustawia na jego ścieżkę.

**Obsługiwane sekrety:**

| Zmienna | Odpowiednik `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Przykład z sekretami Docker Compose:**

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
Sekrety Docker Compose (bez Swarm) wymagają Compose w wersji 2.23 lub nowszej.
:::

## Wdrożenie w Kubernetes {#kubernetes-deployment}

Punkt wejścia wykrywa, że kontener już działa bez uprawnień roota (np. przez `runAsUser` w Kubernetes), i automatycznie pomija zrzucenie uprawnień przez gosu. W takim przypadku sam nie może wykonać chown na zamontowanych woluminach, więc sprawdza, czy są zapisywalne, i kończy działanie wcześnie ze wskazówkami, jeśli nie są. Zobacz [Uprawnienia magazynu](/pl/guide/deployment#storage-permissions) dla `fsGroup` i konfiguracji z obcym UID (TrueNAS, OpenShift).

**Zalecany Pod SecurityContext:**

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

Ponieważ `runAsUser: 999` jest ustawione na poziomie poda, punkt wejścia całkowicie pomija gosu. Pozwala to na uprawnienia `allowPrivilegeEscalation: false` i `drop: [ALL]` bez konfliktu.

Wymiarowanie zasobów opisano w [Wymagania sprzętowe](/pl/guide/deployment#hardware-requirements).

## Kopie zapasowe i odzyskiwanie {#backup-and-recovery}

Produkcyjny stos Compose definiuje cztery woluminy. Przed wykonaniem skoordynowanej kopii zapasowej należy zatrzymać ruch przychodzący i poczekać na zakończenie aktywnych zadań, aby PostgreSQL, Redis i stan plików opisywały ten sam moment w czasie.

| Wolumin | Zawartość | Sposób odzyskiwania |
|---|---|---|
| `SnapOtter-pgdata` | Użytkownicy PostgreSQL, ustawienia, potoki, zadania, metadane plików i dziennik audytu | Krytyczny. Do przenośnego odzyskiwania należy użyć zrzutu logicznego kończącego się natychmiast przy błędzie |
| `SnapOtter-data` | Zapisane obiekty biblioteki, logi i stan AI (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | Kopię należy wykonać dla całego woluminu. Aby oszczędzić miejsce, można celowo pominąć cały stan AI i zainstalować pakiety ponownie |
| `SnapOtter-redisdata` | Redis AOF dla trwałego stanu kolejki BullMQ | Kopię należy wykonać po wstrzymaniu aplikacji i wymuszeniu `SAVE`. Wymagany, aby dokładnie wznowić zadania w kolejce |
| `SnapOtter-workspace` | Tymczasowe klucze magazynu obiektów (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | Nie wykonywać kopii po opróżnieniu lub anulowaniu wszystkich zadań. Nigdy nie odrzucać, gdy zadania są aktywne |

Compose zwykle dodaje do nazw woluminów prefiks z nazwą projektu. Rzeczywisty wolumin źródłowy należy ustalić z zamontowanego kontenera, zamiast zakładać, że nazwa wyświetlana, taka jak `SnapOtter-data`, jest nazwą woluminu Docker.

### Kopia zapasowa bazy danych {#database-backup}

Należy użyć niestandardowego formatu archiwum PostgreSQL i zweryfikować archiwum, zanim kopia zostanie uznana za kompletną:

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

Każdą kopię zapasową należy przetestować, przywracając ją do odizolowanego stosu, sprawdzając rekordy bazy danych i sumy kontrolne plików oraz uruchamiając aplikację. `tests/qa/backup-restore-drill.sh` w repozytorium automatyzuje tę bramkę wydania względem jawnego `QA_IMAGE`.

Jeśli platforma wykonuje migawki woluminów spójne po awarii, należy najpierw zatrzymać cały stos i wykonać migawkę wszystkich krytycznych woluminów jako jednego zestawu. Surowa kopia katalogu danych PostgreSQL z działającego kontenera nie jest obsługiwaną logiczną kopią zapasową.

### Kopia zapasowa plików i kolejki {#file-and-queue-backup}

Aplikację należy wstrzymać przed przechwyceniem woluminów plików i kolejki. Użyć `docker inspect`, aby ustalić rzeczywistą nazwę woluminu, wymusić zapis bieżącego stanu Redis i zarchiwizować z zachowaniem właściciela i uprawnień:

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

Redis należy uruchomić ponownie przed aplikacją. Jeśli `/data/ai` jest celowo pomijane, należy usunąć całe drzewo AI, zamiast zachowywać rekord `installed.json` bez jego modeli lub środowiska wirtualnego. Pliki kopii zapasowych powinny być szyfrowane, objęte kontrolą dostępu i przechowywane oddzielnie od hosta, na którym działa SnapOtter.

## Artefakty zgodności {#compliance-artifacts}

Każde wydanie SnapOtter zawiera następujące artefakty bezpieczeństwa:

| Artefakt | Format | Gdzie go znaleźć |
|---|---|---|
| Powiązanie podmiotu wydania | Kanoniczny JSON + atestacja GitHub | Zasób [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| SBOM archiwum | CycloneDX i SPDX JSON | Zasoby wydania: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| SBOM obrazu | CycloneDX i SPDX JSON | Zasoby wydania: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Skany podatności | Trivy JSON | Zasoby wydania z pasującymi prefiksami `archive-linux-{arch}` lub `image-linux-{arch}` |
| Skan podatności | SARIF | Karta [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Analiza statyczna | CodeQL (JS/TS + Python) | Karta [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), uruchamiana co tydzień i dla każdego PR |
| Przegląd zależności | Natywny GitHub | Kontrola dla każdego PR, kończy się błędem przy dodaniu zależności o wysokiej ważności |
| Audyt zależności Python | pip-audit | Log przebiegu CI przy każdym pushu |
| Polityka bezpieczeństwa | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) w repozytorium |
| Aktualizacje zależności | Dependabot | Cotygodniowe automatyczne PR dla npm, pip, Docker, Actions |

**Uruchamianie własnego skanu:**

Należy pobrać manifest podmiotu wydania i zweryfikować, że został poświadczony przez przepływ pracy wydania:

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Manifest zapisuje osobno `releaseTag`, `releaseCommit` i `workflowTriggerCommit`. Należy zweryfikować, że `releaseCommit` jest commitem wyłuskanym z niezmiennego tagu, a następnie zweryfikować skrót SHA-256 archiwum, obrazu, SBOM lub skanu, z którego korzystamy, względem jego wpisu w `subjects`. To rozróżnienie jest zamierzone: pobranie nowo utworzonego commita wydania nie zmienia tożsamości commita w poświadczeniu OIDC przepływu pracy.

Można też przeskanować pobrany SBOM lub bezpośrednio obraz:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
SBOM-y i skany obrazów odzwierciedlają dokładnie obraz dla konkretnej architektury opublikowany w danym wydaniu. SBOM-y i skany archiwum opisują osobno gotowe archiwum. Pakiety modeli AI instalowane po wdrożeniu nie są uwzględnione w tych SBOM-ach, ponieważ są pobierane w czasie działania.
:::
