---
i18n_source_hash: f5de74aee1b9
i18n_provenance: machine
i18n_output_hash: ac770c68d171
---
# Setups met beperkte resources {#low-resource-setups}

SnapOtter draait goed op kleine hardware: een Raspberry Pi 4 of 5, een oude laptop of een VPS met 2 GB. Deze pagina is de praktische gids voor die machines: wat je kunt verwachten, een copy-paste-setup met verstandige limieten, en welke functies je beter overslaat. De volledige benchmarkdata achter deze cijfers vind je in [Hardwarevereisten](/nl/guide/deployment#hardware-requirements).

Twee harde beperkingen vooraf:

- **Uitsluitend 64-bit.** De image wordt gebouwd voor `linux/amd64` en `linux/arm64`. 32-bit ARM (`armv7`/`armhf`) wordt niet ondersteund, dus Pi's van de eerste generatie en de Pi Zero-familie vallen af.
- **Geheugenondergrens van 2 GB.** Met 512 MB start de stack niet, en 1 GB faalt bij batches met meerdere bestanden. 2 GB met 2 cores is de kleinste configuratie die comfortabel werkt.

## Wat goed draait op kleine hardware {#what-runs-well}

Elke niet-AI-tool werkt op een machine met 2 GB en 2 cores: de volledige secties Afbeelding en Bestanden, de PDF-tools en de stream-copy-bewerkingen voor video en audio (trimmen, dempen, container-remux). De meeste zijn binnen een seconde klaar.

Twee workloads vormen de uitzondering:

- **Video-hercodering** (converteren tussen codecs) is CPU-gebonden. Een 1080p-clip die op een snelle desktop-CPU ~40 s duurt, kan op een CPU van Pi-klasse enkele minuten duren. Stream-copy-bewerkingen blijven direct.
- **AI-tools** hebben RAM (4 GB aanbevolen) en schijfruimte nodig (de grotere bundels zijn elk 4-5 GB), en de zware (opschaling, fotorestauratie, achtergrondverwijdering) zijn niet praktisch op CPU's van Pi-klasse. Lichte AI zoals gezichtsdetectie en OCR is bruikbaar als je er het geheugen voor hebt.

Geen van beide wordt geïnstalleerd of draait tenzij je het gebruikt: zonder geïnstalleerde AI-bundels draait de app inactief rond de 360 MB, en AI-bundels worden pas gedownload wanneer een beheerder ze inschakelt.

## Stappenplan voor Raspberry Pi / oude laptop {#walkthrough}

Dit is de standaard Compose-installatie uit [Aan de slag](/nl/guide/getting-started), plus resourcelimieten en conservatieve limieten. Het gaat uit van een 64-bit besturingssysteem (op een Pi: Raspberry Pi OS 64-bit of Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@db:5432/snapotter
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
      - POSTGRES_USER=snapotter
      - POSTGRES_PASSWORD=snapotter
      - POSTGRES_DB=snapotter
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Aandachtspunten voor machines van Pi-klasse:

- **Kies een USB-SSD boven een SD-kaart** voor het datavolume en Postgres. Job-werkruimtes doen echte disk-IO, en SD-kaarten zijn zowel traag als snel versleten.
- **De alles-in-één-container werkt hier ook** (embedded Postgres en Redis wanneer `DATABASE_URL`/`REDIS_URL` niet zijn ingesteld), en op een host met weinig geheugen kun je de limiet van de embedded Redis het best verlagen met `REDIS_MAXMEMORY` (zie [Configuratie](/nl/guide/configuration)). Compose geeft je fijnere controle per service, en daarom gebruikt dit stappenplan Compose.
- **Voeg swap toe op apparaten met 2 GB.** Dat voorkomt dat een incidentele piek (een grote PDF, een batch die je vergat te begrenzen) eindigt in een out-of-memory-kill. zram is de SD-kaartvriendelijke optie.
- De arm64-image is uitsluitend CPU; er is geen CUDA op ARM-boards.

## De instelknoppen {#tuning-knobs}

Alle limieten zijn omgevingsvariabelen, volledig gedocumenteerd in [Configuratie](/nl/guide/configuration). `0` betekent onbeperkt of automatisch. Deze doen ertoe op kleine hardware:

| Variabele | Suggestie voor kleine machines | Wat het beschermt |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Hoeveel jobs er parallel draaien. Autodetectie gebruikt het aantal CPU-cores min één; prima op grote machines, te gretig op een 2-core-machine onder geheugendruk. |
| `MAX_WORKER_THREADS` | `2` | Threadpool voor beeldverwerking. |
| `MAX_BATCH_SIZE` | `5` | Bij batches raakt het geheugen op machines met 1-2 GB het eerst op. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Voorkomt dat één enorm bestand de hele werkruimte inneemt. |
| `MAX_MEGAPIXELS` | `50` | Het decoderen van een afbeelding van 100+ MP kost RAM, ongeacht de bestandsgrootte. |
| `MAX_VIDEO_DURATION_S` | `300` | Lange transcodes monopoliseren een kleine CPU minuten- tot urenlang. |
| `PROCESSING_TIMEOUT_S` | `600` | Hard plafond zodat een op hol geslagen job de machine uiteindelijk weer vrijgeeft. |

Deze limieten gelden voor wat de server accepteert, dus stem ze af op wat je daadwerkelijk gebruikt in plaats van ze zo klein mogelijk te maken. Raak je nooit video aan, dan kost een limiet op `MAX_VIDEO_DURATION_S` niets; scan je dagelijks documenten, begrens `MAX_PDF_PAGES` dan niet.

## Wat je kunt overslaan {#what-to-skip}

- **Zware AI-bundels.** Opschaling, fotorestauratie en achtergrondverwijdering willen een GPU of een snelle CPU met veel cores, en elke bundel kost 4-5 GB schijfruimte. Installeer ze op een kleine machine simpelweg niet; tools waarvan de bundel ontbreekt, tonen een installatieprompt in plaats van te draaien.
- **Video-hercodering als routineworkload.** Incidentele transcodes zijn prima (ze zijn alleen traag); een gestage transcodewachtrij wil CPU-cores, geen Pi.
- **Ongebruikte tools in het algemeen.** Een beheerder kan individuele tools uitschakelen in Instellingen, wat ze uit de UI haalt en hun API-routes niet meer registreert. Dat bespaart op zichzelf geen geheugen, maar het voorkomt dat een gedeelde kleine instance wordt gebruikt voor precies die ene workload die de hardware niet aankan.

Verhuis je de instance later naar grotere hardware, verwijder dan de limieten (zet ze terug op `0`); hetzelfde datavolume gaat gewoon mee.
