---
description: "Déployez SnapOtter en production avec Docker. Configuration matérielle requise, configuration GPU et configurations de reverse proxy pour Nginx, Traefik et Cloudflare."
i18n_source_hash: 0c8f078ebe75
i18n_provenance: machine
i18n_output_hash: 9baf107dab8f
i18n_hash_version: 2
---

# Déploiement {#deployment}

SnapOtter se déploie sous la forme d'une pile Docker Compose de 3 conteneurs : l'image de l'application SnapOtter, PostgreSQL 17 et Redis 8. L'image de l'application prend en charge **linux/amd64** (avec NVIDIA CUDA pour l'accélération de l'IA) et **linux/arm64** (CPU), elle fonctionne donc nativement sur les serveurs Intel/AMD, les Mac Apple Silicon et les appareils ARM comme le Raspberry Pi 4/5. L'accélération par iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL n'est pas prise en charge pour l'inférence IA aujourd'hui.

Voir [Image Docker](./docker-tags) pour la configuration GPU, les exemples Docker Compose et l'épinglage de version.

## Démarrage rapide (CPU) {#quick-start-cpu}

```yaml
# docker-compose.yml - Copy this file and run: docker compose up -d
services:
  SnapOtter:
    image: snapotter/snapotter:latest    # or ghcr.io/snapotter-hq/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"                # Web UI + API
    volumes:
      - SnapOtter-data:/data           # AI models, user files (PERSISTENT)
      - SnapOtter-workspace:/tmp/workspace  # Temp processing files (can be tmpfs)
    environment:
      # --- Authentication ---
      - AUTH_ENABLED=true          # Set to false to disable login entirely
      - DEFAULT_USERNAME=admin     # First-run admin username
      - DEFAULT_PASSWORD=admin     # First-run admin password (you'll be forced to change it)

      # --- Database + Queue ---
      # Requests are served by a role that can only read and write rows. The
      # owner connects only during boot, to migrate and to grant. Set
      # POSTGRES_APP_PASSWORD and POSTGRES_PASSWORD for any non-local deployment.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=loopback,linklocal,uniquelocal  # Which peers may set the client IP via X-Forwarded-For (default shown)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)

      # --- Engines (empty = the image's own binaries, see Configuration) ---
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"            # Needed for Python ML shared memory
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
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
  SnapOtter-data:       # Named volume - Docker manages permissions automatically
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose up -d
```

L'application est alors disponible à l'adresse `http://localhost:1349`.

La pile ci-dessus se connecte en tant que propriétaire de la base de données. À partir de SnapOtter 2.3.0, vous pouvez traiter les requêtes avec un rôle qui ne fait que lire et écrire des lignes ; voir [Rôles à privilèges minimaux](./database#least-privilege-roles).

> **Limites de débit de Docker Hub ?** Remplacez `snapotter/snapotter:latest` par `ghcr.io/snapotter-hq/snapotter:latest` pour télécharger l'image depuis GitHub Container Registry à la place. Les deux registres reçoivent la même image à chaque version.

## Démarrage rapide (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Pour l'accélération NVIDIA CUDA sur les outils d'IA pris en charge (suppression d'arrière-plan, agrandissement, amélioration des visages) :

```yaml
# docker-compose-gpu.yml - Requires: NVIDIA GPU + nvidia-container-toolkit
# Install toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      # Runtime role (rows only) and the boot-only owner connection. See the CPU
      # example above.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Engines (empty = the image's own binaries, see Configuration)
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"                # Required for PyTorch CUDA shared memory
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all           # Or set to 1 for a specific GPU
              capabilities: [gpu]
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
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

```bash
docker compose -f docker-compose-gpu.yml up -d
```

### Vérifier l'accélération GPU {#verify-gpu-acceleration}

Vérifiez la détection de CUDA dans les journaux :

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

Si les outils d'IA s'exécutent sur le CPU alors que `--gpus all` et le NVIDIA Container Toolkit sont correctement configurés, réinstallez le bundle concerné (par exemple Suppression d'arrière-plan) depuis **Paramètres → Fonctionnalités d'IA**. Le programme d'installation rétablit la version GPU d'ONNX Runtime, qu'une version CPU seule installée par un autre bundle (comme la transcription) peut sinon masquer dans l'environnement d'IA partagé. Si la réinstallation depuis l'interface ne rétablit pas le GPU sur une image plus ancienne, consultez la réparation manuelle dans l'[issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Configuration matérielle requise {#hardware-requirements}

Ces chiffres proviennent de benchmarks réalisés sur une gamme de systèmes, d'une station de travail amd64 moderne avec une NVIDIA RTX 4070 jusqu'à un Raspberry Pi, en exécutant tout le catalogue d'outils sur chacun et en faisant varier les limites de ressources Docker pour trouver le seuil réel.

Vous tournez sur la partie basse de ces paliers (un Pi, un vieux portable, un VPS de 2 Go) ? [Configurations à faibles ressources](/fr/guide/low-resource) transforme ces chiffres en un guide concret avec des limites ajustées.

### Référence rapide {#quick-reference}

| Palier | Cas d'usage | CPU | RAM | GPU | Stockage |
|------|----------|-----|-----|-----|---------|
| Minimum | Outils sans IA (image, fichiers, PDF léger) plus l'OCR rapide et la détection de visages intégrés ; un seul utilisateur ; petits lots | 2 cœurs | 2 Go | Aucun | ~7 Go |
| Recommandé | Les cinq modalités, y compris vidéo, PDF et bundles d'IA standard sur CPU ; lots ; quelques utilisateurs | 4 cœurs | 4 Go (8 Go pour l'inpainting HQ) | Aucun | ~25 Go |
| Complet | Tout à pleine vitesse, y compris l'IA sur GPU ; gros lots ; nombreux utilisateurs | 6-8 cœurs | 8 Go | NVIDIA 8 Go+ de VRAM (12 Go confortable) | ~35 Go |

**Architecture : 64 bits uniquement** (`linux/amd64` ou `linux/arm64`). SnapOtter fonctionne nativement sur les serveurs Intel/AMD, les Mac Apple Silicon et les cartes ARM 64 bits, y compris les **Raspberry Pi 4 et 5** (4-8 Go). Il ne fonctionne **pas** sur ARM 32 bits (`armv7`/`armhf`), car aucune image n'est construite pour cette architecture, ni sur les cartes de classe 512 Mo comme le Pi Zero, qui sont sous le seuil de mémoire (voir ci-dessous).

### Minimum (outils image, fichiers et PDF léger ; sans IA) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Ressource | Exigence |
|---|---|
| CPU | 2 cœurs |
| RAM | 2 Go |
| Disque | ~5,5 Go (image) + volume de données |
| GPU | Non requis |

Les 222 outils du catalogue sans IA, à savoir image (redimensionner, recadrer, convertir, compresser, ajuster, filigrane), vidéo (découper, couper le son, remuxer), audio (convertir, normaliser, découper), PDF (fusionner, diviser, compresser, pivoter, protéger), conversions de fichiers et préréglages de conversion dédiés, tournent sur un matériel modeste. La plupart des opérations se terminent en bien moins d'une seconde, même sur un gros fichier : une image de 2,7 Mo se redimensionne en ~0,05 s et se réencode en WebP en ~2 s.

Le seuil de mémoire est bien réel, d'après un balayage des limites de ressources Docker : **512 Mo ne permettent pas de démarrer la pile** (même un simple redimensionnement d'image est tué), **1 Go** gère les opérations sur un seul fichier mais un lot de plusieurs fichiers manque de mémoire, et **2 Go / 2 cœurs** est la plus petite configuration qui gère confortablement les lots sans IA. L'OCR rapide intégré et le bundle `face-detection` tiennent aussi dans 2 Go, alors que les bundles d'IA plus volumineux (Whisper, LaMa/DDColor, rembg, RealESRGAN, restauration de photos et inpainting HQ SD1.5) exigent de 4 à 8 Go de RAM et sont refusés d'emblée quand la mémoire libre est inférieure au seuil propre à chaque bundle.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**La seule exception gourmande en CPU est le réencodage vidéo.** Les opérations par copie de flux (découpe, coupure du son, remux de conteneur) sont instantanées, mais le transcodage vers un autre codec est limité par le CPU. Un clip 1080p de 45 secondes réencodé en VP9 (WebM) prend environ **~40 s** sur un CPU moderne rapide, ~45 s sur Apple Silicon, ~80 s sur un portable 4 cœurs plus ancien et **~130 s** sur un serveur 4 cœurs plus ancien. Si votre charge est surtout vidéo, privilégiez le nombre de cœurs et la fréquence du CPU, ou relevez la limite `cpus:` du conteneur : le Compose fourni plafonne l'application à 4 cœurs par défaut (8 pour le Compose GPU).

### Recommandé (outils d'IA sur CPU) {#recommended-ai-tools-on-cpu}

| Ressource | Exigence |
|---|---|
| CPU | 4 cœurs |
| RAM | 4 Go |
| Disque | 3 Go (image) + environ 20 Go (tous les packs d'IA optionnels) + espace de travail |
| GPU | Non requis (repli sur CPU) |

**L'installation et l'exécution des plus gros bundles d'IA portent la recommandation à 4 Go de RAM.** Sans aucun pack optionnel installé, l'application consomme environ 360 Mo au repos. Les anciens outils Python partagent un sidecar, tandis que l'OCR précis utilise un dispatcher dédié de longue durée, rattaché à la génération immuable active. Avant l'activation, le programme d'installation exécute un test de fumée sur le candidat. Il bascule ensuite de façon atomique vers le nouveau dispatcher et draine le précédent avant le ramasse-miettes. Chaque artefact officiel d'OCR précis doit réussir sa suite de tests du pire cas dans un cgroup de 4 GiB, tandis que la recommandation de 4 Go côté hôte laisse de la marge pour l'application Node.js, Postgres, Redis, les files d'attente et le travail concurrent.

La plupart des outils d'IA sont tout à fait utilisables sur CPU ; quelques-uns réclament vraiment un GPU. Mesures sur un CPU moderne à 4 cœurs :

| Outil d'IA | Temps CPU | Utilisable sur CPU ? |
|---|---|---|
| Détection de visages (blur-faces, smart-crop, red-eye), noise-removal | moins de 1 s | Oui |
| OCR, transcription, sous-titres | 1-3 s | Oui |
| Colorisation, amélioration des visages | ~10 s | Oui |
| Suppression / remplacement / flou d'arrière-plan | ~29 s | Oui (il faudra patienter) |
| Agrandissement par IA (RealESRGAN) | ~33 s pour les petites ; des minutes pour les grandes images | Limite : GPU fortement recommandé |
| Restauration de photos (pipeline complet) | plusieurs minutes | Non : il faut un GPU ou un CPU rapide à nombreux cœurs |

SnapOtter n'intègre volontairement pas ces téléchargements de modèles dans l'image Docker. Les bundles d'IA ne sont téléchargés que lorsqu'un administrateur active l'outil correspondant, sont stockés dans le volume persistant `/data/ai` et sont partagés par tous les outils qui dépendent de la même pile de modèles. Cela garde l'image du conteneur légère tout en permettant à une installation d'IA complète d'atteindre les besoins de stockage plus élevés ci-dessous.

Certains outils dépendent de plusieurs bundles partagés. Par exemple, Passport Photo a besoin à la fois de `background-removal` et de `face-detection` ; si `background-removal` est déjà installé, l'activation de Passport Photo ne télécharge que le bundle `face-detection` manquant. La même réutilisation s'applique à tous les outils d'IA.

Stockage des packs d'IA optionnels et seuils de mémoire CPU (SnapOtter vérifie la mémoire disponible avant d'envoyer une tâche au sidecar Python et refuse immédiatement les exécutions sous le seuil de mémoire libre du bundle) :

| Bundle | Taille sur disque | Seuil de mémoire CPU |
|---|---|---|
| Détection de visages | 200-300 Mo | 2 Go de RAM hôte (~0,5 Go libre) |
| Transcription | ~600 Mo | 4 Go de RAM hôte (~2 Go libres) |
| Gomme d'objets + Colorisation | 1-2 Go | 4 Go de RAM hôte (~2 Go libres) |
| OCR précis (`balanced`/`best`) | ~208-234 MiB téléchargés / ~409-488 MiB installés | 4 GiB de mémoire effective configurée (`fast` fonctionne avec 2 Go) |
| Suppression d'arrière-plan | 4-5 Go | 4 Go de RAM hôte (~2,5 Go libres) |
| Agrandissement + Amélioration des visages + Suppression du bruit | 5-6 Go | 4 Go de RAM hôte (~2,5 Go libres) |
| Restauration de photos | 4-5 Go | 4 Go de RAM hôte (~3 Go libres) |
| Inpainting haute qualité (`inpaint-hq`) | 5-7 Go | 8 Go de RAM hôte (~6 Go libres) |
| **Tous les bundles** | **~25 Go installés** | **4 Go (8 Go avec `inpaint-hq`)** |

L'OCR rapide est intégré à l'image via Tesseract, ajoute environ 25 MiB et ne nécessite ni le pack d'OCR optionnel ni ses 4 GiB de mémoire. Le mode rapide prend en charge `auto`, `en`, `de`, `es`, `fr`, `zh` et `ja`, mais pas le coréen (`ko`) ni l'arabe (`ar`). Ces deux langues utilisent `balanced` ou `best` et nécessitent donc le pack précis. Le pack précis est disponible dans les conteneurs Linux officiels amd64 et arm64 et exécute ONNX Runtime sur CPU. Les hôtes NVIDIA utilisent ce même runtime d'OCR sur CPU, l'OCR ne dépend donc ni de la version de CUDA ni de l'architecture du GPU. Le runtime précis exige au moins 4 GiB de mémoire effective : la limite cgroup configurée du conteneur, sinon la mémoire de l'hôte. SnapOtter rejette les systèmes sous ce minimum de compatibilité signé avant de télécharger le pack. L'installation du pack précis est aussi rejetée sur les archives bare-metal/précompilées dont la libc et l'ABI Python ne peuvent pas être garanties. Sur ces hôtes non pris en charge, l'OCR du coréen et de l'arabe renvoie une erreur d'incompatibilité explicite et ne bascule jamais silencieusement vers le mode rapide. Une demande explicite en mode rapide pour le coréen renvoie `FEATURE_INCOMPATIBLE` avec la raison `fast-korean-unsupported` avant la mise en file de la tâche.

Les réplicas qui partagent le même `DATA_DIR` doivent utiliser la même architecture de CPU ; épinglez les déploiements multi-réplicas avec une affinité de nœud. Des réplicas amd64/arm64 mélangés nécessitent des volumes de données distincts et des déploiements SnapOtter indépendants.

Le runtime précis ne conserve qu'une génération active et purge son cache de téléchargement après l'activation. Pour cette version, une première installation nécessite temporairement environ 620-720 MiB pour l'archive et la préparation, et une mise à niveau peut atteindre près de 1,2 GiB tant que l'ancienne génération reste active. Le programme d'installation calcule l'espace exact requis à partir de l'index signé et des générations actuelles avant de télécharger ou d'extraire, et échoue tôt si le volume de données est trop petit.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Complet (outils d'IA sur NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Ressource | Exigence |
|---|---|
| CPU | 6-8 cœurs (la préparation vidéo et la concurrence s'exécutent sur le CPU même avec l'IA sur GPU) |
| RAM | 8 Go |
| GPU | NVIDIA avec 8+ Go de VRAM (12 Go recommandés) |
| Disque | ~35 Go au total |

Un GPU NVIDIA (CUDA) accélère considérablement les modèles d'IA les plus lourds. Mesures sur une RTX 4070 par rapport à un CPU moderne :

| Outil d'IA | Gain avec le GPU | Remarques |
|---|---|---|
| Agrandissement par IA (RealESRGAN 2×) | **~47×** | Le plus gros gain : moins d'une seconde contre ~33 s (des minutes sur les grandes images) |
| Amélioration des visages (CodeFormer) | **~12×** | ~0,9 s contre ~11 s |
| Transcription (Whisper) | ~4,5× | |
| Suppression / remplacement / flou d'arrière-plan | ~4× | ~7 s sur GPU contre ~29 s sur CPU |
| Colorisation | ~1,8× | |
| OCR, détection de visages, red-eye, noise-removal | ~1× | Déjà rapides sur CPU : un GPU n'apporte rien |
| Restauration de photos | aucun | Limitée par le CPU même sur un GPU (0 % d'utilisation du GPU) ; un CPU rapide compte plus qu'un GPU ici |

Les outils pour lesquels un GPU vaut la peine sont **l'agrandissement, l'amélioration des visages, la transcription et la suppression d'arrière-plan**. La détection de visages, l'OCR et red-eye sont limités par le CPU et déjà rapides, un GPU n'ajoute donc rien.

L'utilisation maximale de VRAM atteint 7,5 Go lors d'un agrandissement avec amélioration des visages. Un GPU NVIDIA de 6 Go convient à la plupart des outils d'IA pris individuellement mais échouera sur l'agrandissement. 8-12 Go de VRAM gèrent tout.

L'accélération par iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL n'est pas prise en charge pour l'inférence IA aujourd'hui. Mapper `/dev/dri` dans le conteneur n'active pas l'accélération GPU de l'IA ; SnapOtter exécutera les outils d'IA sur le CPU sauf si NVIDIA CUDA est disponible.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

### Utilisateurs simultanés {#concurrent-users}

Requêtes de redimensionnement d'image en parallèle sur le conteneur d'application plafonné à 4 cœurs par défaut :

| Requêtes simultanées | Temps de réponse moyen | Erreurs |
|---|---|---|
| 1 | 0,4 s | 0 |
| 5 | 1,2 s | 0 |
| 10 | 2,1 s | 0 |

Le temps de réponse se dégrade de façon sous-linéaire, sans erreur, à mesure que le pool de workers sature. Relever la limite `cpus:` du conteneur d'application (ou utiliser un hôte avec plus de cœurs) repousse le plafond. Notez que les tâches lourdes (transcodage vidéo, IA sur CPU) occupent un worker pendant toute leur durée : dimensionnez donc le CPU selon le nombre de tâches lourdes simultanées attendues, pas seulement le nombre de requêtes.

### Formats d'image pris en charge {#supported-image-formats}

SnapOtter prend en charge **plus de 55 formats d'entrée** et **14 formats de sortie**, notamment les fichiers RAW de plus de 20 marques d'appareils photo, des formats professionnels (PSD, EPS, OpenEXR, HDR), des codecs modernes (JPEG XL, AVIF, HEIC, QOI) et des formats scientifiques et de jeu (FITS, DDS).

Consultez la [liste complète des formats](/fr/guide/supported-formats) pour le détail de chaque format pris en charge, le décodeur utilisé et les contrôles de qualité disponibles.

### Limitations connues {#known-limitations}

- Le **redimensionnement tenant compte du contenu** plante sur les grandes images (>5 MP) à cause d'une limitation du binaire caire. Il fonctionne correctement avec des images plus petites.
- Le **décodage HEIF** prend 13 à 23 secondes. HEIC (la variante d'Apple) est bien plus rapide, à 0,3-0,9 seconde.
- L'**agrandissement** expire sur CPU pour toute image au-delà des petites. Un GPU est nécessaire pour un usage pratique.
- L'amélioration des visages **CodeFormer** est nettement plus lente que GFPGAN (53 s contre 2 s sur GPU). GFPGAN est recommandé dans la plupart des cas.

## Volumes {#volumes}

| Montage / Volume | Rôle | Requis ? |
|---|---|---|
| `/data` (app) | Modèles d'IA, venv Python, fichiers utilisateur | **Oui** - perte de fichiers sans lui |
| `/tmp/workspace` (app) | Fichiers de traitement temporaires (nettoyés automatiquement) | Recommandé |
| `SnapOtter-pgdata` (postgres) | Répertoire de données PostgreSQL (utilisateurs, paramètres, pipelines, tâches) | **Oui** - perte de données sans lui |
| `SnapOtter-redisdata` (redis) | Fichier append-only de Redis pour des files de tâches durables | Recommandé |

### Bind mounts et volumes nommés {#bind-mounts-vs-named-volumes}

**Volumes nommés** (recommandés) : Docker gère automatiquement les permissions :
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts** : vous gérez les permissions. Définissez `PUID`/`PGID` pour correspondre à l'utilisateur de votre hôte :
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Permissions de stockage {#storage-permissions}

SnapOtter écrit à deux emplacements à l'exécution : `/data` (fichiers utilisateur, journaux, modèles d'IA et venv Python) et `/tmp/workspace` (espace de travail temporaire de traitement). Les deux doivent être accessibles en écriture à l'utilisateur sous lequel le conteneur s'exécute. Si ce n'est pas le cas, le conteneur **échoue immédiatement au démarrage** avec un message qui nomme le répertoire, l'UID/GID en cours et la façon de corriger, au lieu de démarrer en état « healthy » puis d'échouer au premier envoi avec une erreur obscure. Le répertoire des journaux (`LOG_DIR`, `/data/logs` dans l'image) est vérifié de la même façon, quel que soit le mode de stockage, car les journaux restent locaux même quand les fichiers sont sur S3.

La gestion des permissions dépend de la façon dont le conteneur est lancé :

**Par défaut (démarre en root, puis passe à `snapotter`)** : le point d'entrée démarre en root, corrige la propriété des volumes montés, puis passe à l'utilisateur non privilégié `snapotter` via `gosu`. Les volumes nommés fonctionnent sans configuration. Pour les bind mounts, définissez `PUID`/`PGID` sur votre utilisateur hôte (ci-dessus) afin que les fichiers qu'il écrit vous appartiennent.

**Kubernetes / OpenShift (non-root via `runAsUser`)** : lancé directement sous un utilisateur non-root, le conteneur ne peut pas exécuter chown sur les volumes lui-même, c'est donc à l'orchestrateur de les rendre accessibles en écriture. Définissez `fsGroup` :

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Les répertoires inscriptibles de l'image appartiennent au groupe GID 0 et sont inscriptibles par le groupe, de sorte qu'un pod exécuté avec un **UID arbitraire** et le groupe supplémentaire root (le comportement par défaut d'OpenShift) peut y écrire sans `chown`.

**TrueNAS Scale (et autres configurations à « UID étranger »)** : TrueNAS exécute les applications sous un utilisateur non-root (souvent `568:568`) et monte des datasets hôtes appartenant à un autre utilisateur, de sorte que ni le point d'entrée ni `fsGroup` ne les rendent inscriptibles à eux seuls. Choisissez l'une des options :

- **Exécuter l'application en root** (recommandé) : laissez l'utilisateur de l'application non défini ou définissez-le sur `0`, et laissez le point d'entrée par défaut corriger les permissions puis passer à `snapotter`.
- **Exécuter sous l'UID `999`** : définissez l'utilisateur/groupe de l'application sur `999:999` (l'utilisateur `snapotter` intégré de SnapOtter) pour qu'il corresponde à la propriété dans l'image.
- **`chown` le dataset hôte** vers l'UID sous lequel le conteneur s'exécute, depuis le shell TrueNAS :

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

L'erreur de démarrage nomme l'UID exact à utiliser, le plus rapide est donc de démarrer l'application une fois, de lire le message, puis de `chown` (ou d'ajuster l'utilisateur) en conséquence.

## Variables d'environnement {#environment-variables}

| Variable | Valeur par défaut | Description |
|---|---|---|
| `AUTH_ENABLED` | `true` | Active ou désactive l'obligation de connexion |
| `DEFAULT_USERNAME` | `admin` | Nom d'utilisateur administrateur initial |
| `DEFAULT_PASSWORD` | `admin` | Mot de passe administrateur initial (changement forcé à la première connexion) |
| `MAX_UPLOAD_SIZE_MB` | `0` (illimité) | Limite d'envoi par fichier en Mo. L'image fournit `0` ; une construction depuis les sources part de 100 |
| `MAX_BATCH_SIZE` | `0` (illimité) | Nombre maximal de fichiers par requête de lot. L'image fournit `0` ; une construction depuis les sources part de 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | Requêtes d'API par minute et par IP (0 pour désactiver) |
| `MAX_USERS` | `0` (illimité) | Nombre maximal de comptes utilisateur |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Quels pairs peuvent définir l'IP du client via `X-Forwarded-For`. Réseaux privés uniquement par défaut |
| `PUID` | `999` | Exécuter sous cet UID (pour les permissions des bind mounts) |
| `PGID` | `999` | Exécuter sous ce GID (pour les permissions des bind mounts) |
| `LOG_LEVEL` | `info` | Verbosité des journaux : fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Nombre maximal de tâches de traitement d'IA en parallèle |
| `SESSION_DURATION_HOURS` | `168` | Durée de vie d'une session de connexion (7 jours) |
| `CORS_ORIGIN` | (vide) | Origines autorisées séparées par des virgules, ou vide pour la même origine |

### Proxy sortant et autorité de certification privée {#outbound-proxy-and-private-ca}

Le conteneur officiel active la prise en charge du proxy par variables d'environnement de Node. Si SnapOtter doit joindre le dépôt du runtime d'OCR ou d'autres services HTTPS via un proxy d'entreprise, définissez `HTTPS_PROXY` (et `HTTP_PROXY` si nécessaire). Définissez `NO_PROXY` sur une liste d'hôtes séparés par des virgules qui doivent être joints directement, comme Postgres, Redis et le stockage d'objets interne.

Si le proxy ou un service interne est signé par une autorité de certification privée, montez le certificat de l'AC en lecture seule et faites-y pointer `NODE_EXTRA_CA_CERTS`. Le fichier doit exister au démarrage du processus Node :

```yaml
services:
  app:
    environment:
      HTTPS_PROXY: http://proxy.example.internal:3128
      HTTP_PROXY: http://proxy.example.internal:3128
      NO_PROXY: postgres,redis,minio,localhost,127.0.0.1
      NODE_EXTRA_CA_CERTS: /etc/snapotter/custom-ca.pem
    volumes:
      - ./company-ca.pem:/etc/snapotter/custom-ca.pem:ro
```

Gardez les identifiants du proxy en dehors du fichier Compose (par exemple dans un fichier `.env` protégé ou un secret). Ne désactivez pas la vérification TLS : l'index d'OCR signé authentifie les métadonnées de version, tandis que la validation TLS normale continue de protéger le transport et toutes les autres requêtes sortantes.

## Vérification de santé {#health-check}

Le conteneur inclut une vérification de santé intégrée :

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse proxy {#reverse-proxy}

`TRUST_PROXY` vaut par défaut `loopback,linklocal,uniquelocal`, SnapOtter ne croit donc `X-Forwarded-For` que s'il provient d'un pair situé sur un réseau privé. Un reverse proxy sur le même hôte, sur un réseau Docker ou sur votre LAN est approuvé d'emblée, ce qui signifie que la limitation de débit, le limiteur de force brute de la connexion, le journal d'audit et la liste d'IP autorisées de l'édition entreprise voient tous la vraie IP du client sans aucune configuration.

Ne définissez `TRUST_PROXY=true` que lorsque le proxy placé devant atteint SnapOtter depuis une adresse **publique**, par exemple un répartiteur de charge cloud situé sur un autre réseau. Sur une instance directement exposée, cette valeur rend `request.ip` contrôlable par un attaquant, car un appelant qui fait varier l'en-tête obtient un nouveau compartiment de limitation de débit à chaque requête.

Deux choses à savoir avant de vous mettre à mesurer les IP des clients. Docker Desktop sur macOS et Windows sert un port publié via un proxy en espace utilisateur qui réécrit chaque adresse source vers la passerelle de la VM `192.168.65.1`, aucune valeur de `TRUST_PROXY` ne permet donc d'y retrouver le vrai client ; déployez sous Linux pour tout ce qui est exposé à Internet. Et sur toute plateforme, l'accès à un port publié via `localhost` est observé comme provenant de la passerelle du bridge et non de votre client, de sorte qu'un test en localhost ne vous apprend rien sur la façon dont un vrai client est identifié. Le tableau complet des valeurs de `TRUST_PROXY` et la mise en garde sur Docker Desktop se trouvent dans [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Deux points comptent pour chaque proxy ci-dessous : autoriser les gros corps de requête (envois) et ne pas mettre les réponses en mémoire tampon. Un proxy qui met les réponses en tampon casse la progression SSE et, de façon plus visible, fait qu'un gros téléchargement « démarre mais ne se termine jamais », car le proxy retient tout le fichier avant de le transmettre. SnapOtter envoie `X-Accel-Buffering: no` sur les téléchargements pour que nginx les diffuse en flux même si la mise en tampon reste activée ailleurs, mais les proxies autres que nginx exigent que la mise en tampon des réponses soit désactivée explicitement (indiqué dans chaque configuration ci-dessous). Si un téléchargement se bloque en cours de route, un proxy qui met en tampon placé devant est la première chose à vérifier.

Une remarque sur HSTS : l'API envoie elle-même `Strict-Transport-Security` sur chaque réponse, un proxy qui transmet les en-têtes de réponse (toutes les configurations ci-dessous le font) n'a donc besoin d'aucune configuration HSTS propre. Ce n'est que si votre proxy est configuré pour supprimer ou remplacer les en-têtes de réponse en amont que vous devez préserver l'en-tête ou le rajouter en périphérie.

### Nginx {#nginx}

```nginx
server {
    # Plain HTTP shown for brevity. Terminate TLS in your own `listen 443 ssl`
    # server block; the Strict-Transport-Security header the API sends passes
    # through with every proxied response, so no add_header is needed there.
    listen 80;
    server_name images.example.com;

    # Match MAX_UPLOAD_SIZE_MB (0 = nginx default 1M, so set high for unlimited)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:1349;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Stream responses instead of buffering: needed for SSE progress
        # (batch, AI, feature installs) and for large file downloads.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Déploiement sous un sous-chemin {#subpath}

Pour servir `https://example.com/snapotter`, définissez `BASE_PATH=/snapotter` dans l'environnement du
conteneur SnapOtter et redémarrez-le. Les fichiers Compose officiels CPU et GPU
acceptent aussi `BASE_PATH` depuis votre shell ou votre fichier `.env` de Compose. La même
image fonctionne à n'importe quel chemin ; aucune reconstruction du frontend n'est nécessaire.

`BASE_PATH` accepte des segments séparés par des barres obliques contenant des lettres, des chiffres, `_` ou
`-`, y compris des chemins imbriqués comme `/apps/snapotter`. La barre oblique finale est
facultative. Laissez-le vide (la valeur par défaut), ou définissez `/`, pour un déploiement à la racine.

Dans votre bloc de serveur HTTPS Nginx existant, utilisez :

```nginx
location = /snapotter {
    return 308 /snapotter/$is_args$args;
}
location /snapotter/ {
    proxy_pass http://localhost:1349;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 500M;
    proxy_buffering off;
    proxy_read_timeout 300s;
}
```

Cet exemple conserve le préfixe. Les proxies qui retirent `/snapotter` avant de
transmettre la requête sont également pris en charge. Les vérifications de santé internes peuvent continuer à utiliser
`/api/v1/health`. Pour OIDC ou SAML, définissez aussi
`EXTERNAL_URL=https://example.com/snapotter` et mettez à jour les URL de rappel du fournisseur
d'identité pour qu'elles incluent `/snapotter/api/auth/oidc/callback` ou
`/snapotter/api/auth/saml/callback` respectivement.

Les scripts d'API continuent de fonctionner sans changement : les URL dans les réponses de l'API, comme le
`downloadUrl` d'un outil, commencent par `/api/` quelle que soit la valeur de `BASE_PATH`. Ajoutez-les à l'URL de base de votre
instance (`https://example.com/snapotter` + `/api/v1/download/...`)
plutôt que de les résoudre par rapport à la racine du domaine.

Ouvrez l'interface via l'URL avec préfixe (`https://example.com/snapotter`). Un
navigateur qui arrive sans le préfixe y est redirigé automatiquement ; seules les requêtes
d'API sont censées atteindre l'application sans préfixe. Si les journaux indiquent
`Requests arrive under /snapotter/ but BASE_PATH is empty`, votre proxy
transmet un préfixe que `BASE_PATH` ne déclare pas : définissez `BASE_PATH` sur ce préfixe,
ou retirez le préfixe au niveau du proxy.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Ajoutez un nouveau Proxy Host
2. Définissez Domain Name sur votre domaine
3. Définissez Scheme sur `http`, Forward Hostname sur `SnapOtter` (ou l'IP de votre conteneur), Forward Port sur `1349`
4. Activez la prise en charge de WebSocket
5. Sous Advanced, ajoutez : `client_max_body_size 500M;` et `proxy_buffering off;`

L'en-tête `Strict-Transport-Security` de l'API traverse NPM tel quel ; l'option HSTS de l'onglet SSL est facultative en plus.

### Traefik {#traefik}

```yaml
# Add these labels to the SnapOtter service in docker-compose.yml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.snapotter.rule=Host(`images.example.com`)"
  - "traefik.http.routers.snapotter.entrypoints=websecure"
  - "traefik.http.routers.snapotter.tls.certresolver=letsencrypt"
  - "traefik.http.services.snapotter.loadbalancer.server.port=1349"
  # Increase upload limit (default 2MB is too low)
  - "traefik.http.middlewares.snapotter-body.buffering.maxRequestBodyBytes=524288000"
  - "traefik.http.routers.snapotter.middlewares=snapotter-body"
```

Traefik transmet les en-têtes de réponse en amont sans les modifier, l'en-tête `Strict-Transport-Security` de l'API parvient donc aux navigateurs sans middleware `headers`. Si vous en exécutez déjà un qui réécrit les en-têtes de réponse, assurez-vous qu'il laisse cet en-tête intact.

### Caddy {#caddy}

```txt
images.example.com {
    reverse_proxy localhost:1349 {
        flush_interval -1
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }
}
```

`flush_interval -1` désactive la mise en tampon des réponses, ce qui est nécessaire pour que les événements de progression SSE (traitement par lots, outils d'IA, installations de fonctionnalités) et les gros téléchargements de fichiers soient diffusés en flux au lieu de se bloquer. Les délais d'expiration étendus permettent aux gros envois de fichiers de se terminer sans que Caddy ferme la connexion trop tôt. Caddy transmet aussi l'en-tête `Strict-Transport-Security` de l'API sans le modifier, aucune directive `header` n'est donc nécessaire pour HSTS.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Remarque : Cloudflare impose une limite d'envoi de 100 Mo sur les offres gratuites. Définissez `MAX_UPLOAD_SIZE_MB=100` en conséquence.

Le tunnel transmet les en-têtes de réponse de l'API, `Strict-Transport-Security` compris, aucune configuration HSTS dans le tableau de bord n'est donc requise (le réglage HSTS propre à la périphérie de Cloudflare est facultatif en plus).

## Dépannage {#troubleshooting}

### « Postgres not reachable: EAI_AGAIN » juste après un premier démarrage raté {#eai-again-after-failed-first-start}

Si le tout premier `docker compose up -d` échoue en cours de route (un port déjà utilisé en est la raison habituelle), une simple nouvelle tentative de `up -d` peut démarrer le conteneur de l'application sans l'attacher au réseau compose. L'application plante alors en boucle avec :

```
Postgres not reachable: EAI_AGAIN
```

alors que `docker ps` montre postgres en bonne santé. L'erreur est réelle mais désigne le mauvais conteneur : sans le réseau, le DNS du nom d'hôte `postgres` ne peut pas du tout être résolu, et la politique de redémarrage rejoue indéfiniment le même échec.

Corrigez ce qui a fait échouer le premier démarrage (en général : libérez le port), puis forcez la recréation du conteneur de l'application pour qu'il se rattache au réseau :

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows : accessible depuis d'autres appareils, mais pas depuis le PC lui-même {#windows-wsl2-loopback}

Avec Docker exécuté dans WSL2 (la configuration Windows habituelle), la pile peut être accessible depuis toutes les autres machines de votre réseau alors que `http://localhost:1349` expire sur l'hôte Windows lui-même, même avec le mode réseau mirrored de WSL activé. Le port n'apparaît jamais dans `netstat` de Windows, et les conteneurs n'ont aucun problème.

Ouvrez l'application depuis un autre appareil, ou depuis l'intérieur de la distribution en utilisant sa propre adresse (`hostname -I` dans le shell WSL). Si la redirection de localhost fonctionne par hasard sur votre version de WSL, considérez-la comme un bonus et non comme quelque chose sur lequel s'appuyer.

## CI/CD {#ci-cd}

Le dépôt GitHub comporte trois workflows :

- **ci.yml** - S'exécute automatiquement à chaque push et PR. Lint, vérification des types, tests, build et validation de l'image Docker (sans la publier).
- **release.yml** - Déclenché manuellement via `workflow_dispatch`. Exécute semantic-release pour créer un tag de version et une release GitHub, puis construit une image Docker multi-architecture (amd64 + arm64) et la publie sur Docker Hub (`snapotter/snapotter`) et GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Construit ce site de documentation et le déploie sur Cloudflare Pages lors d'un push vers `main`.

Pour créer une release, allez dans **Actions > Release > Run workflow** dans l'interface GitHub, ou exécutez :

```bash
gh workflow run release.yml
```

Semantic-release détermine la version à partir de l'historique des commits. Le tag Docker `latest` pointe toujours vers la release la plus récente.

## Analytique {#analytics}

SnapOtter inclut une analytique produit anonyme (habitudes d'utilisation des outils, rapports d'erreurs) pour aider à repérer les bugs et à améliorer les fonctionnalités. Elle est activée par défaut. Vos fichiers, noms de fichiers et données personnelles n'en font jamais partie. SnapOtter fonctionne normalement avec l'analytique désactivée.

### Désactiver l'analytique {#disabling-analytics}

La désactivation à l'exécution se fait par un simple interrupteur d'administration. Ouvrez Paramètres > Système > Confidentialité et désactivez l'analytique produit anonyme. Elle s'arrête immédiatement pour toute l'instance, sans reconstruction.

Pour une image qui ne pourra jamais émettre d'analytique, activez la désactivation définitive à la construction en clonant le dépôt et en reconstruisant :

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Ou ajoutez l'argument de build à votre `docker-compose.yml` existant :

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
