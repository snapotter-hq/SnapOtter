---
title: "Fehlercodes"
description: "Das Format des Fehlerkörpers, die stabilen Codes und was bei jedem Code zu tun ist."
i18n_source_hash: ed6e0590a6fd
i18n_provenance: machine
i18n_output_hash: 7cbc93e2aa51
i18n_hash_version: 2
---

# Fehlercodes {#error-codes}

Jede JSON-Fehlerantwort hat dasselbe Format:

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Feld | Immer vorhanden | Bedeutung |
|-------|----------------|---------|
| `error` | Ja | Eine für Menschen lesbare Meldung. Kann Benutzern bedenkenlos angezeigt werden. Nicht auswerten. |
| `code` | Ja | Ein stabiler, maschinenlesbarer Code. Verzweigen Sie anhand dieses Werts. |
| `requestId` | Ja | Die ID dieser Anfrage auf dem Server. Geben Sie sie an, wenn Sie ein Problem melden; sie stimmt mit dem Serverlog überein. |
| `details` | Manchmal | Weiterer Kontext zu einigen 4xx-Fehlern, etwa die Validierungsmeldung. |

Meldungen können sich zwischen Releases ändern. Codes ändern sich nicht, daher sollten Sie die Client-Logik auf `code` stützen.

## Codes aus dem HTTP-Status {#status-codes}

Wenn eine Route keinen eigenen Code setzt, leitet der Server einen aus dem Status ab:

| HTTP-Status | `code` |
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

Jeder andere 4xx-Status fällt auf `BAD_REQUEST` zurück, jeder andere 5xx-Status auf `INTERNAL_ERROR`.

Eine Route kann einen spezifischeren Code setzen; dann enthält die Antwort stattdessen diesen Code. Ein Tool, das nicht laufen kann, weil sein KI-Bundle fehlt, liefert beispielsweise einen funktionsspezifischen Code. Diese Codes werden bei der Funktion beschrieben, die sie auslöst.

## Authentifizierung und Zugriff {#auth-codes}

| `code` | Status | Was zu tun ist |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | Senden Sie `Authorization: Bearer <token>` mit einem Sitzungstoken oder einem API-Schlüssel (`si_...`). |
| `FORBIDDEN` | 403 | Die Zugangsdaten sind gültig, aber es fehlt die Berechtigung. Bitten Sie einen Administrator um die Berechtigung. |
| `MUST_CHANGE_PASSWORD` | 403 | Das Konto muss sein Passwort ändern, bevor es andere Endpunkte aufrufen kann. Rufen Sie `POST /api/auth/change-password` mit dem Sitzungstoken auf und versuchen Sie es dann erneut. |
| `USER_DISABLED` | 403 | Das Konto ist deaktiviert. Ein Administrator muss es wieder aktivieren. |
| `LOGIN_THROTTLED` | 429 | Zu viele fehlgeschlagene Anmeldeversuche. Warten Sie, bevor Sie es erneut versuchen. |
| `VALIDATION_ERROR` | 400 | Der Anfragekörper oder die Parameter haben die Validierung nicht bestanden. `details` benennt das Problem. |

Das Administratorkonto für den ersten Start ist `admin` mit dem Passwort `admin`, sofern `DEFAULT_USERNAME` oder `DEFAULT_PASSWORD` es nicht geändert haben. Wenn `SKIP_MUST_CHANGE_PASSWORD` nicht gesetzt ist, erhält dieses Konto bei jedem Aufruf `MUST_CHANGE_PASSWORD`, bis das Passwort geändert wird.

## Jobs {#job-codes}

Ein fehlgeschlagener Job meldet seinen Grund am Job selbst, nicht im HTTP-Fehler. Lesen Sie `error.code` und `error.message` aus `GET /api/v1/jobs/{jobId}`. Siehe [Fortschrittsverfolgung](/de/api/rest#progress-tracking).

Ein fehlgeschlagener Job behält `error.code` nur, wenn der Fehler ein Eingabefehler oder ein Serverfehler ist. Bei anderen Fehlern wird nur die Meldung mitgeliefert.

| `code` | Bedeutung | Was zu tun ist |
|--------|--------|------------|
| `CANCELED` | Der Job wurde von einem Benutzer abgebrochen. Es ist kein HTTP-Status. Fortschrittsereignisse tragen `phase: failed` mit diesem Code. | Behandeln Sie es als Abbruch durch den Benutzer. Wiederholen Sie es nicht automatisch. |
| `INPUT_MISSING` | Die Eingabe wurde entfernt, bevor der Job lief. | Laden Sie die Datei erneut hoch. |
| `ENGINE_UNAVAILABLE` | Eine erforderliche Engine konnte auf dem Server nicht gestartet werden. | Versuchen Sie es erneut, nachdem ein Administrator die Installation repariert hat. |

## Authentifizierung und MFA {#mfa-codes}

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | Die MFA-Richtlinie verlangt eine Registrierung, und diese Instanz kann den Benutzer nicht registrieren (keine Enterprise-Lizenz). Lizenzierte Instanzen liefern 200 mit `requiresMfaEnrollment: true` und führen den Benutzer stattdessen durch die Registrierung. | Nicht wiederholen. Ein Administrator muss die Richtlinie ändern oder die Offline-Wiederherstellungs-CLI verwenden. |
| `MFA_POLICY_UNAVAILABLE` | 503 | Der Server konnte die MFA-Richtlinie bei der Anmeldung nicht lesen. | Versuchen Sie die Anmeldung in Kürze erneut. |
| `INVALID_CODE` | 401 | Der TOTP- oder Wiederherstellungscode ist falsch. | Fragen Sie den Benutzer nach einem neuen Code und versuchen Sie es erneut. Wiederholte Fehlschläge enden in `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Zu viele falsche Codes. Die Challenge wird verworfen. | Starten Sie die Anmeldung neu, um eine neue Challenge zu erhalten. |
| `MFA_EXPIRED` | 401 | Die MFA- oder Registrierungs-Challenge ist abgelaufen oder passt nicht. | Starten Sie die Anmeldung neu. |
| `MFA_NOT_CONFIGURED` | 401 | Das Konto hat kein TOTP-Geheimnis, daher kann ein Code nicht geprüft werden. | Registrieren Sie MFA, bevor Sie sich mit einem Code anmelden. |
| `MFA_ALREADY_ENABLED` | 409 | MFA ist für das Konto bereits aktiv. | Nicht erneut registrieren. |
| `NO_PENDING_ENROLLMENT` | 400 | Eine Registrierungsbestätigung ging ohne ausstehende Registrierung ein. | Rufen Sie zuerst den Registrierungsendpunkt auf. |
| `MFA_NOT_ENABLED` | 400 | Die Aktion setzt aktivierte MFA voraus, und für diesen Benutzer ist sie ausgeschaltet. | Überspringen Sie die Aktion oder aktivieren Sie zuerst MFA. |
| `MFA_DECRYPTION_FAILED` | 500 | Das gespeicherte TOTP-Geheimnis lässt sich nicht entschlüsseln. | Maßnahme des Betreibers. Meist hat sich der Verschlüsselungsschlüssel geändert. Prüfen Sie `DATA_ENCRYPTION_KEY` und `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Ein gespeicherter Wert (eine Einstellung, ein Webhook-Auth-Header oder ein TOTP-Geheimnis) lässt sich nicht entschlüsseln. | Maßnahme des Betreibers, wie oben. Nicht wiederholen. |
| `IDLE_TIMEOUT` | 401 | Die Sitzung ist nach einer Zeit der Inaktivität abgelaufen. | Melden Sie sich erneut an. |
| `INVALID_PASSWORD` | 401 | Das aktuelle Passwort ist bei einer Passwortänderung falsch. | Fragen Sie den Benutzer nach dem aktuellen Passwort. |
| `PASSWORD_CHANGED` | 409 | Das Passwort wurde in einer anderen Sitzung geändert oder von einem Administrator zurückgesetzt, während diese Anfrage lief. | Melden Sie sich erneut an. |
| `OIDC_NO_PASSWORD` | 400 | Eine Passwortänderung oder ein Zurücksetzen wurde für ein Konto angefordert, das über SSO erstellt wurde. | Verweisen Sie den Benutzer an den Identitätsanbieter. |

## OIDC {#oidc-codes}

OIDC-Fehler bei der Anmeldung liefern keinen JSON-Körper. Die Login-Route leitet mit einem allgemeinen Grund auf die Anmeldeseite um, und das Audit-Log protokolliert den Code. Die Logout-Route beendet die lokale Sitzung trotzdem, wenn der Identitätsanbieter nicht erreichbar ist.

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Keiner (Weiterleitung) | Die Issuer-URL ist `http`, aber `EXTERNAL_URL` ist `https`, daher verweigert der Client die Discovery. | Administrator: Stellen Sie den Issuer über `https` bereit oder betreiben Sie die Instanz über `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Keiner (Weiterleitung) | Die Discovery des Issuers ist in ein Zeitlimit gelaufen. | Prüfen Sie, ob der Server den Issuer erreichen kann, und versuchen Sie es dann erneut. |
| `OIDC_DISCOVERY_FAILED` | Keiner (Weiterleitung) | Die Discovery ist aus einem anderen Grund fehlgeschlagen. | Prüfen Sie die Issuer-URL und den ausgehenden Zugriff des Servers. |
| `OIDC_END_SESSION_INVALID` | Keiner (Logout läuft weiter) | Der `end_session_endpoint` des Identitätsanbieters ist keine gültige URL. Die lokale Sitzung wird trotzdem gelöscht. | Administrator: Korrigieren Sie die Metadaten des Anbieters. |
| `OIDC_END_SESSION_SCHEME` | Keiner (Logout läuft weiter) | Der `end_session_endpoint` verwendet ein Schema, das der Server nicht erlaubt. Die lokale Sitzung wird trotzdem gelöscht. | Administrator: Korrigieren Sie die Metadaten des Anbieters. |

## SAML {#saml-codes}

SAML-Fehler setzen kein `code`. Eine fehlgeschlagene Assertion leitet mit `saml_auth_failed` auf die Anmeldeseite um, und das Audit-Ereignis `SAML_LOGIN_FAILED` protokolliert den Grund.

## SCIM {#scim-codes}

SCIM-Routen antworten mit dem Fehler-Envelope nach RFC 7644 (`schemas`, `detail`, `status` und manchmal `scimType`). Sie setzen kein `code`. Verzweigen Sie anhand des HTTP-Status.

## Teams, Rollen und Benutzer {#team-role-codes}

Doppelte Team- oder Rollennamen liefern das allgemeine `CONFLICT`, und ein fehlendes Team oder eine fehlende Rolle liefert `NOT_FOUND`.

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | Die Rolle des Aufrufers erlaubt die Änderung nicht. Das Ziel steht über der Befugnis des Aufrufers, die Rolle ist integriert, oder die Anfrage vergibt Berechtigungen, die der Aufrufer nicht besitzt. | Nicht wiederholen. Wenden Sie sich an einen Benutzer mit mehr Befugnissen. |
| `UNKNOWN_ROLE` | 400 | Die Rollen-ID passt zu keiner vorhandenen Rolle. | Korrigieren Sie die Rollen-ID. Listen Sie die Rollen auf, um sie zu finden. |
| `UNKNOWN_TEAM` | 400 | Die Team-ID passt zu keinem vorhandenen Team. | Korrigieren Sie die Team-ID. |
| `SELF_DEMOTE` | 400 | Ein Administrator hat versucht, die eigene Administratorrolle zu entfernen. | Lassen Sie einen anderen Administrator die Änderung vornehmen. |
| `SELF_DELETE` | 400 | Ein Administrator hat versucht, das eigene Konto zu löschen. | Lassen Sie es von einem anderen Administrator löschen. |
| `LAST_ADMIN` | 400 bei Benutzerrouten, 409 bei DSGVO-Löschrouten | Die Änderung würde keinen Administrator übrig lassen oder ein Team löschen, das alle Administratoren enthält. | Machen Sie zuerst einen anderen Benutzer zum Administrator. |
| `USER_LIMIT_REACHED` | 403 | Die Instanz hat ihr Limit `MAX_USERS` erreicht. | Entfernen Sie einen Benutzer oder erhöhen Sie `MAX_USERS`. |

## Funktionen und KI-Bundles {#feature-codes}

Tools, Batch-Läufe und Pipelines, die ein optionales KI-Bundle benötigen, verwenden diese Codes.

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501 | Das Tool oder ein Schritt einer Pipeline bzw. eines Batches benötigt ein Bundle, das nicht installiert ist. Der Körper enthält `feature` (die Bundle-ID) und `featureName`. | Installieren Sie das Bundle in den Einstellungen und versuchen Sie es dann erneut. |
| `FEATURE_INCOMPATIBLE` | 501 | Die installierte Funktion kann die angeforderte Qualität oder Sprache nicht liefern. | Ändern Sie die Einstellung oder installieren Sie ein Bundle, das sie unterstützt. |
| `ENGINE_UNAVAILABLE` | 503 | Eine erforderliche Engine konnte nicht gestartet werden, oder eine OCR-Laufzeit wurde entfernt, nachdem die Anfrage validiert wurde. | Versuchen Sie es erneut, nachdem ein Administrator die Funktion repariert oder neu installiert hat. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium ist nicht installiert, daher kann HTML to Image nicht laufen. | Bitten Sie einen Administrator, den Browser zu installieren. |
| `BROWSER_CRASHED` | 503 | Der Screenshot-Browser ist beim Rendern abgestürzt. | Wiederholen Sie die Anfrage. |

## Tools {#tool-codes}

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | Die hochgeladene Eingabe wurde entfernt, bevor der Job lief. | Laden Sie die Datei erneut hoch und senden Sie den Job ab. |
| `ANALYSIS_EXPIRED` | 410 | Die Passfoto-Analyse ist vor der Erzeugung abgelaufen. | Analysieren Sie das Foto erneut und erzeugen Sie dann. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Das Ergebnis der Hintergrundentfernung ist vor dem Folgeschritt abgelaufen. | Entfernen Sie den Hintergrund erneut. |
| `NOT_ANIMATED` | 400 | Remove GIF Background hat ein Standbild erhalten. | Verwenden Sie Remove Background für Standbilder. |
| `TOO_MANY_FRAMES` | 400 | Die Animation hat mehr Frames, als der Server erlaubt (`GIF_BG_MAX_FRAMES`). | Senden Sie eine kürzere Animation oder bitten Sie einen Administrator, das Limit zu erhöhen. |

## Dateien {#file-codes}

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Das Speichern in Dateien würde das Speicherkontingent des Benutzers überschreiten. | Löschen Sie Dateien oder bitten Sie einen Administrator um mehr Speicherplatz. |
| `INVALID_STORED_NAME` | 400 | Der Server hat einen gespeicherten Dateinamen abgelehnt. | Laden Sie die Datei erneut hoch. |

## Pipelines und Batch {#pipeline-codes}

Pipeline- und Batch-Anfragen liefern für jeden Schritt, der ein Bundle benötigt, die oben genannten Funktionscodes. Eine bereits verwendete Job-ID liefert `CONFLICT` mit Status 409. Senden Sie eine neue Job-ID.

## Einstellungen {#settings-codes}

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | Der Schlüssel ist keine bekannte Einstellung. | Prüfen Sie den Schlüsselnamen. |
| `READONLY_SETTING` | 400 | Die Einstellung lässt sich nicht über die API ändern. | Ändern Sie sie über die Umgebung oder die Admin-Oberfläche. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | Der neue Wert steht im Konflikt mit anderen Einstellungen. Der Körper benennt die Einstellung in `setting` und listet die Probleme in `validationErrors` auf. | Korrigieren Sie die aufgeführten Einstellungen und versuchen Sie es dann erneut. |
| `SETTING_DECRYPTION_FAILED` | 500 | Eine gespeicherte Einstellung lässt sich nicht entschlüsseln. | Maßnahme des Betreibers, wie bei `DECRYPTION_FAILED`. |

Bei `VALIDATION_ERROR` für eine Einstellung enthält `details` die Schema-Probleme.

## Enterprise {#enterprise-codes}

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | Die Einstellung oder Richtlinie benötigt eine Enterprise-Lizenz, etwa die SSO-Erzwingung oder die MFA-Richtlinie. | Verwenden Sie eine lizenzierte Instanz oder lassen Sie die Einstellung ausgeschaltet. |
| `IP_NOT_ALLOWED` | 403 | Die IP-Adresse der Anfrage steht nicht in der Zulassungsliste. | Verbinden Sie sich aus einem erlaubten Netzwerk. |
| `INVALID_CIDR` | 400 | Ein Eintrag der Zulassungsliste ist kein gültiges CIDR. Die Meldung listet die fehlerhaften Einträge auf. | Korrigieren Sie die Einträge und speichern Sie erneut. |
| `SELF_LOCKOUT` | 400 | Das Speichern der Zulassungsliste würde die aktuelle IP des Aufrufers sperren. | Fügen Sie zuerst Ihre aktuelle IP zur Liste hinzu. |

DSGVO-Löschrouten liefern ein einfaches `CONFLICT` mit Status 409, wenn ein Benutzer oder Team unter Legal Hold steht.

## Codes, die Clients nicht erhalten {#internal-codes}

Diese Codes existieren im Server-Quellcode für Logs, Telemetrie oder die eigenen Fehler von Fastify. Ein Client erhält sie weder in einem Antwortkörper noch in einer Job-Zeile, daher sollten Sie die Client-Logik nicht auf sie stützen.

| `code` | Wohin er geht |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Wird vom Alert-Evaluator an die Fehlerverfolgung gemeldet. Der Auth-Header eines Alert-Webhooks lässt sich nicht entschlüsseln. |
| `SIEM_DECRYPTION_FAILED` | Wird von der SIEM-Weiterleitung an die Fehlerverfolgung gemeldet. Der SIEM-Auth-Header lässt sich nicht entschlüsseln. |
| `WEBHOOK_DECRYPTION_FAILED` | Wird an die Fehlerverfolgung gemeldet. Die Anfrage, die auf denselben Fehler stieß, antwortet mit `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Wird an die Fehlerverfolgung gemeldet, wenn ein bereitgestellter Upload nicht entfernt werden kann. |
| `USERNAME_RACE_EXHAUSTED` | Wird ausgelöst, wenn SSO-Auto-Create das Rennen um den Benutzernamen bei jedem Versuch verliert. Die Anmeldeseite zeigt stattdessen einen Fehler. |
| `ERR_OUT_OF_RANGE` | Wird vom Objektspeicher-Reader bei einem ungültigen Byte-Bereich ausgelöst. |
| `ETIMEDOUT` | Wird am Zeitlimit-Fehler eines DSGVO-Exports gesetzt. Der Export schlägt fehl und kann erneut angefordert werden. |
| `FST_REQ_FILE_TOO_LARGE` | Der Fastify-Code für einen Upload über dem Limit. Clients erhalten ein 413 mit `PAYLOAD_TOO_LARGE` oder die eigene 413-Meldung der Route. |
| `TARGET_SIZE_EXCEEDED` | Wird ausgelöst, wenn eine Komprimierung auf Zielgröße ihr Ziel verfehlt. Der Fehler hat weder Status noch Code, daher erhalten Clients einen allgemeinen Fehlschlag. |
