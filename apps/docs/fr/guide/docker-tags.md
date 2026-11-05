---
description: "Tags d'image Docker de SnapOtter, benchmarks GPU, épinglage de version et prise en charge multiplateforme pour AMD64 et ARM64."
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: 99dc51edf83e
i18n_hash_version: 2
---

# Tags d'image Docker {#docker-image}

SnapOtter est livré sous la forme d'une seule image Docker. Lancée seule, elle démarre un PostgreSQL 17 et un Redis embarqués sur l'interface de bouclage (mode embarqué) ; en production, exécutez-la avec des conteneurs PostgreSQL 17 et Redis 8 distincts via Compose. L'image de l'application fonctionne sur toutes les plateformes.

## Démarrage rapide {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Sans `DATABASE_URL` défini, cette commande s'exécute en mode embarqué : PostgreSQL et Redis démarrent dans le conteneur sur l'interface de bouclage, avec toutes les données sous le volume `SnapOtter-data`. Définissez `DATABASE_URL` et `REDIS_URL` (comme le fait la pile [Compose](#docker-compose)) pour utiliser des services externes à la place. Consultez [Configuration](/fr/guide/configuration#embedded-mode).

## Accélération NVIDIA CUDA {#nvidia-cuda-acceleration}

L'image inclut la prise en charge de NVIDIA CUDA sur amd64. Si vous disposez d'un GPU NVIDIA avec le [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) installé, ajoutez `--gpus all` :

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

L'image détecte automatiquement CUDA à l'exécution. Sans `--gpus all`, ou lorsque CUDA n'est pas disponible, les outils d'IA s'exécutent sur le CPU. C'est la même image dans les deux cas.

L'accélération par iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL n'est pas prise en charge aujourd'hui pour l'inférence IA de SnapOtter. Le mappage de `/dev/dri` dans le conteneur peut exposer le périphérique de rendu, mais le runtime IA utilisera tout de même le CPU si CUDA n'est pas disponible.

### Benchmarks {#benchmarks}

Testé sur une NVIDIA RTX 4070 (12 Go de VRAM) avec un portrait JPEG de 572x1024.

#### Performances à chaud {#warm-performance}

| Outil | CPU | GPU | Gain |
|------|-----|-----|---------|
| Suppression d'arrière-plan (u2net) | 2,415ms | 879ms | 2.7x |
| Suppression d'arrière-plan (isnet) | 2,457ms | 1,137ms | 2.2x |
| Agrandissement 2x | 350ms | 309ms | 1.1x |
| Agrandissement 4x | 910ms | 310ms | 2.9x |
| Floutage des visages | 139ms | 122ms | 1.1x |

#### Démarrage à froid (première requête après le démarrage du conteneur) {#cold-start-first-request-after-container-start}

| Outil | CPU | GPU | Gain |
|------|-----|-----|---------|
| Suppression d'arrière-plan | 22,286ms | 4,792ms | 4.7x |
| Agrandissement 2x | 3,957ms | 2,318ms | 1.7x |

L'OCR n'est pas inclus dans la comparaison CUDA. Le niveau Tesseract intégré comme les niveaux optionnels RapidOCR/ONNX utilisent le CPU, y compris lorsque le conteneur a accès au GPU NVIDIA.

### Contrôle de santé CUDA {#cuda-health-check}

Après la première requête d'IA, le point de terminaison de santé réservé aux administrateurs indique l'état du GPU CUDA :

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

La pile Compose complète comprend l'application, PostgreSQL 17 et Redis 8. Consultez [Déploiement](/fr/guide/deployment) pour le `docker-compose.yml` complet. Un exemple minimal :

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
      # Runtime role (rows only), then the boot-only owner connection.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
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
| `2.2.0` | Version exacte |
| `2.2` | Dernier correctif de la série 2.2.x |
| `2` | Dernière version mineure de la série 2.x |

## Plateformes {#platforms}

| Architecture | Prise en charge GPU | Remarques |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | Accélération CUDA complète pour les outils d'IA |
| linux/arm64 | CPU uniquement | Raspberry Pi 4/5, Apple Silicon via Docker Desktop |

## Migration depuis les anciens tags {#migration-from-previous-tags}

Si vous utilisiez le tag `:cuda`, passez à `:latest` et conservez `--gpus all`. La prise en charge GPU est la même, dans une image unifiée.

Vos données et vos paramètres sont conservés dans les volumes.
