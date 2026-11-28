---
description: "Toutes les variables d'environnement de SnapOtter avec leurs valeurs par défaut. Configurez l'authentification, le stockage, les modèles d'IA, l'analytique et plus encore."
i18n_source_hash: 3523a064e1a6
i18n_provenance: machine
i18n_output_hash: 024e16828afc
i18n_hash_version: 2
---

# Configuration {#configuration}

Toute la configuration se fait via des variables d'environnement. Chaque variable possède une valeur par défaut raisonnable, de sorte que SnapOtter fonctionne d'emblée sans qu'aucune d'elles ne soit définie.

## Variables d'environnement {#environment-variables}

### Serveur {#server}

| Variable | Par défaut | Description |
|---|---|---|
| `PORT` | `1349` | Port sur lequel le serveur écoute. |
| `HOST` | `0.0.0.0` | Adresse IP sur laquelle le serveur écoute. Sur un réseau bridge (le mode par défaut pour `docker run` et Compose), conservez `0.0.0.0` (ou `::`), sinon les ports publiés cessent de fonctionner. Sur une installation native ou dans un conteneur sur le réseau de l'hôte, `127.0.0.1` garde l'API hors du réseau ; placez un proxy inverse devant pour l'accès à distance. Le [mode intégré](#embedded-mode) ne fonctionne qu'avec `0.0.0.0`, `::` ou `127.0.0.1`, car sa vérification de démarrage appelle `127.0.0.1`. Avec toute autre adresse, `::1` compris, le conteneur n'est jamais considéré comme démarré, et un plantage ultérieur l'arrête au lieu de redémarrer le serveur. Tout ce qui n'est pas une adresse IP, `localhost` compris, arrête le serveur au démarrage. |
| `BASE_PATH` | (vide) | Chemin de déploiement public, par ex. `/snapotter`. Vide ou `/` sert à la racine du domaine. Appliqué à l'exécution ; aucune reconstruction de l'image n'est nécessaire. |
| `RATE_LIMIT_PER_MIN` | `1000` | Nombre maximal de requêtes par minute par IP. Mettez 0 pour désactiver la limitation de débit. |
| `API_KEYS_RATE_LIMIT_PER_MIN` | `30` | Nombre maximal de requêtes par minute par IP vers les points de terminaison de gestion des clés d'API (lister, créer, révoquer). Les clés utilisées pour les appels d'outils ne sont pas concernées. Mettez `0` pour aucune limite. |
| `CORS_ORIGIN` | (vide) | Origines autorisées pour le CORS, séparées par des virgules, ou vide pour la même origine uniquement. |
| `LOG_LEVEL` | `info` | Verbosité des journaux. L'une des valeurs : `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Quels pairs peuvent définir l'IP du client via `X-Forwarded-For`. La valeur par défaut ne croit qu'un pair d'un réseau privé : un reverse proxy sur un réseau Docker ou sur un LAN est donc digne de confiance, alors que l'en-tête falsifié d'un client public ne l'est pas. Ne mettez `true` que lorsqu'un proxy que vous contrôlez se trouve devant, sur une adresse publique. |
| `SNAPOTTER_ANALYTICS_DEFAULT` | `on` | Définissez `off` pour démarrer une nouvelle instance avec le paramètre « Analyses de produit anonymes » désactivé, de sorte qu'elle n'envoie rien dès son premier démarrage. La variable ne renseigne le paramètre que tant que personne n'en a choisi un. Une fois le paramètre enregistré, par un administrateur ou par cette variable, modifier la variable n'a plus aucun effet ; un administrateur peut toujours activer l'analytique dans Paramètres > Système > Confidentialité. |

### Authentification {#authentication}

Les deux booléens ci-dessous n'acceptent que `true` et `false`. Toute autre valeur, `1`, `yes` ou `on`, échoue à la validation et le serveur s'arrête avant de commencer à écouter.

| Variable | Par défaut | Description |
|---|---|---|
| `AUTH_ENABLED` | `true` | Exige une connexion. Mettez `false` pour fonctionner sans aucun compte, ce qui accorde les droits admin à chaque requête ; réservez donc cela à un réseau de confiance. |
| `DEFAULT_USERNAME` | `admin` | Nom d'utilisateur du compte admin initial. Utilisé uniquement au premier lancement. |
| `DEFAULT_PASSWORD` | `admin` | Mot de passe du compte admin initial. Changez-le après la première connexion. |
| `MAX_USERS` | `0` (illimité) | Nombre maximal de comptes utilisateur enregistrés. Mettez 0 pour illimité. |
| `SESSION_DURATION_HOURS` | `168` | Durée de vie de la session de connexion en heures (par défaut 7 jours). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Mettez `true` pour ignorer l'invite de changement de mot de passe forcé à la première connexion. |
| `LOGIN_ATTEMPT_LIMIT` | `30` | Nombre maximal de requêtes de connexion par minute par IP. Les tentatives suivantes reçoivent un `429` jusqu'à la fin de la minute. Des échecs répétés pour un même nom d'utilisateur atteignent généralement `LOGIN_THROTTLE_MAX_FAILURES` en premier. Un admin peut le remplacer dans Paramètres > Système. Mettez `0` pour aucune limite. Une compilation depuis les sources démarre à 10. |
| `LOGIN_THROTTLE_MAX_FAILURES` | `10` | Nombre de connexions par mot de passe échouées qu'un nom d'utilisateur peut avoir dans `LOGIN_THROTTLE_WINDOW_S` avant que les tentatives suivantes reçoivent un `429`, quelle que soit l'IP d'origine. Elles sont de nouveau acceptées à mesure que les échecs les plus anciens sortent de la fenêtre. Mettez 0 pour désactiver la limitation. |
| `LOGIN_THROTTLE_WINDOW_S` | `900` | Durée de cette fenêtre, en secondes. Doit valoir au moins 1 ; le serveur refuse de démarrer avec 0. |

### Stockage {#storage}

| Variable | Par défaut | Description |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` ou `s3`. S3 et MinIO nécessitent une licence avec la fonctionnalité s3_storage, ainsi que les variables `S3_*` ci-dessous. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | Chaîne de connexion PostgreSQL. C'est aussi la connexion sur laquelle chaque requête est servie. À partir de 2.3.0, définissez aussi `DATABASE_MIGRATION_URL` et celle-ci devient le rôle d'exécution à moindre privilège, qui ne détient que les droits DML sur les tables de l'application. La pile Compose la pointe vers son service `postgres` ; laissez-la non définie (avec `REDIS_URL`) pour obtenir le mode intégré. Pour vous connecter via un socket unix, indiquez le répertoire du socket dans `host`, comme dans `postgres://user:pass@localhost/snapotter?host=/var/run/postgresql`, et montez ce répertoire dans le conteneur. |
| `DATABASE_MIGRATION_URL` | (vide) | Connexion privilégiée, utilisée uniquement au démarrage pour exécuter les migrations et accorder le rôle d'exécution, puis fermée avant la première requête. Laissez-la vide et SnapOtter fonctionne en rôle unique, `DATABASE_URL` assurant les deux tâches. Voir [Rôles à moindre privilège](/fr/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Chaîne de connexion Redis (utilisée pour les files d'attente de tâches BullMQ). Compose la pointe vers son service `redis`. Pour un socket unix, utilisez `unix:///run/redis/redis.sock?db=5` (ajoutez `&password=...` si Redis en exige un) et montez le socket dans le conteneur. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Répertoire des fichiers temporaires pendant le traitement. Nettoyé automatiquement. L'image définit `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Répertoire des fichiers utilisateur persistants (images téléversées, résultats enregistrés). L'image définit `/data/files`. |
| `MAX_STORAGE_PER_USER_MB` | `5000` | Plafond en mégaoctets de ce que chaque utilisateur conserve dans la bibliothèque Fichiers. Un enregistrement qui le dépasserait est refusé, avec la quantité utilisée et la limite. Un quota défini sur l'utilisateur le remplace. Mettez 0 pour illimité. |

### Stockage d'objets S3 {#s3-object-storage}

Lues uniquement lorsque `STORAGE_MODE=s3`. S'il manque l'une des trois variables obligatoires, le démarrage échoue en indiquant le nom de celle que vous avez oubliée.

| Variable | Par défaut | Description |
|---|---|---|
| `S3_BUCKET` | (vide) | Bucket qui contient les téléversements et les sorties. Obligatoire. |
| `S3_ACCESS_KEY_ID` | (vide) | Clé d'accès. Obligatoire. Dans le conteneur, vous pouvez plutôt la monter, via `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (vide) | Clé secrète. Obligatoire. Même convention de fichier : `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Région du bucket. |
| `S3_ENDPOINT` | (vide) | Point de terminaison personnalisé pour MinIO, R2, Backblaze et les autres stockages compatibles S3. Vide signifie AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Mettez `true` pour MinIO et tout autre service qui attend `endpoint/bucket/key` plutôt qu'un adressage par hôte virtuel. |
| `S3_PREFIX` | (vide) | Préfixe de clé, pour qu'un même bucket puisse héberger plusieurs instances. |

### Chiffrement au repos {#encryption-at-rest}

| Variable | Par défaut | Description |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (vide) | 64 caractères hexadécimaux (32 octets). Chiffre les paramètres sensibles stockés dans la base de données. Tout ce qui ne fait pas exactement 64 caractères hexadécimaux est rejeté au démarrage. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (vide) | La clé que vous abandonnez lors d'une rotation, au même format. Définissez les deux pendant la rotation pour que les lignes existantes restent déchiffrables, puis retirez celle-ci. |

### Mode intégré {#embedded-mode}

Exécutez l'image sans `DATABASE_URL` et sans `REDIS_URL` et elle démarre ses propres PostgreSQL 17 et Redis à l'intérieur du conteneur, liés au loopback, avec toutes les données sur le volume `/data`. Cela restaure l'expérience `docker run` en une seule commande pour un démarrage rapide, un homelab et les mises à niveau depuis la version 1.x. C'est un chemin de commodité, pas un déploiement de production : pour la production, exécutez la pile Compose à 3 conteneurs avec PostgreSQL et Redis séparés. Le mode intégré nécessite d'exécuter le conteneur en tant que root et est incompatible avec les runtimes à UID arbitraire (OpenShift, Kubernetes `runAsNonRoot`) ; utilisez Compose dans ce cas.

| Variable | Par défaut | Description |
|---|---|---|
| `EMBEDDED` | `auto` | Activé automatiquement lorsque `DATABASE_URL` et `REDIS_URL` sont tous deux non définis. Mettez `0` pour le désactiver (l'application échoue alors immédiatement si aucun `DATABASE_URL`/`REDIS_URL` externe n'est défini, plutôt que de démarrer silencieusement une base de données dans le conteneur). |
| `REDIS_MAXMEMORY` | `512mb` | Plafond mémoire du Redis intégré (mode intégré uniquement). Abaissez-le sur les hôtes à mémoire limitée tels qu'un Raspberry Pi. |
| `EMBEDDED_PG_PORT` | `5432` | Port de bouclage du PostgreSQL intégré (mode intégré uniquement). Ne le modifiez que si le conteneur partage un réseau où le port 5432 est déjà pris, par exemple avec `--network host`. Il doit être différent de `EMBEDDED_REDIS_PORT` et supérieur à 1023, car PostgreSQL s'exécute sous un utilisateur non privilégié qui ne peut pas se lier à un port privilégié sur le réseau de l'hôte. |
| `EMBEDDED_REDIS_PORT` | `6379` | Idem, pour le Redis intégré, qui s'exécute lui aussi sous un utilisateur non privilégié. |
| `EMBEDDED_DB_PASSWORDS` | (vide) | Définissez `1` pour générer, au prochain démarrage, des mots de passe aléatoires pour les rôles du PostgreSQL intégré et pour Redis, conservés dans `/data/.embedded-db-secrets`. Les connexions TCP en ont ensuite besoin. Sur un volume créé pour la première fois par la version 2.3.0 ou ultérieure, le superutilisateur PostgreSQL ne peut pas du tout se connecter via TCP ; sur un volume plus ancien, le propriétaire de la base de données est le superutilisateur, et c'est son mot de passe qui le protège. Utilisez-la dès que d'autres programmes partagent le réseau du conteneur, par exemple avec `--network host`. Elle reste active pour ce volume : les mots de passe sont utilisés à chaque démarrage même si vous supprimez cette variable, et supprimer `/data/.embedded-db-secrets` ne vous apporte que de nouveaux mots de passe, ou un démarrage qui échoue si la variable n'est pas définie. Si le conteneur ne démarre pas parce que l'un de ces fichiers est endommagé, supprimez ce fichier avec `docker run --rm -v <volume>:/data --entrypoint rm snapotter/snapotter:<your tag> -r /data/.embedded-db-secrets/<name>` puis redémarrez le conteneur ; le démarrage suivant en crée un nouveau. La variable accepte `1`, `0` ou une valeur vide, et toute autre valeur interrompt le démarrage. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Nombre de secondes pendant lesquelles le démarrage attend que le Redis intégré réponde à `PING` avant d'abandonner. En cas de dépassement, le conteneur s'arrête et consigne la raison, au lieu de rester bloqué. Secondes entières de 1 à 999999 ; il n'existe pas de valeur illimitée, car attendre indéfiniment est précisément la défaillance que cette limite vise à éviter. Augmentez-la uniquement si un hôte lent la déclenche. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | Idem, pour le PostgreSQL intégré. Le compte à rebours démarre après la fin de `initdb` au premier démarrage, il couvre donc le démarrage du serveur et la reprise après incident, et non la création initiale de la base de données. |

Mise à niveau depuis la version 1.x : placez votre ancien `snapotter.db` à `/data/snapotter.db` dans le volume et le mode intégré l'importe dans le PostgreSQL intégré au premier démarrage. L'import s'exécute une fois ; les démarrages suivants l'ignorent.

Note sur la télémétrie : le mode intégré hérite de la valeur d'analytique par défaut de l'image comme toute autre configuration. L'image publiée est livrée avec l'analytique activée ; pour la désactiver, compilez avec `--build-arg SNAPOTTER_ANALYTICS=off`, définissez `SNAPOTTER_ANALYTICS_DEFAULT=off` avant le premier démarrage, ou utilisez la désactivation admin intégrée à l'application.

### Limites de traitement {#processing-limits}

| Variable | Par défaut | Description |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (illimité) | Taille maximale de fichier par téléversement en mégaoctets. Mettez 0 pour illimité. L'image publiée est livrée avec `0` ; une compilation depuis les sources démarre à 100. |
| `MAX_BATCH_SIZE` | `0` (illimité) | Nombre maximal de fichiers dans une seule requête par lots. Mettez 0 pour illimité. L'image publiée est livrée avec `0` ; une compilation depuis les sources démarre à 100. |
| `CONCURRENT_JOBS` | `0` (auto) | Nombre de tâches par lots exécutées en parallèle. Mettez 0 pour détecter automatiquement selon les cœurs CPU disponibles. |
| `MAX_MEGAPIXELS` | `0` (aucune limite de l'application) | Résolution d'image maximale autorisée en mégapixels. Mettez 0 pour supprimer la limite propre à SnapOtter. Le décodeur d'images refuse toujours tout ce qui dépasse environ 268 MP (16383 x 16383 pixels) : une valeur supérieure à 268 n'a donc aucun effet supplémentaire. |
| `MAX_CPU_UPSCALE_MP` | `4` | Plus grande entrée, en mégapixels, que l'agrandissement par IA accepte sur un hôte sans GPU. La sortie agrandie est également plafonnée à 16 fois cette valeur (64 MP par défaut), si bien qu'un facteur d'échelle élevé abaisse encore la limite d'entrée. Une image plus grande est réduite pour tenir avant l'agrandissement ; si le résultat n'était alors pas plus grand que l'original, la requête est refusée. Lanczos ignore la limite d'entrée mais pas le plafond de sortie. Mettez 0 pour aucune limite, ce qui demande beaucoup de RAM : RealESRGAN construit toujours en interne un tampon 4x. |
| `MAX_WORKSPACE_SIZE_GB` | `0` (illimité) | Plafond en Go de la taille cumulée des téléversements et des résultats stockés dans l'espace de travail. Une fois dépassé, les téléversements et les requêtes d'outils reçoivent un 503 jusqu'à l'expiration des fichiers après `FILE_MAX_AGE_HOURS`. Mettez 0 pour illimité ; le stockage local refuse toujours les écritures avec un 503 lorsqu'il reste moins de 0,5 Go libre sur le disque. L'image publiée est livrée avec `0` ; une compilation depuis les sources démarre à 10. |
| `MAX_WORKER_THREADS` | `0` (auto) | Nombre maximal de threads de travail pour le traitement d'images. Mettez 0 pour détecter automatiquement selon les cœurs CPU disponibles. |
| `PROCESSING_TIMEOUT_S` | `0` (aucune limite) | Délai d'expiration de chaque appel au sidecar Python qui exécute les outils d'IA, en secondes. Définissez 0 pour aucune limite. Il ne plafonne pas les tâches d'image, de PDF ou de média ; ce sont `JOB_TIMEOUT_FAST_S` et `JOB_TIMEOUT_LONG_S` qui s'en chargent. |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Nombre de secondes pendant lesquelles le sidecar d'IA Python et le runtime d'OCR précis restent inactifs avant de s'arrêter et de libérer leur mémoire (environ 1,3 GB et 0,7 GB une fois chauds). Tous deux redémarrent à la requête suivante, de sorte que le premier appel d'IA après un arrêt pour inactivité subit le coût de démarrage des bibliothèques, quelques secondes. Définissez 0 pour les garder en fonctionnement. La valeur par défaut correspond à `AI_SESSION_IDLE_TIMEOUT`, afin que les modèles chargés ne soient pas abandonnés plus tôt que ne l'indique ce paramètre. Si vous augmentez `AI_SESSION_IDLE_TIMEOUT`, augmentez celle-ci d'autant. |
| `AI_SESSION_IDLE_TIMEOUT` | `0` (auto) | Secondes pendant lesquelles un modèle d'IA chargé reste en cache dans le sidecar après sa dernière utilisation. En auto, c'est 600. Lu par le sidecar Python, qui abandonne aussi tous les modèles en cache lorsqu'il s'arrête après `AI_SIDECAR_IDLE_TIMEOUT`. |
| `AI_SESSION_CACHE_BYTES` | `0` (auto) | Budget mémoire pour les modèles d'IA en cache, en octets. En auto, c'est 40 % de la mémoire du GPU, et aucun cache du tout sur un hôte CPU uniquement. Définissez-le sur un hôte CPU pour mettre les modèles en cache en RAM ; mettez 1 pour désactiver le cache sur un hôte GPU. Lu par le sidecar Python. |
| `MAX_AI_JOBS_PER_USER` | `5` | Nombre de tâches d'IA à fichier unique qu'un utilisateur peut avoir en file d'attente ou en cours à la fois. Les suivantes reçoivent un `429` jusqu'à la fin de l'une d'elles. Le pool d'IA exécute une tâche à la fois, ce qui évite qu'un utilisateur l'accapare. Les exécutions d'IA par lots et en pipeline ne comptent pas. Mettez 0 pour illimité. |
| `JOB_TIMEOUT_FAST_S` | `120` | Délai maximal d'une tâche dans les pools rapides (outils d'image et de document), en secondes. Une tâche qui dure plus longtemps échoue avec une erreur de délai d'expiration. Définissez 0 pour aucune limite. |
| `JOB_TIMEOUT_LONG_S` | `7200` | Délai maximal d'une tâche dans les pools longs (outils d'IA et de média, ainsi que tout outil marqué comme long), en secondes. Définissez 0 pour aucune limite. L'OCR de PDF en modes Balanced et Best prolonge son propre délai selon le nombre de pages (2 et 5 minutes par page), jusqu'à 6 heures, si bien qu'un PDF volumineux ne nécessite pas d'augmenter cette valeur. |
| `SYNC_WAIT_MS` | `8000` | Durée pendant laquelle une requête d'outil attend sa tâche avant que l'API cesse d'attendre et renvoie `202` avec un identifiant de tâche à suivre via SSE, en millisecondes. Cela n'arrête pas la tâche. Définissez 0 pour attendre la tâche aussi longtemps qu'elle dure. |
| `MAX_PIPELINE_STEPS` | `20` | Nombre maximal d'étapes dans un pipeline. Mettez 0 pour aucune limite. |
| `MAX_PIPELINE_STEP_PIXELS` | `67108864` | Plus grande sortie qu'une étape de pipeline peut demander, en largeur fois hauteur en pixels (la valeur par défaut correspond à 8192 x 8192). Une étape dont les paramètres en demandent davantage est rejetée avant l'exécution du pipeline. Mettez 0 pour aucune limite. |
| `MAX_CANVAS_PIXELS` | `0` (aucune limite) | Taille de canevas maximale en pixels pour les images de sortie. Mettez 0 pour aucune limite. |
| `MAX_SVG_SIZE_MB` | `50` | Plus grand SVG accepté avant l'assainissement, en mégaoctets. Ici, `0` se comporte différemment des lignes voisines. Il supprime entièrement le plafond de taille appliqué avant l'analyse au lieu de le relever, laissez donc cette valeur définie. |
| `MAX_PDF_PAGES` | `0` (illimité) | Nombre maximal de pages PDF pour la conversion PDF-vers-image. Mettez 0 pour illimité. |
| `MAX_VIDEO_DURATION_S` | `0` (illimité) | Vidéo la plus longue acceptée par les outils vidéo, en secondes. Les fichiers plus longs sont rejetés avant le traitement, avec la durée et la limite dans l'erreur. Mettez 0 pour illimité. |
| `MAX_AUDIO_DURATION_S` | `0` (illimité) | Idem, pour les outils audio. |
| `MAX_VIDEO_BITRATE_KBPS` | `0` (illimité) | Débit global le plus élevé accepté par les outils vidéo, en kilobits par seconde. Mettez 0 pour illimité. |
| `PREVIEW_TIMEOUT_S` | `300` | Délai maximal pour encoder un clip d'aperçu dans le navigateur d'un fichier vidéo ou audio, en secondes. Les aperçus de documents utilisent plutôt `LIBREOFFICE_TIMEOUT_S`. Mettez 0 pour aucune limite. |
| `LIBREOFFICE_TIMEOUT_S` | `120` | Délai maximal pour une conversion LibreOffice (Word, Excel et PowerPoint vers PDF, les convertisseurs de documents et les aperçus de documents), en secondes. Mettez `0` pour aucune limite. |
| `GIF_BG_MAX_FRAMES` | `150` | Nombre maximal d'images que Supprimer l'arrière-plan d'un GIF accepte dans une animation. Les animations plus longues reçoivent un `400` qui indique le nombre d'images. Mettez 0 pour aucune limite d'images ; un budget de pixels distinct s'applique toujours. |
| `SUBPROCESS_MEMORY_LIMIT_MB` | `0` (désactivé) | Plafond d'espace d'adressage, en mégaoctets, pour chacun de ces processus auxiliaires : ffmpeg, ffprobe, Ghostscript, qpdf, LibreOffice, pandoc et pdfcpu dans les moteurs média et document, ainsi que, pour les images, exiftool, les décodeurs et encodeurs HEIF, JPEG XL et JPEG 2000, le décodeur RAW et le décodeur de repli ffmpeg. ImageMagick n'est pas plafonné, car il possède ses propres limites de mémoire, pas plus que le sidecar d'IA. Un processus qui dépasse le plafond est tué au lieu d'entraîner tout le conteneur vers le tueur de mémoire insuffisante. Il plafonne la mémoire virtuelle, pas la mémoire résidente : réglez-le donc bien au-dessus de ce qu'un processus utilise réellement. L'encodeur JPEG XL est le plus gourmand : une image de 24 MP a demandé environ 1,8 Go et a échoué à 1 Go, et augmenter le nombre de threads ou de CPU n'y change pas grand-chose. Tant que le plafond est défini, l'encodeur HEIF est limité à deux threads de travail, ce qui ramène un encodage de 24 MP à environ 0,8 Go au prix d'un encodage plus lent. Commencez à `2048` et ne l'abaissez qu'après avoir testé vos plus gros fichiers. Mettez 0 pour le désactiver et vous appuyer sur la limite de mémoire du conteneur. |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | Taille maximale du champ `settings` qu'une requête d'outil peut transporter, en kilo-octets, comptée en octets UTF-8. Les requêtes au-delà de la limite reçoivent une `400`. Définissez 0 pour aucune limite. Les paramètres réels des outils sont bien inférieurs à 64 KB, n'augmentez donc cette valeur que si un client envoie des paramètres inhabituellement volumineux. |
| `MAX_SUBTITLE_SIZE_MB` | `1` | Plus gros fichier de sous-titres (`.srt`, `.vtt`, `.ass`) accepté par Incruster des sous-titres et Intégrer des sous-titres, en mégaoctets. Les fichiers plus gros reçoivent un `400` qui indique la taille du fichier et la limite. Mettez 0 pour aucune limite. Un fichier de sous-titres de long métrage reste en général bien en dessous de 1 Mo. |
| `MAX_METADATA_TAG_LENGTH` | `10000` | Valeur la plus longue que Modifier les métadonnées écrit dans une seule balise (artiste, description, mots-clés, etc.), en caractères. Les valeurs plus longues reçoivent un `400` qui indique la balise et la limite. Mettez 0 pour aucune limite. Augmentez-la si vous stockez de longues légendes ou descriptions. La valeur d'une balise doit aussi tenir dans `MAX_SETTINGS_PAYLOAD_KB` et dans la limite par argument du système d'exploitation (128 Ko sous Linux). |

### Moteurs {#engines}

SnapOtter recherche chaque binaire de traitement sur `$PATH` à l'intérieur du conteneur ; ces variables restent donc vides, sauf si vous montez votre propre compilation.

| Variable | Par défaut | Description |
|---|---|---|
| `FFMPEG_PATH` | (vide) | Chemin vers le binaire `ffmpeg` utilisé par les outils vidéo et audio. |
| `FFPROBE_PATH` | (vide) | Chemin vers `ffprobe`, qui lit les fichiers multimédias avant leur traitement. Pointez-le vers la même compilation que `FFMPEG_PATH`. |
| `QPDF_PATH` | (vide) | Chemin vers `qpdf`, utilisé par les outils PDF et pour vérifier les PDF téléversés. |
| `SOFFICE_PATH` | (vide) | Chemin vers `soffice` de LibreOffice, utilisé pour les conversions de documents bureautiques. |
| `PDFCPU_PATH` | (vide) | Chemin vers `pdfcpu`, utilisé par certains outils PDF. |
| `GS_PATH` | (vide) | Chemin vers `gs` de Ghostscript, utilisé par les outils PDF et l'OCR de PDF. |
| `PANDOC_PATH` | (vide) | Chemin vers `pandoc`, utilisé pour les conversions de documents. |
| `SNAPOTTER_FONT_FILE` | (vide) | Fichier de police pour le texte dessiné sur la vidéo (incrustation de sous-titres, filigrane vidéo). Vide utilise la première police trouvée par l'image. |
| `SNAPOTTER_FONT_FAMILY` | (vide) | Nom de famille de `SNAPOTTER_FONT_FILE`. Vide signifie `Sans`. |
| `SNAPOTTER_HW_ACCEL` | (vide) | Famille d'encodeur vidéo matériel, `nvenc` ou `vaapi`. Si vide, l'encodage se fait en logiciel. |

`SNAPOTTER_HW_ACCEL` nécessite un ffmpeg compilé avec cette famille d'encodeurs, et le ffmpeg fourni dans l'image n'embarque aucun de ces encodeurs. Avec le binaire de l'image, le réglage revient à l'encodage logiciel et l'indique dans le journal de démarrage. Pour l'utiliser, montez votre propre compilation de ffmpeg, pointez `FFMPEG_PATH` et `FFPROBE_PATH` dessus et donnez au conteneur l'accès au périphérique GPU. Pour `nvenc`, définissez aussi `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video` : l'image ne demande que `compute,utility`, et sans `video` l'environnement d'exécution NVIDIA ne monte pas la bibliothèque d'encodage, si bien que l'encodeur est listé mais que chaque encodage échoue. Une substitution de chemin qui n'existe pas ou qui n'est pas exécutable est également signalée dans le journal de démarrage, et chaque tâche qui a besoin de ce binaire échoue jusqu'à ce que vous corrigiez le chemin ou que vous le désactiviez.

Les fichiers Compose publiés les transmettent toutes depuis `.env`, il suffit donc de les y définir.

### Nettoyage {#cleanup}

| Variable | Par défaut | Description |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Durée de conservation des résultats de traitement non enregistrés (téléversements bruts et sorties d'outils) avant suppression automatique. Les fichiers que vous enregistrez explicitement dans la bibliothèque Fichiers ne sont pas affectés et persistent jusqu'à ce que vous les supprimiez. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Fréquence d'exécution de la tâche de nettoyage. |
| `JOBS_RETENTION_DAYS` | `30` | Nombre de jours pendant lesquels l'enregistrement d'une tâche terminée (réussie, échouée ou annulée) est conservé avant que le nettoyage de rétention, exécuté toutes les 6 heures, le supprime. Un admin peut le remplacer dans Paramètres > Système. Les utilisateurs et équipes sous conservation légale gardent les leurs. Mettez 0 pour les conserver indéfiniment. |
| `AUDIT_RETENTION_DAYS` | `0` (indéfiniment) | Nombre de jours pendant lesquels les entrées du journal d'audit sont conservées. Mêmes règles de remplacement et de conservation légale. Rien n'est supprimé tant que la journalisation d'audit inviolable est activée. Mettez 0 pour les conserver indéfiniment. |

### Licence entreprise {#enterprise-license}

| Variable | Par défaut | Description |
|---|---|---|
| `SNAPOTTER_LICENSE_KEY` | (vide) | Clé de licence qui déverrouille les fonctionnalités entreprise, comme SAML, SCIM et le stockage S3. Lue au démarrage, redémarrez donc après l'avoir modifiée. Une clé invalide ou expirée consigne un avertissement et le serveur fonctionne sans ces fonctionnalités. Dans le conteneur, vous pouvez plutôt la monter via `SNAPOTTER_LICENSE_KEY_FILE` (voir [Secrets Docker](/fr/guide/security#docker-secrets)). |

### Apparence {#appearance}

| Variable | Par défaut | Description |
|---|---|---|
| `DEFAULT_THEME` | `light` | Thème par défaut pour les nouvelles sessions. `light`, `dark` ou `system`. |
| `DEFAULT_LOCALE` | `en` | Langue d'interface par défaut. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Disposition d'outil par défaut. `sidebar` ou `fullscreen`. |

### Permissions Docker {#docker-permissions}

| Variable | Par défaut | Description |
|---|---|---|
| `PUID` | `999` | Exécuter le processus du conteneur sous cet UID. Réglez-le pour correspondre à votre utilisateur hôte pour les bind mounts (`id -u`). Nécessite un système de fichiers racine accessible en écriture ; consultez le [guide de sécurité](/fr/guide/security#why-read-only-is-not-set). |
| `PGID` | `999` | Exécuter le processus du conteneur sous ce GID. Réglez-le pour correspondre à votre groupe hôte pour les bind mounts (`id -g`). Nécessite un système de fichiers racine accessible en écriture ; consultez le [guide de sécurité](/fr/guide/security#why-read-only-is-not-set). |

## Exemple Docker {#docker-example}

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
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
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

## Volumes {#volumes}

La pile Docker Compose utilise quatre volumes :

- `/data` (app) - Modèles d'IA, environnement virtuel Python et fichiers utilisateur. Montez-le pour conserver les fichiers téléversés et les modules d'IA installés entre les redémarrages.
- `/tmp/workspace` (app) - Stockage temporaire des fichiers en cours de traitement. Il peut être éphémère, mais le monter évite de remplir la couche accessible en écriture du conteneur.
- `SnapOtter-pgdata` (postgres) - Répertoire de données de PostgreSQL. Il contient toutes les données relationnelles (utilisateurs, paramètres, pipelines, tâches, journal d'audit). Sauvegardez-le via `pg_dump` ou un instantané de volume.
- `SnapOtter-redisdata` (redis) - Fichier en écriture seule de Redis pour des files d'attente de tâches durables.
