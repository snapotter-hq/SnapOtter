---
description: "Przewodnik po utwardzaniu bezpieczeństwa SnapOtter. Bezpieczeństwo kontenerów, izolacja sieci, sekrety Docker, wdrożenie Kubernetes i artefakty zgodności."
i18n_source_hash: c682d19a84ce
i18n_provenance: human
i18n_output_hash: 43c9c313b7b1
---

# Bezpieczeństwo i utwardzanie {#security-hardening}

SnapOtter przetwarza pliki w całości w Twojej infrastrukturze. Domyślnie wysyła anonimowe, pozbawione treści analizy produktowe i raporty o awariach, aby pomóc ulepszać projekt. Nigdy nie wysyła Twoich plików, nazw plików, zawartości plików, wyników OCR, metadanych obrazów ani tekstu dokumentów. Opcjonalna opinia jest wysyłana dopiero po przesłaniu jej przez użytkownika, tylko gdy analityka jest włączona, a pola kontaktowe są dołączane wyłącznie za wyraźną zgodą na kontakt. Administrator może wyłączyć zbieranie analityki i opinii jednym kliknięciem w Ustawienia > System > Prywatność, bez konieczności przebudowy. Przetwarzanie plików zawsze pozostaje wewnątrz Twojego kontenera.

Kontener działa jako dedykowany użytkownik bez uprawnień root (`snapotter`) z odrzuconymi wszystkimi możliwościami (capabilities) Linuksa poza minimalnym wymaganym zestawem. Pełną politykę ujawniania podatności i architekturę bezpieczeństwa znajdziesz w [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) na GitHub.

## Utwardzanie kontenera {#container-hardening}

[Domyślny docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) zawiera produkcyjne utwardzanie bezpieczeństwa. Oto omówienie każdej opcji i dlaczego ma znaczenie:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      # Bind to localhost only for internet-facing deployments:
      - "127.0.0.1:1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_PASSWORD=change-me-immediately
      - RATE_LIMIT_PER_MIN=1000
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

    # --- Resource limits ---
    mem_limit: 6g            # Prevents runaway memory from crashing the host
    memswap_limit: 6g        # No swap - fail fast instead of degrading the host
    cpus: 4                  # Cap CPU usage to 4 cores
    pids_limit: 512          # Prevents fork bombs

    # --- Capability restrictions ---
    cap_drop:
      - ALL                  # Drop ALL Linux capabilities first
    cap_add:
      - CHOWN                # Needed for volume permission setup
      - SETUID               # Needed for gosu privilege drop (root -> snapotter)
      - SETGID               # Needed for gosu privilege drop
      - DAC_OVERRIDE         # Needed for volume permission setup
      - FOWNER               # Needed for volume permission setup

    # --- Logging ---
    logging:
      driver: json-file
      options:
        max-size: "50m"      # Rotate logs at 50 MB
        max-file: "5"        # Keep 5 rotated log files

    # --- Health check ---
    healthcheck:
      test: ["CMD", "curl", "-sf", "--max-time", "5", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3

    shm_size: "2gb"          # Required for Python ML shared memory
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

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
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

### Dlaczego `no-new-privileges` nie jest ustawione {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` jest celowo pominięte. Entrypoint startuje jako root, aby naprawić własność wolumenów, a następnie zrzuca uprawnienia do użytkownika `snapotter` przez [gosu](https://github.com/tianon/gosu), co wymaga setuid. Po zakończeniu zrzutu uprawnień proces działa jako `snapotter` z usuniętymi wszystkimi możliwościami poza pięcioma wymienionymi powyżej.

Jeśli używasz Kubernetes lub flagi `--user` Dockera, aby uruchamiać jako non-root bezpośrednio (z pominięciem gosu), `no-new-privileges` można bezpiecznie włączyć.

### Dlaczego `read_only` nie jest ustawione {#why-read-only-is-not-set}

`read_only: true` nie jest ustawione, ponieważ remapowanie PUID/PGID zapisuje do `/etc/passwd` i `/etc/group` przy starcie. Jeśli zamiast PUID/PGID używasz flagi `--user` Dockera lub `runAsUser` w Kubernetes, możesz bezpiecznie włączyć system plików root tylko do odczytu.

## Izolacja sieci {#network-isolation}

Podczas normalnej pracy kontener nie nawiązuje **żadnych wychodzących połączeń sieciowych**. Całe przetwarzanie plików odbywa się lokalnie przy użyciu dołączonych bibliotek.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

Jedynym wyjątkiem są **pobierania modeli AI**: gdy użytkownik instaluje pakiet funkcji AI przez interfejs, kontener pobiera pliki modeli z GitHub Releases i PyPI. Te pobierania odbywają się raz na pakiet i są przechowywane w wolumenie `/data`.

**Rekomendacje dotyczące zapory:**

| Scenariusz | Reguła ruchu wychodzącego |
|---|---|
| Air-gapped (bez AI) | Blokuj cały ruch wychodzący z kontenera |
| Potrzebne pakiety AI | Zezwól na HTTPS do `github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org` podczas instalacji, potem blokuj |
| Po instalacji AI | Blokuj cały ruch wychodzący - modele są zapisane lokalnie w cache |

Konfigurację reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels) opisano w [przewodniku po wdrożeniu](/pl/guide/deployment#reverse-proxy).

## Sekrety Docker {#docker-secrets}

W przypadku wdrożeń produkcyjnych unikaj przekazywania sekretów jako zmiennych środowiskowych w postaci jawnej. Entrypoint obsługuje konwencję `_FILE` Dockera: zamontuj sekret jako plik i ustaw odpowiednią zmienną `_FILE` na jego ścieżkę.

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

## Wdrożenie Kubernetes {#kubernetes-deployment}

Entrypoint wykrywa, kiedy kontener już działa jako non-root (np. przez `runAsUser` w Kubernetes) i automatycznie pomija zrzut uprawnień gosu. W takim przypadku nie może sam wykonać chown na zamontowanych wolumenach, więc weryfikuje, czy są zapisywalne, i kończy działanie wcześnie z pomocnymi wskazówkami, jeśli nie są. Zobacz [Uprawnienia pamięci masowej](/pl/guide/deployment#storage-permissions) dla `fsGroup` oraz konfiguracji z obcym UID (TrueNAS, OpenShift).

**Zalecany SecurityContext poda:**

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

Ponieważ `runAsUser: 999` jest ustawione na poziomie poda, entrypoint całkowicie pomija gosu. Pozwala to bez konfliktów włączyć możliwości `allowPrivilegeEscalation: false` i `drop: [ALL]`.

Informacje o doborze zasobów znajdziesz w [Wymaganiach sprzętowych](/pl/guide/deployment#hardware-requirements).

## Kopie zapasowe i odzyskiwanie {#backup-and-recovery}

Trwały stan jest podzielony na dwa wolumeny:

| Wolumen | Zawartość | Krytyczny? |
|---|---|---|
| `SnapOtter-pgdata` | Baza danych PostgreSQL (użytkownicy, ustawienia, pipeline'y, zadania, dziennik audytu) | Tak |
| `/data` (wolumen aplikacji) | Pliki przesłane przez użytkowników, modele AI, venv Pythona | Częściowo (patrz niżej) |

Wewnątrz wolumenu `/data`:

| Ścieżka | Zawartość | Krytyczny? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Pliki użytkowników i wyniki przetwarzania | Tak |
| `/data/ai/` | Pobrane pliki modeli AI | Nie (do ponownego pobrania) |
| `/data/venv/` | Wirtualne środowisko Pythona | Nie (odbudowywane przy starcie) |

### Kopia zapasowa bazy danych {#database-backup}

Użyj `pg_dump`, aby wykonać kopię zapasową bazy danych podczas działania stosu:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Alternatywnie zatrzymaj stos i wykonaj migawkę wolumenu `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Kopia zapasowa plików użytkowników {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

Modele AI zajmują łącznie do około 24 GB dla wszystkich pakietów. Ponieważ można je pobrać ponownie, wyklucz `/data/ai/` i `/data/venv/` z kopii zapasowych, aby zaoszczędzić miejsce. Krytyczne są tylko baza danych i pliki użytkowników.

## Artefakty zgodności {#compliance-artifacts}

Każde wydanie SnapOtter zawiera następujące artefakty bezpieczeństwa:

| Artefakt | Format | Gdzie go znaleźć |
|---|---|---|
| SBOM (CycloneDX) | JSON | Zasób [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | Zasób [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| Skan podatności | Trivy JSON | Zasób [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| Skan podatności | SARIF | Zakładka [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Analiza statyczna | CodeQL (JS/TS + Python) | Zakładka [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), uruchamiana co tydzień + przy każdym PR |
| Przegląd zależności | Natywny GitHub | Sprawdzenie przy każdym PR, kończy się niepowodzeniem przy dodaniu zależności o wysokiej ważności |
| Audyt zależności Pythona | pip-audit | Log przebiegu CI przy każdym pushu |
| Polityka bezpieczeństwa | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) w repozytorium |
| Aktualizacje zależności | Dependabot | Automatyczne cotygodniowe PR-y dla npm, pip, Docker, Actions |

**Uruchamianie własnego skanu:**

Pobierz SBOM z wydania i przeskanuj go preferowanym narzędziem:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM i skan podatności odzwierciedlają dokładny obraz opublikowany dla danego wydania. Pakiety modeli AI zainstalowane po wdrożeniu nie są uwzględnione w SBOM, ponieważ są pobierane w czasie działania.
:::
