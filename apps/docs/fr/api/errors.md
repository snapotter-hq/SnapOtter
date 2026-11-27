---
title: "Codes d'erreur"
description: "La forme du corps d'erreur, les codes stables et la marche à suivre pour chacun."
i18n_source_hash: 7e48ef36024d
i18n_provenance: machine
i18n_output_hash: 079e0cfe4390
i18n_hash_version: 2
---

# Codes d'erreur {#error-codes}

Chaque réponse d'erreur JSON a la même forme :

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Champ | Toujours présent | Signification |
|-------|----------------|---------|
| `error` | Oui | Un message lisible par un humain. Peut être affiché aux utilisateurs. Ne l'analysez pas. |
| `code` | Oui | Un code stable, lisible par une machine. Branchez votre logique dessus. |
| `requestId` | Oui | L'identifiant de cette requête côté serveur. Citez-le quand vous signalez un problème ; il correspond au journal du serveur. |
| `details` | Parfois | Plus de contexte pour certaines erreurs 4xx, comme le message de validation. |

Les messages peuvent changer d'une version à l'autre. Les codes, non : écrivez donc la logique de votre client à partir de `code`.

## Codes issus du statut HTTP {#status-codes}

Quand une route ne définit pas son propre code, le serveur en déduit un à partir du statut :

| Statut HTTP | `code` |
|-------------|--------|
| 400 | `BAD_REQUEST` |
| 401 | `AUTH_REQUIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 501 | `NOT_IMPLEMENTED` |
| 503 | `SERVICE_UNAVAILABLE` |
| 507 | `INSUFFICIENT_STORAGE` |

Toute autre erreur 4xx retombe sur `BAD_REQUEST`, et toute autre erreur 5xx sur `INTERNAL_ERROR`.

Une route peut définir un code plus précis, et la réponse porte alors ce code à la place. Par exemple, un outil qui ne peut pas s'exécuter parce que son bundle d'IA est absent renvoie un code propre à la fonctionnalité. Ces codes sont décrits avec la fonctionnalité qui les déclenche.

## Authentification et accès {#auth-codes}

| `code` | Statut | Que faire |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | Envoyez `Authorization: Bearer <token>` avec un jeton de session ou une clé d'API (`si_...`). |
| `FORBIDDEN` | 403 | L'identifiant est valide mais n'a pas la permission. Demandez la permission à un administrateur. |
| `MUST_CHANGE_PASSWORD` | 403 | Le compte doit changer son mot de passe avant de pouvoir appeler d'autres endpoints. Appelez `POST /api/auth/change-password` avec le jeton de session, puis réessayez. |
| `USER_DISABLED` | 403 | Le compte est désactivé. Un administrateur doit le réactiver. |
| `LOGIN_THROTTLED` | 429 | Trop de tentatives de connexion échouées. Patientez avant de réessayer. |
| `VALIDATION_ERROR` | 400 | Le corps ou les paramètres de la requête ont échoué à la validation. `details` indique le problème. |

Le compte administrateur du premier démarrage est `admin` avec le mot de passe `admin`, sauf si `DEFAULT_USERNAME` ou `DEFAULT_PASSWORD` l'a modifié. Sauf si `SKIP_MUST_CHANGE_PASSWORD` est défini, ce compte reçoit `MUST_CHANGE_PASSWORD` à chaque appel tant que le mot de passe n'a pas été changé.

## Tâches {#job-codes}

Une tâche qui échoue indique sa raison sur la tâche elle-même, pas dans l'erreur HTTP. Lisez `error.code` et `error.message` depuis `GET /api/v1/jobs/{jobId}`. Voir [Suivi de la progression](/fr/api/rest#progress-tracking).

Une tâche échouée conserve `error.code` uniquement quand l'échec est une erreur d'entrée ou une panne du serveur. Les autres échecs ne portent que le message.

| `code` | Signification | Que faire |
|--------|---------|------------|
| `CANCELED` | La tâche a été annulée par un utilisateur. Ce n'est pas un statut HTTP. Les événements de progression portent `phase: failed` avec ce code. | Traitez-le comme une annulation par l'utilisateur. Ne le réessayez pas automatiquement. |
| `INPUT_MISSING` | L'entrée a été supprimée avant l'exécution de la tâche. | Téléversez à nouveau le fichier. |
| `ENGINE_UNAVAILABLE` | Un moteur requis n'a pas pu démarrer sur le serveur. | Réessayez après la réparation de l'installation par un administrateur. |
| `JOB_STALLED` | Non renvoyé aux clients : il sert d'étiquette au rapport d'erreur du serveur. Le worker a perdu le verrou de la tâche plus de fois que la file ne l'autorise, généralement parce que le serveur a redémarré ou manqué de mémoire ou de CPU. La tâche échoue avec un message indiquant qu'elle a été interrompue. | Réessayez. Si cela persiste, donnez plus de mémoire au serveur ou réduisez `CONCURRENT_JOBS`. |

## Authentification et MFA {#mfa-codes}

| `code` | Statut | Signification | Que faire |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | La politique MFA exige une inscription, et cette instance ne peut pas inscrire l'utilisateur (pas de licence entreprise). Les instances sous licence renvoient 200 avec `requiresMfaEnrollment: true` et guident l'utilisateur dans l'inscription à la place. | Ne réessayez pas. Un administrateur doit modifier la politique ou utiliser la CLI de récupération hors ligne. |
| `MFA_POLICY_UNAVAILABLE` | 503 | Le serveur n'a pas pu lire la politique MFA pendant la connexion. | Réessayez la connexion sous peu. |
| `INVALID_CODE` | 401 | Le code TOTP ou de récupération est incorrect. | Demandez un nouveau code à l'utilisateur et réessayez. Des échecs répétés aboutissent à `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Trop de codes incorrects. Le défi est abandonné. | Recommencez la connexion pour obtenir un nouveau défi. |
| `MFA_EXPIRED` | 401 | Le défi MFA ou d'inscription a expiré ou ne correspond pas. | Recommencez la connexion. |
| `MFA_NOT_CONFIGURED` | 401 | Le compte n'a pas de secret TOTP, un code ne peut donc pas être vérifié. | Inscrivez la MFA avant de vous connecter avec un code. |
| `MFA_ALREADY_ENABLED` | 409 | La MFA est déjà active sur le compte. | Ne vous inscrivez pas à nouveau. |
| `NO_PENDING_ENROLLMENT` | 400 | Une confirmation d'inscription est arrivée sans inscription en attente. | Appelez d'abord l'endpoint d'inscription. |
| `MFA_NOT_ENABLED` | 400 | L'action exige que la MFA soit activée, et elle est désactivée pour cet utilisateur. | Ignorez l'action, ou activez d'abord la MFA. |
| `MFA_DECRYPTION_FAILED` | 500 | Le secret TOTP stocké ne peut pas être déchiffré. | Action de l'opérateur. Cela signifie généralement que la clé de chiffrement a changé. Vérifiez `DATA_ENCRYPTION_KEY` et `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Une valeur stockée (un paramètre, un en-tête d'authentification de webhook ou un secret TOTP) ne peut pas être déchiffrée. | Action de l'opérateur, comme ci-dessus. Ne réessayez pas. |
| `IDLE_TIMEOUT` | 401 | La session a expiré après une période d'inactivité. | Reconnectez-vous. |
| `INVALID_PASSWORD` | 401 | Le mot de passe actuel est incorrect lors d'un changement de mot de passe. | Demandez à l'utilisateur son mot de passe actuel. |
| `PASSWORD_CHANGED` | 409 | Le mot de passe a changé dans une autre session, ou un administrateur l'a réinitialisé, pendant l'exécution de cette requête. | Reconnectez-vous. |
| `OIDC_NO_PASSWORD` | 400 | Un changement ou une réinitialisation de mot de passe a été demandé pour un compte créé via SSO. | Orientez l'utilisateur vers le fournisseur d'identité. |

## OIDC {#oidc-codes}

Les échecs OIDC pendant la connexion ne renvoient pas de corps JSON. La route de connexion redirige vers la page de connexion avec une raison générique, et le journal d'audit enregistre le code. La route de déconnexion met quand même fin à la session locale quand le fournisseur d'identité est injoignable.

| `code` | Statut | Signification | Que faire |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Aucun (redirection) | L'URL de l'émetteur est `http`, mais `EXTERNAL_URL` vaut `https`, donc le client refuse la découverte. | Administrateur : servez l'émetteur en `https`, ou exécutez l'instance en `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Aucun (redirection) | La découverte de l'émetteur a expiré. | Vérifiez que le serveur peut joindre l'émetteur, puis réessayez. |
| `OIDC_DISCOVERY_FAILED` | Aucun (redirection) | La découverte a échoué pour une autre raison. | Vérifiez l'URL de l'émetteur et l'accès sortant du serveur. |
| `OIDC_END_SESSION_INVALID` | Aucun (la déconnexion continue) | Le `end_session_endpoint` du fournisseur d'identité n'est pas une URL valide. La session locale est quand même effacée. | Administrateur : corrigez les métadonnées du fournisseur. |
| `OIDC_END_SESSION_SCHEME` | Aucun (la déconnexion continue) | Le `end_session_endpoint` utilise un schéma que le serveur n'autorise pas. La session locale est quand même effacée. | Administrateur : corrigez les métadonnées du fournisseur. |

## SAML {#saml-codes}

Les échecs SAML ne définissent pas de `code`. Une assertion échouée redirige vers la page de connexion avec `saml_auth_failed`, et l'événement d'audit `SAML_LOGIN_FAILED` enregistre la raison.

## SCIM {#scim-codes}

Les routes SCIM répondent avec l'enveloppe d'erreur de la RFC 7644 (`schemas`, `detail`, `status`, et parfois `scimType`). Elles ne définissent pas `code`. Branchez votre logique sur le statut HTTP.

## Équipes, rôles et utilisateurs {#team-role-codes}

Les noms d'équipe ou de rôle en double renvoient le `CONFLICT` générique, et une équipe ou un rôle manquant renvoie `NOT_FOUND`.

| `code` | Statut | Signification | Que faire |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | Le rôle de l'appelant n'autorise pas la modification. La cible est au-dessus de l'autorité de l'appelant, le rôle est intégré, ou la requête accorde des permissions que l'appelant ne détient pas. | Ne réessayez pas. Demandez à un utilisateur ayant plus d'autorité. |
| `UNKNOWN_ROLE` | 400 | L'ID de rôle ne correspond à aucun rôle existant. | Corrigez l'ID de rôle. Listez les rôles pour le trouver. |
| `UNKNOWN_TEAM` | 400 | L'ID d'équipe ne correspond à aucune équipe existante. | Corrigez l'ID d'équipe. |
| `SELF_DEMOTE` | 400 | Un administrateur a tenté de retirer son propre rôle d'administrateur. | Demandez à un autre administrateur d'effectuer la modification. |
| `SELF_DELETE` | 400 | Un administrateur a tenté de supprimer son propre compte. | Demandez à un autre administrateur de le supprimer. |
| `LAST_ADMIN` | 400 sur les routes utilisateur, 409 sur les routes de purge RGPD | La modification ne laisserait aucun administrateur, ou purgerait une équipe qui contient tous les administrateurs. | Faites d'abord d'un autre utilisateur un administrateur. |
| `USER_LIMIT_REACHED` | 403 | L'instance a atteint sa limite `MAX_USERS`. | Supprimez un utilisateur, ou augmentez `MAX_USERS`. |

## Fonctionnalités et bundles d'IA {#feature-codes}

Les outils, les exécutions par lot et les pipelines qui nécessitent un bundle d'IA optionnel utilisent ces codes.

| `code` | Statut | Signification | Que faire |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501, ou 400 depuis le mode visage de Smart Crop | L'outil, ou une étape d'un pipeline ou d'un lot, nécessite un bundle qui n'est pas installé. Le corps inclut `feature` (l'ID du bundle) et `featureName`. | Installez le bundle dans les Paramètres, puis réessayez. |
| `FEATURE_CPU_UNSUPPORTED` | 409 | Une installation ou un import hors ligne a été refusé car les bibliothèques x86-64 du bundle nécessitent AVX et le CPU de ce serveur ne l'a pas. Rien n'a été téléchargé ni installé. Le corps inclut `feature` (l'ID du bundle) et `reason` (`cpu-no-avx`). `GET /api/v1/features` signale le même bundle avec `compatibility: "incompatible"` et `compatibilityReason: "cpu-no-avx"`. | Exécutez SnapOtter sur un CPU avec AVX, ou sur arm64. Les autres bundles s'installent normalement. |
| `FEATURE_INSTALL_BUSY` | 409 | Une annulation a été refusée parce que l'installateur écrit dans l'environnement IA partagé, et l'arrêter à ce moment-là casserait tous les outils IA installés. | Attendez la fin de l'installation, puis désinstallez le bundle si vous n'en voulez pas. |
| `FEATURE_INCOMPATIBLE` | 501, ou 400 quand Fast OCR reçoit une langue qu'il ne sait pas lire | La fonctionnalité installée ne peut pas fournir la qualité ou la langue demandée. | Modifiez le paramètre, ou installez un bundle qui le prend en charge. |
| `ENGINE_UNAVAILABLE` | 503 | Un moteur requis n'a pas pu démarrer, ou un runtime OCR a été supprimé après la validation de la requête. | Réessayez après la réparation ou la réinstallation de la fonctionnalité par un administrateur. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium n'est pas installé, donc HTML vers image ne peut pas s'exécuter. | Demandez à un administrateur d'installer le navigateur. |
| `BROWSER_CRASHED` | 503 | Le navigateur de capture d'écran a planté pendant le rendu. | Réessayez la requête. |

## Outils {#tool-codes}

| `code` | Statut | Signification | Que faire |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | L'entrée téléversée a été supprimée avant l'exécution de la tâche. | Téléversez à nouveau le fichier et soumettez la tâche. |
| `ANALYSIS_EXPIRED` | 410 | L'analyse de la photo d'identité a expiré avant la génération. | Analysez à nouveau la photo, puis générez. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Le résultat de la suppression d'arrière-plan a expiré avant l'étape suivante. | Supprimez à nouveau l'arrière-plan. |
| `NOT_ANIMATED` | 400 | Remove GIF Background a reçu une image fixe. | Utilisez Remove Background pour les images fixes. |
| `TOO_MANY_FRAMES` | 400 | L'animation a plus d'images que le serveur n'en autorise (`GIF_BG_MAX_FRAMES`). | Envoyez une animation plus courte, ou demandez à un administrateur d'augmenter la limite. |
| `TOO_MANY_PIXELS` | 400 | Le canevas de l'animation multiplié par son nombre d'images dépasse la limite du serveur : 268 402 689 pixels (16383 x 16383) pour Remove GIF Background, ou le plafond de charge GIF pour les autres outils animés. | Envoyez moins d'images ou une animation plus petite. |
| `MULTI_FRAME_UNSUPPORTED` | 400 | Un outil d'image IA a reçu un TIFF multipage ou un GIF ou WebP animé, et le format de sortie conserverait toutes les images. Ces outils exécutent leur modèle sur une seule image à la fois. | Séparez le fichier en images distinctes. Si l'outil propose un paramètre de format de sortie, un format fixe comme PNG ne traite que la première image. |
| `IMAGE_TOO_LARGE` | 400 | L'image a plus de pixels que le décodeur n'en accepte. | Envoyez une image plus petite. |
| `SVG_TOO_COMPLEX` | 400 | Le SVG n'a pas fini d'être rastérisé dans le délai `JOB_TIMEOUT_FAST_S`. La cause habituelle est un filtre appliqué à des formes que `<use>` répète, car chaque copie repeint le filtre. | Simplifiez les filtres ou les formes répétées, ou demandez à un administrateur d'augmenter la limite. |
| `RESULT_TOO_LARGE` | 400 | Les paramètres produiraient une image plus grande que ne le permet la limite de l'encodeur ou de pixels. | Utilisez une image plus petite ou des paramètres qui donnent un résultat plus petit. |
| `DOCUMENT_UNREADABLE` | 400 | LibreOffice ou pandoc n'a pas pu ouvrir le document. Il est peut-être endommagé, protégé par mot de passe, ou n'est pas au format indiqué par son extension. | Vérifiez que le fichier s'ouvre dans une application bureautique, puis renvoyez-le. |
| `PDF_DAMAGED` | 400 | Le moteur PDF a trouvé une structure de document corrompue. | Passez le fichier dans Repair PDF, puis réessayez. |
| `PDF_PASSWORD_PROTECTED` | 400 | Le PDF est chiffré et cet outil ne peut pas l'ouvrir. | Déverrouillez-le d'abord avec Unlock PDF. |
| `NO_AUDIO_TRACK` | 400 | Le fichier n'a pas de flux audio utilisable par un outil audio. | Envoyez un fichier qui contient de l'audio. |
| `MEDIA_UNDECODABLE` | 400 | ffmpeg n'a pas pu lire l'audio ou la vidéo : il n'a trouvé aucun paquet, aucun paramètre de codec, aucun atome `moov`, ou des données qu'il ne sait pas analyser. | Vérifiez que le fichier se lit dans un lecteur multimédia, ou réexportez-le, puis réessayez. |
| `ENCODED_TEXT_INVALID` | 400 | Base64 Encode / Decode a reçu une entrée qui n'est pas du Base64. Les espaces sont ignorés et l'alphabet standard comme l'alphabet compatible URL sont acceptés. | Vérifiez que le texte ne contient pas de caractères parasites ou une fin tronquée. |
| `DECODED_DATA_NOT_TEXT` | 400 | Le Base64 est valide mais se décode en données binaires, pas en texte UTF-8. | Décodez-le avec un outil qui enregistre un fichier au lieu d'afficher du texte. |
| `PAGE_OUT_OF_RANGE` | 400 | La plage de pages désigne une page que le PDF n'a pas. | Vérifiez le nombre de pages et envoyez une plage qui y est contenue. |
| `INVALID_PAGE_RANGE` | 400 | La plage de pages n'a pas une syntaxe valide. | Utilisez des numéros de page comme `1-3,5`. |
| `CANNOT_REMOVE_ALL_PAGES` | 400 | Remove Pages a reçu la demande de supprimer toutes les pages. | Conservez au moins une page. |
| `NESTING_TOO_DEEP` | 400 | Le JSON ou le XML est imbriqué sur plus de 100 niveaux. | Aplatissez le document, puis convertissez-le. |
| `IMAGE_UNDECODABLE` | 400 | L'image ne peut pas être décodée, ou ses dimensions ne peuvent pas être lues. Le fichier est peut-être endommagé ou utilise un encodage que le décodeur ne prend pas en charge. | Réexportez l'image depuis une autre application, ou convertissez-la d'abord en PNG ou JPEG. |
| `INVALID_SETTINGS` | 400 | Un paramètre est hors plage ou ne convient pas à ce fichier : un recadrage hors de l'image, un redimensionnement à zéro, une image de GIF que l'animation n'a pas, une spécification de photo d'identité qui n'existe pas. Le texte de `error` nomme le paramètre. | Corrigez le paramètre nommé dans `error`, puis réessayez. |
| `CHART_DATA_INVALID` | 400 | Chart Maker n'a pas pu lire les données du graphique dans le fichier : le CSV ou le JSON ne s'analyse pas, n'a aucune colonne numérique, a plus de 100 lignes, ou a une valeur négative. Le texte de `error` précise lequel. | Envoyez un CSV ou un JSON de 100 lignes au maximum, chacune avec une étiquette et un nombre supérieur ou égal à zéro. |
| `NO_FACE_DETECTED` | 400 | Passport Photo n'a trouvé aucun visage dans l'image. | Envoyez une photo nette, de face, bien éclairée. |
| `TARGET_SIZE_UNREACHABLE` | 400 | La compression, ou la limite de taille d'une photo d'identité, ne peut pas amener le fichier sous la taille demandée, même après réduction. | Demandez une taille cible plus grande, ou recadrez d'abord l'image. |
| `TOO_MANY_PAGES` | 400 | L'OCR a reçu la demande de traiter plus de pages qu'il n'en traite en une tâche. | Sélectionnez moins de pages avec la plage de pages. |
| `OCR_OUTPUT_TOO_LARGE` | 500 | L'OCR d'un TIFF multipage a lu plus de 1 000 000 d'octets de texte sur l'ensemble de ses pages, ce qui dépasse ce qu'un résultat peut stocker. | Découpez le TIFF en fichiers plus petits et lancez l'OCR sur chacun. |
| `METADATA_DAMAGED` | 400 | Edit Metadata a constaté que les données EXIF existantes de l'image sont endommagées, donc il ne peut pas les réécrire en toute sécurité. | Supprimez d'abord les métadonnées avec Remove Image Metadata, puis modifiez. |
| `REMOTE_RESOURCES_DISABLED` | 400 | HTML ou Markdown vers PDF a trouvé une référence à une image, une feuille de style ou une police sur le réseau, que le serveur ne récupère pas. | Intégrez la ressource dans le fichier (par exemple sous forme d'URI `data:`), puis réessayez. |

## Fichiers {#file-codes}

| `code` | Statut | Signification | Que faire |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | L'enregistrement dans Fichiers dépasserait le quota de stockage de l'utilisateur. | Supprimez des fichiers, ou demandez plus d'espace à un administrateur. |
| `INVALID_STORED_NAME` | 400 | Le serveur a rejeté un nom de fichier stocké. | Téléversez à nouveau le fichier. |

## Pipelines et lots {#pipeline-codes}

Les requêtes de pipeline et de lot renvoient les codes de fonctionnalité ci-dessus pour chaque étape qui nécessite un bundle. Un ID de tâche déjà utilisé renvoie `CONFLICT` avec le statut 409. Envoyez un nouvel ID de tâche.

## Paramètres {#settings-codes}

| `code` | Statut | Signification | Que faire |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | La clé n'est pas un paramètre connu. | Vérifiez le nom de la clé. |
| `READONLY_SETTING` | 400 | Le paramètre ne peut pas être modifié via l'API. | Modifiez-le via l'environnement ou l'interface d'administration. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | La nouvelle valeur entre en conflit avec d'autres paramètres. Le corps nomme le paramètre dans `setting` et liste les problèmes dans `validationErrors`. | Corrigez les paramètres listés, puis réessayez. |
| `SETTING_DECRYPTION_FAILED` | 500 | Un paramètre stocké ne peut pas être déchiffré. | Action de l'opérateur, comme pour `DECRYPTION_FAILED`. |

Pour `VALIDATION_ERROR` sur un paramètre, `details` contient les problèmes de schéma.

## Entreprise {#enterprise-codes}

| `code` | Statut | Signification | Que faire |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | Le paramètre ou la politique nécessite une licence entreprise, comme l'application du SSO ou la politique MFA. | Utilisez une instance sous licence, ou laissez le paramètre désactivé. |
| `IP_NOT_ALLOWED` | 403 | L'adresse IP de la requête n'est pas dans la liste d'autorisation. | Connectez-vous depuis un réseau autorisé. |
| `INVALID_CIDR` | 400 | Une entrée de la liste d'autorisation n'est pas un CIDR valide. Le message liste les entrées incorrectes. | Corrigez les entrées et enregistrez à nouveau. |
| `SELF_LOCKOUT` | 400 | L'enregistrement de la liste d'autorisation bloquerait l'IP actuelle de l'appelant. | Ajoutez d'abord votre IP actuelle à la liste. |

Les routes de purge RGPD renvoient un simple `CONFLICT` avec le statut 409 quand un utilisateur ou une équipe fait l'objet d'une conservation légale.

## Codes que les clients ne reçoivent pas {#internal-codes}

Ces codes existent dans le code source du serveur pour les journaux, la télémétrie ou les propres erreurs de Fastify. Un client ne les reçoit ni dans un corps de réponse ni dans une ligne de tâche, n'écrivez donc pas de logique client à partir d'eux.

| `code` | Où il va |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Signalé au suivi des erreurs par l'évaluateur d'alertes. L'en-tête d'authentification d'un webhook d'alerte ne peut pas être déchiffré. |
| `SIEM_DECRYPTION_FAILED` | Signalé au suivi des erreurs par le transfert SIEM. L'en-tête d'authentification du SIEM ne peut pas être déchiffré. |
| `WEBHOOK_DECRYPTION_FAILED` | Signalé au suivi des erreurs. La requête qui a rencontré le même échec répond avec `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Signalé au suivi des erreurs quand un téléversement en attente ne peut pas être supprimé. |
| `RETENTION_DEADLINE_BACKFILLED` | Signalé au suivi des erreurs par le nettoyage TTL du stockage lorsqu'il renseigne l'échéance de conservation d'équipe manquante d'une tâche terminée. Les fichiers de la tâche suivent alors la conservation de l'équipe. |
| `USERNAME_RACE_EXHAUSTED` | Levé quand la création automatique SSO perd la course au nom d'utilisateur à chaque nouvelle tentative. La page de connexion affiche une erreur à la place. |
| `ERR_OUT_OF_RANGE` | Levé par le lecteur de stockage d'objets pour une plage d'octets invalide. |
| `ETIMEDOUT` | Défini sur l'erreur de délai d'attente d'un export RGPD. L'export échoue, et il peut être redemandé. |
| `FST_REQ_FILE_TOO_LARGE` | Code de Fastify pour un téléversement dépassant la limite. Les clients reçoivent un 413 avec `PAYLOAD_TOO_LARGE`, ou le propre message 413 de la route. |
| `TARGET_SIZE_EXCEEDED` | Levé quand une compression à taille cible manque sa cible. L'erreur n'a ni statut ni code, les clients reçoivent donc un échec générique. |
| `OCR_CACHE_PERMISSIONS` | Signalé au suivi des erreurs comme une défaillance opérationnelle quand le volume de données d'IA laisse le cache du runtime OCR accessible en écriture à tous. La tâche d'installation échoue avec un message qui nomme le problème de stockage. |
| `OCR_RUNTIME_UNREACHABLE` | Signalé au suivi des erreurs comme une défaillance opérationnelle quand le serveur n'a jamais atteint huggingface.co pour télécharger le runtime OCR. La tâche d'installation échoue avec un message sur l'accès réseau, `HTTPS_PROXY`, `HF_ENDPOINT` et l'import hors ligne. |
