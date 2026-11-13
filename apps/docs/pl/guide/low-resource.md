---
i18n_source_hash: b859c4f3b301
i18n_provenance: machine
i18n_output_hash: e6110005f438
i18n_hash_version: 2
---
# Konfiguracje o ograniczonych zasobach {#low-resource-setups}

SnapOtter dobrze działa na małym sprzęcie: Raspberry Pi 4 lub 5, starym laptopie albo VPS z 2 GB pamięci. Ta strona to praktyczny przewodnik dla takich maszyn: czego można oczekiwać, gotowa do skopiowania konfiguracja z rozsądnymi limitami oraz funkcje, które warto pominąć. Pełne dane z testów wydajności stojące za tymi liczbami znajdują się w [Wymagania sprzętowe](/pl/guide/deployment#hardware-requirements).

Dwa twarde ograniczenia na początek:

- **Tylko 64-bitowe systemy.** Obraz jest budowany dla `linux/amd64` i `linux/arm64`. 32-bitowe ARM (`armv7`/`armhf`) nie jest obsługiwane, więc Raspberry Pi pierwszej generacji i rodzina Pi Zero odpadają.
- **Minimum 2 GB pamięci (narzędzia bez AI).** 512 MB nie wystarcza do uruchomienia stosu, a 1 GB zawodzi przy partiach wielu plików. 2 GB z 2 rdzeniami to najmniejsza konfiguracja, na której narzędzia bez AI działają komfortowo.

## Co działa dobrze na małym sprzęcie {#what-runs-well}

Wszystkie narzędzia bez AI działają na maszynie z 2 GB i 2 rdzeniami: cała sekcja Obraz i Pliki, narzędzia PDF oraz operacje wideo i audio z kopiowaniem strumienia (przycinanie, wyciszanie, remux kontenera). Większość kończy się w mniej niż sekundę.

Dwa rodzaje obciążenia są wyjątkami:

- **Ponowne kodowanie wideo** (konwersja między kodekami) jest ograniczone przez CPU. Klip 1080p, który na szybkim procesorze stacjonarnym zajmuje ok. 40 s, na procesorze klasy Pi może trwać kilka minut. Operacje z kopiowaniem strumienia pozostają natychmiastowe.
- **Narzędzia AI** mają progi pamięci CPU dla każdego pakietu: 2 GB pamięci RAM hosta (0,5 GB wolne) dla wykrywania twarzy i wbudowanego szybkiego OCR, 4 GiB skonfigurowanej efektywnej pamięci dla dokładnego OCR, 4 GB pamięci RAM hosta (2 do 3 GB wolne) dla transkrypcji, Object Eraser i Colorize, usuwania tła, powiększania i poprawiania oraz renowacji zdjęć, a także 8 GB pamięci RAM hosta (6 GB wolne) dla wysokiej jakości inpaintingu. Maszyna z 2 GB nie uruchomi Whisper, RealESRGAN, rembg ani LaMa bez zabicia procesu przez OOM, dlatego SnapOtter sprawdza wolną pamięć przed przekazaniem zadania do sidecara Python i natychmiast odrzuca uruchomienia poniżej progu pakietu.

Żadne z nich nie jest instalowane ani uruchomione, dopóki z niego nie skorzystano: bez zainstalowanych pakietów AI aplikacja w stanie spoczynku zajmuje około 360 MB, a pakiety AI są pobierane dopiero po włączeniu przez administratora.

## Instalacja na Raspberry Pi / starym laptopie {#walkthrough}

To standardowa instalacja Compose z [Pierwsze kroki](/pl/guide/getting-started), uzupełniona o limity zasobów i zachowawcze ograniczenia. Zakłada 64-bitowy system operacyjny (na Pi: Raspberry Pi OS 64-bit lub Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@db:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@db:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-snapotter}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      - POSTGRES_DB=${POSTGRES_DB:-snapotter}
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Uwagi dla maszyn klasy Pi:

- **Dla woluminu danych i Postgres lepiej wybrać dysk SSD USB niż kartę SD.** Przestrzenie robocze zadań generują realne operacje dyskowe, a karty SD są zarówno wolne, jak i szybko się zużywają.
- **Kontener all-in-one również tu działa** (wbudowane Postgres i Redis, gdy `DATABASE_URL`/`REDIS_URL` nie są ustawione), a na hoście z ograniczoną pamięcią warto obniżyć limit jego wbudowanego Redis przez `REDIS_MAXMEMORY` (zobacz [Konfiguracja](/pl/guide/configuration)). Compose daje dokładniejszą kontrolę nad każdą usługą, dlatego ta instrukcja z niego korzysta.
- **Na urządzeniach z 2 GB należy dodać swap.** Zapobiega to sytuacji, w której sporadyczny skok zużycia (duży PDF, zapomniana partia bez limitu) kończy się zabiciem procesu z powodu braku pamięci. zram to opcja przyjazna dla kart SD.
- Obraz arm64 działa wyłącznie na CPU, na płytkach ARM nie ma CUDA.

## Pokrętła strojenia {#tuning-knobs}

Wszystkie limity to zmienne środowiskowe, w pełni opisane w [Konfiguracja](/pl/guide/configuration). `0` oznacza brak limitu lub automatykę. Te, które mają znaczenie na małym sprzęcie:

| Zmienna | Sugestia dla małej maszyny | Co chroni |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Ile zadań działa równolegle. Automatyczne wykrywanie przyjmuje liczbę rdzeni CPU minus jeden, co jest w porządku na dużych maszynach, a zbyt ambitne na maszynie z 2 rdzeniami pod presją pamięci. |
| `MAX_WORKER_THREADS` | `2` | Pula wątków przetwarzania obrazów. |
| `MAX_BATCH_SIZE` | `5` | Partie to miejsce, w którym maszynom z 1-2 GB najpierw kończy się pamięć. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Chroni przed zajęciem całej przestrzeni roboczej przez jeden ogromny plik. |
| `MAX_MEGAPIXELS` | `50` | Dekodowanie obrazu powyżej 100 MP kosztuje pamięć RAM niezależnie od rozmiaru pliku. |
| `MAX_VIDEO_DURATION_S` | `300` | Długie transkodowania blokują mały CPU na minuty lub godziny. |
| `PROCESSING_TIMEOUT_S` | `600` | Twardy limit, dzięki któremu zbiegłe zadanie w końcu zwolni maszynę. |

Te limity dotyczą tego, co serwer przyjmuje, więc należy ustawić je zgodnie z faktycznym użyciem, a nie jak najmniejsze. Jeśli wideo nie jest używane, limit `MAX_VIDEO_DURATION_S` nic nie kosztuje. Jeśli dokumenty są skanowane codziennie, nie należy ograniczać `MAX_PDF_PAGES`.

## Co pominąć {#what-to-skip}

- **Ciężkie pakiety AI.** Powiększanie, renowacja zdjęć i usuwanie tła wymagają GPU lub szybkiego wielordzeniowego CPU, a każdy pakiet zajmuje 4-5 GB dysku. Na małej maszynie najlepiej ich po prostu nie instalować. Narzędzia, których pakietu brakuje, pokazują monit o instalację zamiast się uruchamiać.
- **Ponowne kodowanie wideo jako rutynowe obciążenie.** Okazjonalne transkodowanie jest w porządku (jest po prostu wolne). Stała kolejka transkodowania wymaga rdzeni CPU, a nie Pi.
- **Ogólnie nieużywane narzędzia.** Administrator może wyłączać pojedyncze narzędzia w Settings, co usuwa je z interfejsu i wstrzymuje rejestrowanie ich tras API. Samo to nie oszczędza pamięci, ale chroni współdzieloną małą instancję przed użyciem do jedynego obciążenia, którego sprzęt nie udźwignie.

Jeśli instancja zostanie później przeniesiona na mocniejszy sprzęt, należy usunąć limity (przywrócić je do `0`), a ten sam wolumin danych zostanie przeniesiony.
