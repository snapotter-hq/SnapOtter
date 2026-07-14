---
description: "Tags d'image Docker de SnapOtter, benchmarks GPU, épinglage de version et prise en charge multiplateforme pour AMD64 et ARM64."
i18n_output_hash: 9cbbf793ca2b
i18n_source_hash: fda322e78b4b
i18n_provenance: human
---

# Image Docker {#docker-image}

SnapOtter est distribué sous la forme d'une seule image Docker. Exécutée seule, elle démarre un PostgreSQL 17 et un Redis embarqués sur l'interface de bouclage (mode embarqué) ; en production, exécutez-la aux côtés de conteneurs PostgreSQL 17 et Redis 8 distincts avec Compose. L'image de l'application fonctionne sur toutes les plateformes.

## Démarrage rapide {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Sans `DATABASE_URL` défini, l'exécution se fait en mode embarqué : PostgreSQL et Redis démarrent à l'intérieur du conteneur sur le bouclage, avec toutes les données sous le volume `SnapOtter-data`. Définissez `DATABASE_URL` et `REDIS_URL` (comme le fait la pile [Compose](#docker-compose)) pour utiliser des services externes à la place. Voir [Configuration](/fr/guide/configuration#embedded-mode).

## Accélération NVIDIA CUDA {#nvidia-cuda-acceleration}

L'image inclut la prise en charge de NVIDIA CUDA sur amd64. Si vous avez un GPU NVIDIA avec le [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) installé, ajoutez `--gpus all` :

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

L'image détecte automatiquement CUDA au moment de l'exécution. Sans `--gpus all`, ou lorsque CUDA n'est pas disponible, les outils d'IA s'exécutent sur le CPU. La même image dans les deux cas.

L'accélération des iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL n'est pas prise en charge aujourd'hui pour l'inférence IA de SnapOtter. Mapper `/dev/dri` dans le conteneur peut exposer le périphérique de rendu, mais le moteur d'exécution IA utilisera quand même le CPU à moins que CUDA soit disponible.

### Benchmarks {#benchmarks}

Testé sur un NVIDIA RTX 4070 (12 Go de VRAM) avec un portrait JPEG de 572x1024.

#### Performances à chaud {#warm-performance}

| Outil | CPU | GPU | Accélération |
|------|-----|-----|---------|
| Suppression d'arrière-plan (u2net) | 2 415 ms | 879 ms | 2,7x |
| Suppression d'arrière-plan (isnet) | 2 457 ms | 1 137 ms | 2,2x |
| Agrandissement 2x | 350 ms | 309 ms | 1,1x |
| Agrandissement 4x | 910 ms | 310 ms | 2,9x |
| Floutage de visage | 139 ms | 122 ms | 1,1x |

#### Démarrage à froid (première requête après le démarrage du conteneur) {#cold-start-first-request-after-container-start}

| Outil | CPU | GPU | Accélération |
|------|-----|-----|---------|
| Suppression d'arrière-plan | 22 286 ms | 4 792 ms | 4,7x |
| Agrandissement 2x | 3 957 ms | 2 318 ms | 1,7x |

OCR n'est pas inclus dans la comparaison CUDA. Le niveau Tesseract intégré et les niveaux RapidOCR/ONNX facultatifs utilisent CPU, y compris lorsque le conteneur dispose d'un accès NVIDIA GPU.

### Vérification de l'état de CUDA {#cuda-health-check}

Après la première requête IA, le point de terminaison d'état d'administration signale l'état du GPU CUDA :

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

La pile Compose complète inclut l'application, PostgreSQL 17 et Redis 8. Voir [Déploiement](/fr/guide/deployment) pour le fichier `docker-compose.yml` complet. Un exemple minimal :

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

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

Pour l'accélération NVIDIA CUDA via Docker Compose, ajoutez la section deploy au service SnapOtter :

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## Épinglage de version {#version-pinning}

| Tag | Description |
|-----|------------|
| `latest` | Dernière version |
| `1.11.0` | Version exacte |
| `1.11` | Dernier correctif de la 1.11.x |
| `1` | Dernière version mineure de la 1.x |

## Plateformes {#platforms}

| Architecture | Prise en charge GPU | Notes |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Accélération CUDA complète pour les outils d'IA |
| linux/arm64 | CPU uniquement | Raspberry Pi 4/5, Apple Silicon via Docker Desktop |

## Migration depuis les tags précédents {#migration-from-previous-tags}

Si vous utilisiez le tag `:cuda`, passez à `:latest` et conservez `--gpus all`. Même prise en charge du GPU, image unifiée.

Vos données et paramètres sont préservés dans les volumes.
