---
i18n_source_hash: b859c4f3b301
i18n_provenance: machine
i18n_output_hash: dd83f5f117df
i18n_hash_version: 2
---
# Setups met weinig resources {#low-resource-setups}

SnapOtter draait goed op kleine hardware: een Raspberry Pi 4 of 5, een oude laptop of een VPS met 2 GB. Deze pagina is de praktische handleiding voor die machines: wat u kunt verwachten, een kopieerklare setup met verstandige limieten en welke functies u beter overslaat. De volledige benchmarkdata achter deze getallen staat in [Hardwarevereisten](/nl/guide/deployment#hardware-requirements).

Twee harde beperkingen vooraf:

- **Alleen 64-bit.** De image is gebouwd voor `linux/amd64` en `linux/arm64`. 32-bit ARM (`armv7`/`armhf`) wordt niet ondersteund, dus de eerste generatie Pi's en de Pi Zero-familie vallen af.
- **Ondergrens van 2 GB geheugen (niet-AI-tools).** Met 512 MB start de stack niet en met 1 GB mislukken batches met meerdere bestanden. 2 GB met 2 cores is de kleinste configuratie waarop de niet-AI-tools comfortabel draaien.

## Wat goed draait op kleine hardware {#what-runs-well}

Elke niet-AI-tool werkt op een machine met 2 GB / 2 cores: de hele sectie Afbeelding en Bestanden, PDF-tools en de video- en audiobewerkingen met stream-copy (knippen, dempen, container-remux). De meeste zijn in minder dan een seconde klaar.

Twee workloads zijn uitzonderingen:

- **Video opnieuw coderen** (converteren tussen codecs) is CPU-gebonden. Een 1080p-clip die op een snelle desktop-CPU ongeveer 40 s duurt, kan op een CPU van Pi-klasse enkele minuten duren. Stream-copy-bewerkingen blijven direct.
- **AI-tools** hebben per bundel een ondergrens voor CPU-geheugen: 2 GB host-RAM (0,5 GB vrij) voor gezichtsdetectie en de ingebouwde snelle OCR, 4 GiB geconfigureerd effectief geheugen voor nauwkeurige OCR, 4 GB host-RAM (2 tot 3 GB vrij) voor transcriptie, Object Eraser & Colorize, achtergrondverwijdering, Upscale & Enhance en fotorestauratie, en 8 GB host-RAM (6 GB vrij) voor High-Quality Inpainting. Een machine met 2 GB kan Whisper, RealESRGAN, rembg of LaMa niet draaien zonder door OOM te worden afgebroken, dus SnapOtter controleert het vrije geheugen voordat het naar de Python-sidecar verstuurt en weigert uitvoeringen onder de ondergrens van de bundel direct.

Geen van beide is geïnstalleerd of actief tenzij u het gebruikt: zonder geïnstalleerde AI-bundels gebruikt de app in rust ongeveer 360 MB, en AI-bundels worden pas gedownload wanneer een beheerder ze inschakelt.

## Handleiding voor Raspberry Pi / oude laptop {#walkthrough}

Dit is de standaard Compose-installatie uit [Aan de slag](/nl/guide/getting-started), plus resourcelimieten en behoudende maxima. Het gaat uit van een 64-bit besturingssysteem (op een Pi: Raspberry Pi OS 64-bit of Ubuntu Server arm64).

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

Opmerkingen voor machines van Pi-klasse:

- **Geef de voorkeur aan een USB-SSD boven een SD-kaart** voor het datavolume en Postgres. Jobwerkruimtes doen echte schijf-I/O, en SD-kaarten zijn zowel traag als snel versleten.
- **De all-in-one enkele container werkt hier ook** (embedded Postgres en Redis wanneer `DATABASE_URL`/`REDIS_URL` niet zijn ingesteld), en op een host met beperkt geheugen verlaagt u de limiet van de embedded Redis met `REDIS_MAXMEMORY` (zie [Configuratie](/nl/guide/configuration)). Compose geeft u fijnmaziger controle per service, en daarom gebruikt deze handleiding het.
- **Voeg swap toe op apparaten met 2 GB.** Zo eindigt een incidentele piek (een grote PDF, een batch waarvan u vergat de omvang te beperken) niet in een out-of-memory-kill. zram is de optie die vriendelijk is voor SD-kaarten.
- De arm64-image gebruikt alleen de CPU; op ARM-boards is geen CUDA beschikbaar.

## De afstelknoppen {#tuning-knobs}

Alle limieten zijn omgevingsvariabelen, volledig beschreven in [Configuratie](/nl/guide/configuration). `0` betekent onbeperkt of automatisch. De variabelen die op kleine hardware van belang zijn:

| Variabele | Suggestie voor kleine machine | Wat het beschermt |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Hoeveel jobs parallel draaien. Automatische detectie gebruikt het aantal CPU-cores min één, wat prima is op grote machines en te gretig op een machine met 2 cores onder geheugendruk. |
| `MAX_WORKER_THREADS` | `2` | Threadpool voor beeldverwerking. |
| `MAX_BATCH_SIZE` | `5` | Bij batches loopt het geheugen van machines met 1-2 GB het eerst vol. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Voorkomt dat één enorm bestand de hele werkruimte bezet. |
| `MAX_MEGAPIXELS` | `50` | Het decoderen van een afbeelding van 100+ MP kost RAM, ongeacht de bestandsgrootte. |
| `MAX_VIDEO_DURATION_S` | `300` | Lange transcodes monopoliseren een kleine CPU gedurende minuten tot uren. |
| `PROCESSING_TIMEOUT_S` | `600` | Harde bovengrens zodat een op hol geslagen job de machine uiteindelijk vrijgeeft. |

Deze limieten gelden voor wat de server accepteert, dus stel ze in op wat u daadwerkelijk gebruikt in plaats van zo klein mogelijk. Als u nooit video gebruikt, kost een limiet van `MAX_VIDEO_DURATION_S` niets; scant u dagelijks documenten, beperk `MAX_PDF_PAGES` dan niet.

## Wat u beter overslaat {#what-to-skip}

- **Zware AI-bundels.** Opschalen, fotorestauratie en achtergrondverwijdering vragen om een GPU of een snelle CPU met veel cores, en elke bundel kost 4-5 GB schijfruimte. Installeer ze op een kleine machine simpelweg niet; tools waarvan de bundel ontbreekt tonen een installatieprompt in plaats van te draaien.
- **Video opnieuw coderen als routinematige workload.** Af en toe transcoderen is prima (het is alleen traag); een constante transcodewachtrij vraagt om CPU-cores, niet om een Pi.
- **Ongebruikte tools in het algemeen.** Een beheerder kan afzonderlijke tools uitschakelen in Settings, waardoor ze uit de interface verdwijnen en hun API-routes niet meer worden geregistreerd. Dat bespaart op zichzelf geen geheugen, maar het voorkomt dat een gedeelde kleine instantie wordt gebruikt voor de ene workload die de hardware niet aankan.

Als u de instantie later naar grotere hardware verhuist, verwijdert u de limieten (zet ze terug op `0`) en kan hetzelfde datavolume mee.
