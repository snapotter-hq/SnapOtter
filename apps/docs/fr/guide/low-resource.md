---
i18n_source_hash: b859c4f3b301
i18n_provenance: machine
i18n_output_hash: 24b84c78a9de
i18n_hash_version: 2
---
# Configurations à faibles ressources {#low-resource-setups}

SnapOtter fonctionne bien sur du petit matériel : un Raspberry Pi 4 ou 5, un vieil ordinateur portable ou un VPS de 2 Go. Cette page est le guide pratique pour ces machines : à quoi vous attendre, une configuration à copier-coller avec des plafonds raisonnables, et les fonctionnalités à éviter. Les données de benchmark complètes derrière ces chiffres se trouvent dans [Configuration matérielle requise](/fr/guide/deployment#hardware-requirements).

Deux contraintes strictes d'emblée :

- **64 bits uniquement.** L'image est construite pour `linux/amd64` et `linux/arm64`. L'ARM 32 bits (`armv7`/`armhf`) n'est pas pris en charge : les Pi de première génération et la famille Pi Zero sont donc exclus.
- **Seuil de 2 Go de mémoire (outils hors IA).** 512 Mo ne suffisent pas pour démarrer la pile, et 1 Go échoue sur les lots de plusieurs fichiers. 2 Go avec 2 cœurs est la plus petite configuration qui exécute confortablement les outils hors IA.

## Ce qui fonctionne bien sur du petit matériel {#what-runs-well}

Tous les outils hors IA fonctionnent sur une machine de 2 Go / 2 cœurs : toutes les sections Image et Fichiers, les outils PDF, et les opérations vidéo et audio en copie de flux (couper, couper le son, remuxage de conteneur). La plupart se terminent en moins d'une seconde.

Deux charges de travail font exception :

- **Le réencodage vidéo** (conversion entre codecs) est limité par le CPU. Un clip 1080p qui prend environ 40 s sur un CPU de bureau rapide peut prendre plusieurs minutes sur un CPU de classe Pi. Les opérations en copie de flux restent instantanées.
- **Les outils d'IA** ont chacun un seuil de mémoire CPU par bundle : 2 Go de RAM hôte (0,5 Go libre) pour la détection de visages et l'OCR rapide intégré, 4 GiB de mémoire effective configurée pour l'OCR précis, 4 Go de RAM hôte (2 à 3 Go libres) pour la transcription, la gomme d'objets et la colorisation, la suppression d'arrière-plan, l'agrandissement et l'amélioration, et la restauration de photos, et 8 Go de RAM hôte (6 Go libres) pour l'inpainting haute qualité. Une machine de 2 Go ne peut pas exécuter Whisper, RealESRGAN, rembg ou LaMa sans être tuée par manque de mémoire. SnapOtter vérifie donc la mémoire libre avant de transmettre au sidecar Python et refuse immédiatement les exécutions sous le seuil du bundle.

Aucun des deux n'est installé ni en cours d'exécution tant que vous ne l'utilisez pas : sans bundle d'IA installé, l'application consomme environ 360 Mo au repos, et les bundles d'IA ne se téléchargent que lorsqu'un administrateur les active.

## Pas-à-pas pour Raspberry Pi / vieil ordinateur portable {#walkthrough}

Il s'agit de l'installation Compose standard décrite dans [Prise en main](/fr/guide/getting-started), avec en plus des limites de ressources et des plafonds prudents. Elle suppose un système 64 bits (sur un Pi : Raspberry Pi OS 64 bits ou Ubuntu Server arm64).

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

Remarques pour les machines de classe Pi :

- **Préférez un SSD USB à une carte SD** pour le volume de données et Postgres. Les espaces de travail des tâches effectuent de vraies E/S disque, et les cartes SD sont à la fois lentes et rapidement usées.
- **Le conteneur unique tout-en-un fonctionne aussi ici** (Postgres et Redis embarqués lorsque `DATABASE_URL`/`REDIS_URL` ne sont pas définis), et sur un hôte à mémoire limitée, vous devriez abaisser le plafond de son Redis embarqué avec `REDIS_MAXMEMORY` (consultez [Configuration](/fr/guide/configuration)). Compose offre un contrôle plus fin par service, ce qui explique pourquoi ce pas-à-pas l'utilise.
- **Ajoutez du swap sur les appareils de 2 Go.** Cela évite qu'un pic occasionnel (un gros PDF, un lot que vous avez oublié de plafonner) ne se termine par un arrêt pour manque de mémoire. zram est l'option adaptée aux cartes SD.
- L'image arm64 est uniquement CPU ; il n'y a pas de CUDA sur les cartes ARM.

## Les paramètres de réglage {#tuning-knobs}

Tous les plafonds sont des variables d'environnement, entièrement documentées dans [Configuration](/fr/guide/configuration). `0` signifie illimité ou automatique. Voici celles qui comptent sur du petit matériel :

| Variable | Suggestion pour petite machine | Ce qu'elle protège |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Le nombre de tâches exécutées en parallèle. La détection automatique utilise le nombre de cœurs CPU moins un, ce qui convient aux grosses machines mais est trop gourmand sur une machine à 2 cœurs sous pression mémoire. |
| `MAX_WORKER_THREADS` | `2` | Le pool de threads de traitement d'images. |
| `MAX_BATCH_SIZE` | `5` | Les lots sont ce qui épuise en premier la mémoire des machines de 1 à 2 Go. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Empêche un seul fichier énorme d'occuper tout l'espace de travail. |
| `MAX_MEGAPIXELS` | `50` | Décoder une image de plus de 100 MP consomme de la RAM quelle que soit la taille du fichier. |
| `MAX_VIDEO_DURATION_S` | `300` | Les longs transcodages monopolisent un petit CPU pendant des minutes, voire des heures. |
| `PROCESSING_TIMEOUT_S` | `600` | Plafond strict pour qu'une tâche incontrôlée finisse par libérer la machine. |

Ces plafonds s'appliquent à ce que le serveur accepte : réglez-les donc en fonction de ce que vous utilisez réellement plutôt que le plus bas possible. Si vous ne touchez jamais à la vidéo, un plafond `MAX_VIDEO_DURATION_S` ne coûte rien ; si vous numérisez des documents tous les jours, ne plafonnez pas `MAX_PDF_PAGES`.

## Ce qu'il vaut mieux éviter {#what-to-skip}

- **Les gros bundles d'IA.** L'agrandissement, la restauration de photos et la suppression d'arrière-plan demandent un GPU ou un CPU rapide à nombreux cœurs, et chaque bundle occupe 4 à 5 Go de disque. Sur une petite machine, ne les installez simplement pas ; les outils dont le bundle est absent affichent une invite d'installation au lieu de s'exécuter.
- **Le réencodage vidéo comme charge de travail courante.** Des transcodages occasionnels ne posent pas de problème (ils sont simplement lents) ; une file de transcodage régulière demande des cœurs CPU, pas un Pi.
- **Les outils inutilisés en général.** Un administrateur peut désactiver des outils individuels dans les Paramètres, ce qui les retire de l'interface et arrête l'enregistrement de leurs routes d'API. Cela n'économise pas de mémoire à lui seul, mais empêche une petite instance partagée d'être utilisée pour la seule charge de travail que le matériel ne supporte pas.

Si vous déplacez plus tard l'instance vers un matériel plus puissant, retirez les plafonds (remettez-les à `0`) et le même volume de données suit.
