---
title: "Codes d'erreur"
description: "La forme du corps d'erreur, les codes stables et la marche à suivre pour chacun."
i18n_source_hash: ed6e0590a6fd
i18n_provenance: machine
i18n_output_hash: d4f91107189c
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
|-------|------------------|---------------|
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

Une tâche en échec conserve `error.code` uniquement quand l'échec est une erreur d'entrée ou une défaillance du serveur. Les autres échecs ne portent que le message.

| `code` | Signification | Que faire |
|--------|---------------|-----------|
| `CANCELED` | La tâche a été annulée par un utilisateur. Ce n'est pas un statut HTTP. Les événements de progression portent `phase: failed` avec ce code. | Traitez-le comme une annulation par l'utilisateur. Ne le relancez pas automatiquement. |
| `INPUT_MISSING` | L'entrée a été supprimée avant l'exécution de la tâche. | Téléversez à nouveau le fichier. |
| `ENGINE_UNAVAILABLE` | Un moteur requis n'a pas pu démarrer sur le serveur. | Réessayez après la réparation de l'installation par un administrateur. |

## Authentification et MFA {#mfa-codes}

| `code` | Statut | Signification | Que faire |
|--------|--------|---------------|-----------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | La politique MFA exige une inscription, et cette instance ne peut pas inscrire l'utilisateur (pas de licence entreprise). Les instances sous licence renvoient 200 avec `requiresMfaEnrollment: true` et guident l'utilisateur dans l'inscription. | Ne réessayez pas. Un administrateur doit modifier la politique ou utiliser la CLI de récupération hors ligne. |
| `MFA_POLICY_UNAVAILABLE` | 503 | Le serveur n'a pas pu lire la politique MFA pendant la connexion. | Réessayez la connexion sous peu. |
| `INVALID_CODE` | 401 | Le code TOTP ou le code de récupération est incorrect. | Demandez un nouveau code à l'utilisateur et réessayez. Des échecs répétés aboutissent à `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Trop de codes erronés. Le défi est abandonné. | Recommencez la connexion pour obtenir un nouveau défi. |
| `MFA_EXPIRED` | 401 | Le défi MFA ou d'inscription a expiré ou ne correspond pas. | Recommencez la connexion. |
| `MFA_NOT_CONFIGURED` | 401 | Le compte n'a pas de secret TOTP, donc un code ne peut pas être vérifié. | Inscrivez l'utilisateur à la MFA avant de se connecter avec un code. |
| `MFA_ALREADY_ENABLED` | 409 | La MFA est déjà active sur le compte. | Ne procédez pas à une nouvelle inscription. |
| `NO_PENDING_ENROLLMENT` | 400 | Une confirmation d'inscription est arrivée sans inscription en attente. | Appelez d'abord l'endpoint d'inscription. |
| `MFA_NOT_ENABLED` | 400 | L'action exige que la MFA soit activée, et elle est désactivée pour cet utilisateur. | Ignorez l'action, ou activez d'abord la MFA. |
| `MFA_DECRYPTION_FAILED` | 500 | Le secret TOTP stocké ne peut pas être déchiffré. | Action de l'opérateur. Cela signifie généralement que la clé de chiffrement a changé. Vérifiez `DATA_ENCRYPTION_KEY` et `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Une valeur stockée (un paramètre, un en-tête d'authentification de webhook ou un secret TOTP) ne peut pas être déchiffrée. | Action de l'opérateur, comme ci-dessus. Ne réessayez pas. |
| `IDLE_TIMEOUT` | 401 | La session a expiré après une période d'inactivité. | Reconnectez-vous. |
| `INVALID_PASSWORD` | 401 | Le mot de passe actuel est incorrect lors d'un changement de mot de passe. | Demandez à l'utilisateur son mot de passe actuel. |
| `PASSWORD_CHANGED` | 409 | Le mot de passe a été changé dans une autre session, ou un administrateur l'a réinitialisé, pendant l'exécution de cette requête. | Reconnectez-vous. |
| `OIDC_NO_PASSWORD` | 400 | Un changement ou une réinitialisation de mot de passe a été demandé pour un compte créé via SSO. | Orientez l'utilisateur vers le fournisseur d'identité. |

## OIDC {#oidc-codes}

Les échecs OIDC pendant la connexion ne renvoient pas de corps JSON. La route de connexion redirige vers la page de connexion avec une raison générique, et le journal d'audit enregistre le code. La route de déconnexion met quand même fin à la session locale lorsque le fournisseur d'identité est injoignable.

| `code` | Statut | Signification | Que faire |
|--------|--------|---------------|-----------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Aucun (redirection) | L'URL de l'émetteur est `http`, mais `EXTERNAL_URL` est `https`, donc le client refuse la découverte. | Administrateur : servez l'émetteur en `https`, ou exécutez l'instance en `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Aucun (redirection) | La découverte de l'émetteur a expiré. | Vérifiez que le serveur peut joindre l'émetteur, puis réessayez. |
| `OIDC_DISCOVERY_FAILED` | Aucun (redirection) | La découverte a échoué pour une autre raison. | Vérifiez l'URL de l'émetteur et l'accès sortant du serveur. |
| `OIDC_END_SESSION_INVALID` | Aucun (la déconnexion continue) | Le `end_session_endpoint` du fournisseur d'identité n'est pas une URL valide. La session locale est tout de même effacée. | Administrateur : corrigez les métadonnées du fournisseur. |
| `OIDC_END_SESSION_SCHEME` | Aucun (la déconnexion continue) | Le `end_session_endpoint` utilise un schéma que le serveur n'autorise pas. La session locale est tout de même effacée. | Administrateur : corrigez les métadonnées du fournisseur. |

## SAML {#saml-codes}

Les échecs SAML ne définissent pas de `code`. Une assertion en échec redirige vers la page de connexion avec `saml_auth_failed`, et l'événement d'audit `SAML_LOGIN_FAILED` enregistre la raison.

## SCIM {#scim-codes}

Les routes SCIM répondent avec l'enveloppe d'erreur de la RFC 7644 (`schemas`, `detail`, `status`, et parfois `scimType`). Elles ne définissent pas `code`. Branchez votre logique sur le statut HTTP.

## Équipes, rôles et utilisateurs {#team-role-codes}

Les noms d'équipe ou de rôle en double renvoient le code générique `CONFLICT`, et une équipe ou un rôle introuvable renvoie `NOT_FOUND`.

| `code` | Statut | Signification | Que faire |
|--------|--------|---------------|-----------|
| `ESCALATION_DENIED` | 403 | Le rôle de l'appelant n'autorise pas la modification. La cible se situe au-dessus de l'autorité de l'appelant, le rôle est intégré, ou la requête accorde des permissions que l'appelant ne détient pas. | Ne réessayez pas. Adressez-vous à un utilisateur ayant plus d'autorité. |
| `UNKNOWN_ROLE` | 400 | L'identifiant de rôle ne correspond à aucun rôle existant. | Corrigez l'identifiant de rôle. Listez les rôles pour le retrouver. |
| `UNKNOWN_TEAM` | 400 | L'identifiant d'équipe ne correspond à aucune équipe existante. | Corrigez l'identifiant d'équipe. |
| `SELF_DEMOTE` | 400 | Un administrateur a tenté de retirer son propre rôle d'administrateur. | Demandez à un autre administrateur d'effectuer la modification. |
| `SELF_DELETE` | 400 | Un administrateur a tenté de supprimer son propre compte. | Demandez à un autre administrateur de le supprimer. |
| `LAST_ADMIN` | 400 sur les routes utilisateur, 409 sur les routes de purge RGPD | La modification ne laisserait aucun administrateur, ou purgerait une équipe qui contient tous les administrateurs. | Faites d'abord d'un autre utilisateur un administrateur. |
| `USER_LIMIT_REACHED` | 403 | L'instance a atteint sa limite `MAX_USERS`. | Supprimez un utilisateur, ou augmentez `MAX_USERS`. |

## Fonctionnalités et bundles d'IA {#feature-codes}

Les outils, exécutions par lot et pipelines qui nécessitent un bundle d'IA optionnel utilisent ces codes.

| `code` | Statut | Signification | Que faire |
|--------|--------|---------------|-----------|
| `FEATURE_NOT_INSTALLED` | 501 | L'outil, ou une étape d'un pipeline ou d'un lot, nécessite un bundle qui n'est pas installé. Le corps inclut `feature` (l'identifiant du bundle) et `featureName`. | Installez le bundle dans les Paramètres, puis réessayez. |
| `FEATURE_INCOMPATIBLE` | 501 | La fonctionnalité installée ne peut pas fournir la qualité ou la langue demandée. | Modifiez le paramètre, ou installez un bundle qui la prend en charge. |
| `ENGINE_UNAVAILABLE` | 503 | Un moteur requis n'a pas pu démarrer, ou un runtime OCR a été supprimé après la validation de la requête. | Réessayez après la réparation ou la réinstallation de la fonctionnalité par un administrateur. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium n'est pas installé, donc HTML vers image ne peut pas s'exécuter. | Demandez à un administrateur d'installer le navigateur. |
| `BROWSER_CRASHED` | 503 | Le navigateur de capture d'écran a planté pendant le rendu. | Réessayez la requête. |

## Outils {#tool-codes}

| `code` | Statut | Signification | Que faire |
|--------|--------|---------------|-----------|
| `INPUT_MISSING` | 410 | L'entrée téléversée a été supprimée avant l'exécution de la tâche. | Téléversez à nouveau le fichier et soumettez la tâche. |
| `ANALYSIS_EXPIRED` | 410 | L'analyse de la photo d'identité a expiré avant la génération. | Analysez à nouveau la photo, puis générez. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Le résultat de la suppression d'arrière-plan a expiré avant l'étape suivante. | Supprimez à nouveau l'arrière-plan. |
| `NOT_ANIMATED` | 400 | Remove GIF Background a reçu une image fixe. | Utilisez Remove Background pour les images fixes. |
| `TOO_MANY_FRAMES` | 400 | L'animation comporte plus d'images que le serveur n'en autorise (`GIF_BG_MAX_FRAMES`). | Envoyez une animation plus courte, ou demandez à un administrateur de relever la limite. |

## Fichiers {#file-codes}

| `code` | Statut | Signification | Que faire |
|--------|--------|---------------|-----------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | L'enregistrement dans Fichiers dépasserait le quota de stockage de l'utilisateur. | Supprimez des fichiers, ou demandez plus d'espace à un administrateur. |
| `INVALID_STORED_NAME` | 400 | Le serveur a rejeté un nom de fichier stocké. | Téléversez à nouveau le fichier. |

## Pipelines et lots {#pipeline-codes}

Les requêtes de pipeline et de lot renvoient les codes de fonctionnalité ci-dessus pour chaque étape qui nécessite un bundle. Un identifiant de tâche déjà utilisé renvoie `CONFLICT` avec le statut 409. Envoyez un nouvel identifiant de tâche.

## Paramètres {#settings-codes}

| `code` | Statut | Signification | Que faire |
|--------|--------|---------------|-----------|
| `UNKNOWN_SETTING` | 400 | La clé n'est pas un paramètre connu. | Vérifiez le nom de la clé. |
| `READONLY_SETTING` | 400 | Le paramètre ne peut pas être modifié via l'API. | Modifiez-le via l'environnement ou l'interface d'administration. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | La nouvelle valeur entre en conflit avec d'autres paramètres. Le corps nomme le paramètre dans `setting` et liste les problèmes dans `validationErrors`. | Corrigez les paramètres listés, puis réessayez. |
| `SETTING_DECRYPTION_FAILED` | 500 | Un paramètre stocké ne peut pas être déchiffré. | Action de l'opérateur, comme pour `DECRYPTION_FAILED`. |

Pour `VALIDATION_ERROR` sur un paramètre, `details` contient les problèmes de schéma.

## Entreprise {#enterprise-codes}

| `code` | Statut | Signification | Que faire |
|--------|--------|---------------|-----------|
| `FEATURE_NOT_LICENSED` | 403 | Le paramètre ou la politique nécessite une licence entreprise, comme l'application du SSO ou la politique MFA. | Utilisez une instance sous licence, ou laissez le paramètre désactivé. |
| `IP_NOT_ALLOWED` | 403 | L'adresse IP de la requête ne figure pas dans la liste d'autorisation. | Connectez-vous depuis un réseau autorisé. |
| `INVALID_CIDR` | 400 | Une entrée de la liste d'autorisation n'est pas un CIDR valide. Le message liste les entrées incorrectes. | Corrigez les entrées et enregistrez à nouveau. |
| `SELF_LOCKOUT` | 400 | L'enregistrement de la liste d'autorisation bloquerait l'adresse IP actuelle de l'appelant. | Ajoutez d'abord votre IP actuelle à la liste. |

Les routes de purge RGPD renvoient un simple `CONFLICT` avec le statut 409 quand un utilisateur ou une équipe fait l'objet d'une conservation légale.

## Codes que les clients ne reçoivent pas {#internal-codes}

Ces codes existent dans le code source du serveur pour les journaux, la télémétrie ou les erreurs propres à Fastify. Un client ne les reçoit ni dans un corps de réponse ni dans une ligne de tâche, donc n'écrivez pas de logique client à partir d'eux.

| `code` | Où il va |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Signalé au suivi d'erreurs par l'évaluateur d'alertes. L'en-tête d'authentification d'un webhook d'alerte ne peut pas être déchiffré. |
| `SIEM_DECRYPTION_FAILED` | Signalé au suivi d'erreurs par le transfert SIEM. L'en-tête d'authentification du SIEM ne peut pas être déchiffré. |
| `WEBHOOK_DECRYPTION_FAILED` | Signalé au suivi d'erreurs. La requête qui a rencontré le même échec répond avec `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Signalé au suivi d'erreurs quand un téléversement intermédiaire ne peut pas être supprimé. |
| `USERNAME_RACE_EXHAUSTED` | Levé quand la création automatique SSO perd la course au nom d'utilisateur à chaque nouvelle tentative. La page de connexion affiche une erreur à la place. |
| `ERR_OUT_OF_RANGE` | Levé par le lecteur du stockage d'objets pour une plage d'octets invalide. |
| `ETIMEDOUT` | Défini sur l'erreur de délai d'attente d'un export RGPD. L'export échoue, et il peut être redemandé. |
| `FST_REQ_FILE_TOO_LARGE` | Code de Fastify pour un téléversement dépassant la limite. Les clients reçoivent un 413 avec `PAYLOAD_TOO_LARGE`, ou le propre message 413 de la route. |
| `TARGET_SIZE_EXCEEDED` | Levé quand une compression à taille cible manque sa cible. L'erreur n'a ni statut ni code, donc les clients reçoivent un échec générique. |