---
i18n_source_hash: f5de74aee1b9
i18n_provenance: machine
i18n_output_hash: 8abf658cb1e3
---
# Configurations à ressources limitées {#low-resource-setups}

SnapOtter tourne bien sur du petit matériel : un Raspberry Pi 4 ou 5, un vieux portable ou un VPS de 2 Go. Cette page est le guide pratique pour ces machines : à quoi s'attendre, une installation à copier-coller avec des plafonds raisonnables, et quelles fonctionnalités laisser de côté. Les données de benchmark complètes derrière ces chiffres se trouvent dans [Exigences matérielles](/fr/guide/deployment#hardware-requirements).

Deux contraintes strictes d'emblée :

- **64 bits uniquement.** L'image est construite pour `linux/amd64` et `linux/arm64`. L'ARM 32 bits (`armv7`/`armhf`) n'est pas pris en charge : les Pi de première génération et la famille Pi Zero sont donc exclus.
- **Plancher mémoire de 2 Go.** 512 Mo ne suffisent pas à démarrer la pile, et 1 Go échoue sur les lots multi-fichiers. 2 Go avec 2 cœurs est la plus petite configuration qui fonctionne confortablement.

## Ce qui tourne bien sur du petit matériel {#what-runs-well}

Tous les outils non-IA fonctionnent sur une machine à 2 Go / 2 cœurs : l'intégralité des sections Image et Fichiers, les outils PDF et les opérations vidéo et audio en copie de flux (couper, couper le son, changer de conteneur). La plupart se terminent en moins d'une seconde.

Deux charges de travail font exception :

- **Le réencodage vidéo** (conversion entre codecs) est limité par le CPU. Un clip 1080p qui prend ~40 s sur un CPU de bureau rapide peut prendre plusieurs minutes sur un CPU de classe Pi. Les opérations en copie de flux restent instantanées.
- **Les outils IA** demandent de la RAM (4 Go recommandés) et du disque (les bundles les plus gros font 4-5 Go chacun), et les plus lourds (mise à l'échelle, restauration de photos, suppression d'arrière-plan) ne sont pas utilisables en pratique sur des CPU de classe Pi. L'IA légère comme la détection de visages et l'OCR reste utilisable si vous avez la mémoire nécessaire.

Rien de tout cela n'est installé ni actif tant que vous ne l'utilisez pas : sans bundle IA installé, l'application tourne au repos autour de 360 Mo, et les bundles IA ne se téléchargent que lorsqu'un admin les active.

## Pas à pas : Raspberry Pi / vieux portable {#walkthrough}

C'est l'installation Compose standard de [Prise en main](/fr/guide/getting-started), plus des limites de ressources et des plafonds prudents. Elle suppose un OS 64 bits (sur un Pi : Raspberry Pi OS 64 bits ou Ubuntu Server arm64).

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

Remarques pour les machines de classe Pi :

- **Préférez un SSD USB à une carte SD** pour le volume de données et Postgres. Les espaces de travail des jobs font de vraies E/S disque, et les cartes SD sont à la fois lentes et vite usées.
- **Le conteneur unique tout-en-un fonctionne aussi ici** (PostgreSQL et Redis embarqués quand `DATABASE_URL`/`REDIS_URL` ne sont pas définis), et sur un hôte limité en mémoire, abaissez le plafond de son Redis embarqué avec `REDIS_MAXMEMORY` (voir [Configuration](/fr/guide/configuration)). Compose vous donne un contrôle plus fin par service, c'est pourquoi ce pas à pas l'utilise.
- **Ajoutez du swap sur les appareils à 2 Go.** Cela évite qu'un pic occasionnel (un gros PDF, un lot que vous avez oublié de plafonner) se termine en arrêt pour manque de mémoire. zram est l'option qui ménage les cartes SD.
- L'image arm64 est CPU uniquement ; il n'y a pas de CUDA sur les cartes ARM.

## Les leviers de réglage {#tuning-knobs}

Tous les plafonds sont des variables d'environnement, documentées en détail dans [Configuration](/fr/guide/configuration). `0` signifie illimité ou automatique. Ceux qui comptent sur du petit matériel :

| Variable | Suggestion petite machine | Ce que ce plafond protège |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Combien de jobs s'exécutent en parallèle. L'auto-détection prend les cœurs CPU moins un : très bien sur une grosse machine, trop gourmand sur une machine à 2 cœurs sous pression mémoire. |
| `MAX_WORKER_THREADS` | `2` | Pool de threads du traitement d'image. |
| `MAX_BATCH_SIZE` | `5` | Les lots sont le premier endroit où les machines à 1-2 Go manquent de mémoire. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Empêche un seul fichier énorme d'occuper tout l'espace de travail. |
| `MAX_MEGAPIXELS` | `50` | Décoder une image de plus de 100 MP coûte de la RAM, quelle que soit la taille du fichier. |
| `MAX_VIDEO_DURATION_S` | `300` | Les longs transcodages monopolisent un petit CPU pendant des minutes, voire des heures. |
| `PROCESSING_TIMEOUT_S` | `600` | Plafond dur pour qu'un job hors de contrôle finisse par libérer la machine. |

Ces plafonds s'appliquent à ce que le serveur accepte : réglez-les donc selon ce que vous utilisez réellement, pas au plus bas possible. Si vous ne touchez jamais à la vidéo, un plafond `MAX_VIDEO_DURATION_S` ne coûte rien ; si vous numérisez des documents tous les jours, ne plafonnez pas `MAX_PDF_PAGES`.

## Ce qu'il faut laisser de côté {#what-to-skip}

- **Les bundles IA lourds.** La mise à l'échelle, la restauration de photos et la suppression d'arrière-plan demandent un GPU ou un CPU rapide à nombreux cœurs, et chaque bundle coûte 4-5 Go de disque. Sur une petite machine, ne les installez tout simplement pas ; les outils dont le bundle manque affichent une invite d'installation au lieu de s'exécuter.
- **Le réencodage vidéo comme charge de travail régulière.** Des transcodages occasionnels ne posent pas de problème (ils sont juste lents) ; une file de transcodage continue demande des cœurs CPU, pas un Pi.
- **Les outils inutilisés en général.** Un admin peut désactiver des outils individuels dans les Paramètres, ce qui les retire de l'interface et cesse d'enregistrer leurs routes API. Cela ne libère pas de mémoire en soi, mais évite qu'une petite instance partagée serve précisément à la charge de travail que le matériel ne peut pas encaisser.

Si vous déplacez plus tard l'instance vers du matériel plus puissant, retirez les plafonds (remettez-les à `0`) et le même volume de données suit tel quel.
