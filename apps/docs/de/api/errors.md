---
title: "Fehlercodes"
description: "Das Format des Fehlerkörpers, die stabilen Codes und was bei jedem Code zu tun ist."
i18n_source_hash: dd2420de1d32
i18n_provenance: machine
i18n_output_hash: 5e47f6529933
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

Das Administratorkonto der Ersteinrichtung ist `admin` mit dem Passwort `admin`, sofern `DEFAULT_USERNAME` oder `DEFAULT_PASSWORD` es nicht geändert haben. Solange `SKIP_MUST_CHANGE_PASSWORD` nicht gesetzt ist, erhält dieses Konto bei jedem Aufruf `MUST_CHANGE_PASSWORD`, bis das Passwort geändert wird.

## Jobs {#job-codes}

Ein fehlgeschlagener Job meldet seinen Grund am Job selbst, nicht im HTTP-Fehler. Lesen Sie `error.code` und `error.message` aus `GET /api/v1/jobs/{jobId}`. Siehe [Fortschrittsverfolgung](/de/api/rest#progress-tracking).

Ein fehlgeschlagener Job behält `error.code` nur, wenn der Fehler ein Eingabefehler oder ein Serverfehler ist. Andere Fehler enthalten nur die Meldung.

| `code` | Bedeutung | Was zu tun ist |
|--------|--------|------------|
| `CANCELED` | Der Job wurde von einem Benutzer abgebrochen. Es ist kein HTTP-Status. Fortschrittsereignisse tragen `phase: failed` mit diesem Code. | Behandeln Sie es als Abbruch durch den Benutzer. Wiederholen Sie es nicht automatisch. |
| `INPUT_MISSING` | Die Eingabe wurde entfernt, bevor der Job lief. | Laden Sie die Datei erneut hoch. |
| `ENGINE_UNAVAILABLE` | Eine erforderliche Engine konnte auf dem Server nicht gestartet werden. | Versuchen Sie es erneut, nachdem ein Administrator die Installation repariert hat. |
| `JOB_STALLED` | Wird nicht an Clients zurückgegeben; er beschriftet den Fehlerbericht des Servers. Der Worker hat die Sperre des Jobs häufiger verloren, als die Warteschlange erlaubt, meist weil der Server neu gestartet wurde oder der Arbeitsspeicher oder die CPU knapp wurde. Der Job schlägt mit einer Meldung fehl, dass er unterbrochen wurde. | Versuchen Sie es erneut. Falls es weiterhin auftritt, geben Sie dem Server mehr Arbeitsspeicher oder senken Sie `CONCURRENT_JOBS`. |

## Authentifizierung und MFA {#mfa-codes}

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | Die MFA-Richtlinie verlangt eine Registrierung, und diese Instanz kann den Benutzer nicht registrieren (keine Enterprise-Lizenz). Lizenzierte Instanzen geben 200 mit `requiresMfaEnrollment: true` zurück und führen den Benutzer stattdessen durch die Registrierung. | Nicht erneut versuchen. Ein Administrator muss die Richtlinie ändern oder die Offline-Wiederherstellungs-CLI verwenden. |
| `MFA_POLICY_UNAVAILABLE` | 503 | Der Server konnte die MFA-Richtlinie bei der Anmeldung nicht lesen. | Versuchen Sie die Anmeldung in Kürze erneut. |
| `INVALID_CODE` | 401 | Der TOTP- oder Wiederherstellungscode ist falsch. | Fragen Sie den Benutzer nach einem neuen Code und versuchen Sie es erneut. Wiederholte Fehlversuche enden in `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Zu viele falsche Codes. Die Challenge wird verworfen. | Starten Sie die Anmeldung erneut, um eine neue Challenge zu erhalten. |
| `MFA_EXPIRED` | 401 | Die MFA- oder Registrierungs-Challenge ist abgelaufen oder passt nicht. | Starten Sie die Anmeldung erneut. |
| `MFA_NOT_CONFIGURED` | 401 | Das Konto hat kein TOTP-Geheimnis, daher kann ein Code nicht geprüft werden. | Registrieren Sie MFA, bevor Sie sich mit einem Code anmelden. |
| `MFA_ALREADY_ENABLED` | 409 | MFA ist für das Konto bereits aktiv. | Nicht erneut registrieren. |
| `NO_PENDING_ENROLLMENT` | 400 | Eine Registrierungsbestätigung ging ohne ausstehende Registrierung ein. | Rufen Sie zuerst den Registrierungsendpunkt auf. |
| `MFA_NOT_ENABLED` | 400 | Die Aktion erfordert aktivierte MFA, und für diesen Benutzer ist sie deaktiviert. | Überspringen Sie die Aktion oder aktivieren Sie zuerst MFA. |
| `MFA_DECRYPTION_FAILED` | 500 | Das gespeicherte TOTP-Geheimnis kann nicht entschlüsselt werden. | Maßnahme des Betreibers. Meist bedeutet das, dass sich der Verschlüsselungsschlüssel geändert hat. Prüfen Sie `DATA_ENCRYPTION_KEY` und `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Ein gespeicherter Wert (eine Einstellung, ein Webhook-Auth-Header oder ein TOTP-Geheimnis) kann nicht entschlüsselt werden. | Maßnahme des Betreibers, wie oben. Nicht erneut versuchen. |
| `IDLE_TIMEOUT` | 401 | Die Sitzung ist nach einer Zeit der Inaktivität abgelaufen. | Melden Sie sich erneut an. |
| `INVALID_PASSWORD` | 401 | Das aktuelle Passwort ist bei einer Passwortänderung falsch. | Fragen Sie den Benutzer nach dem aktuellen Passwort. |
| `PASSWORD_CHANGED` | 409 | Das Passwort wurde in einer anderen Sitzung geändert oder von einem Administrator zurückgesetzt, während diese Anfrage lief. | Melden Sie sich erneut an. |
| `OIDC_NO_PASSWORD` | 400 | Für ein über SSO erstelltes Konto wurde eine Passwortänderung oder ein Zurücksetzen angefordert. | Verweisen Sie den Benutzer an den Identitätsanbieter. |

## OIDC {#oidc-codes}

OIDC-Fehler bei der Anmeldung geben keinen JSON-Körper zurück. Die Login-Route leitet mit einem allgemeinen Grund auf die Anmeldeseite um, und das Audit-Log protokolliert den Code. Die Logout-Route beendet die lokale Sitzung weiterhin, wenn der Identitätsanbieter nicht erreichbar ist.

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Keiner (Weiterleitung) | Die Issuer-URL ist `http`, aber `EXTERNAL_URL` ist `https`, daher verweigert der Client die Discovery. | Administrator: Stellen Sie den Issuer über `https` bereit oder betreiben Sie die Instanz über `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Keiner (Weiterleitung) | Bei der Discovery des Issuers ist eine Zeitüberschreitung aufgetreten. | Prüfen Sie, ob der Server den Issuer erreichen kann, und versuchen Sie es erneut. |
| `OIDC_DISCOVERY_FAILED` | Keiner (Weiterleitung) | Die Discovery ist aus einem anderen Grund fehlgeschlagen. | Prüfen Sie die Issuer-URL und den ausgehenden Zugriff des Servers. |
| `OIDC_END_SESSION_INVALID` | Keiner (Logout wird fortgesetzt) | Der `end_session_endpoint` des Identitätsanbieters ist keine gültige URL. Die lokale Sitzung wird trotzdem gelöscht. | Administrator: Korrigieren Sie die Metadaten des Anbieters. |
| `OIDC_END_SESSION_SCHEME` | Keiner (Logout wird fortgesetzt) | Der `end_session_endpoint` verwendet ein Schema, das der Server nicht zulässt. Die lokale Sitzung wird trotzdem gelöscht. | Administrator: Korrigieren Sie die Metadaten des Anbieters. |

## SAML {#saml-codes}

SAML-Fehler setzen kein `code`. Eine fehlgeschlagene Assertion leitet mit `saml_auth_failed` auf die Anmeldeseite um, und das Audit-Ereignis `SAML_LOGIN_FAILED` protokolliert den Grund.

## SCIM {#scim-codes}

SCIM-Routen antworten mit dem Fehlerumschlag nach RFC 7644 (`schemas`, `detail`, `status` und manchmal `scimType`). Sie setzen kein `code`. Verzweigen Sie anhand des HTTP-Status.

## Teams, Rollen und Benutzer {#team-role-codes}

Doppelte Team- oder Rollennamen geben das allgemeine `CONFLICT` zurück, und ein fehlendes Team oder eine fehlende Rolle gibt `NOT_FOUND` zurück.

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | Die Rolle des Aufrufers erlaubt die Änderung nicht. Das Ziel steht über der Befugnis des Aufrufers, die Rolle ist eingebaut, oder die Anfrage vergibt Berechtigungen, die der Aufrufer nicht besitzt. | Nicht erneut versuchen. Bitten Sie einen Benutzer mit mehr Befugnissen. |
| `UNKNOWN_ROLE` | 400 | Die Rollen-ID passt zu keiner vorhandenen Rolle. | Korrigieren Sie die Rollen-ID. Listen Sie die Rollen auf, um sie zu finden. |
| `UNKNOWN_TEAM` | 400 | Die Team-ID passt zu keinem vorhandenen Team. | Korrigieren Sie die Team-ID. |
| `SELF_DEMOTE` | 400 | Ein Administrator hat versucht, seine eigene Administratorrolle zu entfernen. | Lassen Sie einen anderen Administrator die Änderung vornehmen. |
| `SELF_DELETE` | 400 | Ein Administrator hat versucht, sein eigenes Konto zu löschen. | Lassen Sie es von einem anderen Administrator löschen. |
| `LAST_ADMIN` | 400 bei Benutzerrouten, 409 bei GDPR-Löschrouten | Die Änderung würde keinen Administrator übrig lassen oder ein Team löschen, das alle Administratoren enthält. | Machen Sie zuerst einen anderen Benutzer zum Administrator. |
| `USER_LIMIT_REACHED` | 403 | Die Instanz hat ihr `MAX_USERS`-Limit erreicht. | Entfernen Sie einen Benutzer oder erhöhen Sie `MAX_USERS`. |

## Funktionen und KI-Bundles {#feature-codes}

Tools, Batch-Läufe und Pipelines, die ein optionales KI-Bundle benötigen, verwenden diese Codes.

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501 oder 400 im Gesichtsmodus von Smart Crop | Das Tool oder ein Schritt einer Pipeline oder eines Batches benötigt ein Bundle, das nicht installiert ist. Der Körper enthält `feature` (die Bundle-ID) und `featureName`. | Installieren Sie das Bundle in den Einstellungen und versuchen Sie es erneut. |
| `FEATURE_CPU_UNSUPPORTED` | 409 | Eine Installation oder ein Offline-Import wurde abgelehnt, weil die x86-64-Bibliotheken des Bundles AVX benötigen und die CPU dieses Servers es nicht hat. Es wurde nichts heruntergeladen oder installiert. Der Körper enthält `feature` (die Bundle-ID) und `reason` (`cpu-no-avx`). `GET /api/v1/features` meldet dasselbe Bundle mit `compatibility: "incompatible"` und `compatibilityReason: "cpu-no-avx"`. | Betreiben Sie SnapOtter auf einer CPU mit AVX oder auf arm64. Andere Bundles lassen sich weiterhin installieren. |
| `FEATURE_INCOMPATIBLE` | 501 oder 400, wenn Fast OCR eine Sprache erhält, die es nicht lesen kann | Die installierte Funktion kann die angeforderte Qualität oder Sprache nicht verarbeiten. | Ändern Sie die Einstellung oder installieren Sie ein Bundle, das sie unterstützt. |
| `ENGINE_UNAVAILABLE` | 503 | Eine erforderliche Engine konnte nicht gestartet werden, oder eine OCR-Laufzeit wurde entfernt, nachdem die Anfrage validiert wurde. | Versuchen Sie es erneut, nachdem ein Administrator die Funktion repariert oder neu installiert hat. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium ist nicht installiert, daher kann HTML zu Bild nicht ausgeführt werden. | Bitten Sie einen Administrator, den Browser zu installieren. |
| `BROWSER_CRASHED` | 503 | Der Screenshot-Browser ist beim Rendern abgestürzt. | Wiederholen Sie die Anfrage. |

## Tools {#tool-codes}

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | Die hochgeladene Eingabe wurde entfernt, bevor der Job lief. | Laden Sie die Datei erneut hoch und senden Sie den Job ab. |
| `ANALYSIS_EXPIRED` | 410 | Die Analyse des Passfotos ist vor der Erstellung abgelaufen. | Analysieren Sie das Foto erneut und erstellen Sie es dann. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Das Ergebnis der Hintergrundentfernung ist vor dem Folgeschritt abgelaufen. | Entfernen Sie den Hintergrund erneut. |
| `NOT_ANIMATED` | 400 | Remove GIF Background hat ein Standbild erhalten. | Verwenden Sie Remove Background für Standbilder. |
| `TOO_MANY_FRAMES` | 400 | Die Animation hat mehr Frames, als der Server erlaubt (`GIF_BG_MAX_FRAMES`). | Senden Sie eine kürzere Animation oder bitten Sie einen Administrator, das Limit zu erhöhen. |
| `TOO_MANY_PIXELS` | 400 | Die Leinwand der Animation mal ihre Frame-Anzahl liegt über dem Limit des Servers: 268.402.689 Pixel (16383 x 16383) für Remove GIF Background oder die GIF-Lastgrenze für andere animierte Tools. | Senden Sie weniger Frames oder eine kleinere Animation. |
| `IMAGE_TOO_LARGE` | 400 | Das Bild hat mehr Pixel, als der Decoder akzeptiert. | Senden Sie ein kleineres Bild. |
| `RESULT_TOO_LARGE` | 400 | Die Einstellungen würden ein Bild erzeugen, das größer ist, als das Encoder- oder Pixellimit erlaubt. | Verwenden Sie ein kleineres Bild oder Einstellungen, die ein kleineres Ergebnis liefern. |
| `DOCUMENT_UNREADABLE` | 400 | LibreOffice oder pandoc konnte das Dokument nicht öffnen. Es ist möglicherweise beschädigt, passwortgeschützt oder nicht im Format, das seine Dateiendung angibt. | Prüfen Sie, ob sich die Datei in einer Office-App öffnen lässt, und senden Sie sie dann erneut. |
| `PDF_DAMAGED` | 400 | Die PDF-Engine hat eine beschädigte Dokumentstruktur gefunden. | Lassen Sie die Datei durch Repair PDF laufen und versuchen Sie es dann erneut. |
| `PDF_PASSWORD_PROTECTED` | 400 | Die PDF ist verschlüsselt, und dieses Tool kann sie nicht öffnen. | Entsperren Sie sie zuerst mit Unlock PDF. |
| `NO_AUDIO_TRACK` | 400 | Die Datei hat keinen Audiostream, den ein Audio-Tool verwenden könnte. | Senden Sie eine Datei mit Audio. |
| `MEDIA_UNDECODABLE` | 400 | ffmpeg konnte das Audio oder Video nicht lesen: Es hat keine Pakete, keine Codec-Parameter, kein `moov`-Atom oder Daten gefunden, die es nicht parsen kann. | Prüfen Sie, ob die Datei in einem Mediaplayer abgespielt wird, oder exportieren Sie sie neu und versuchen Sie es dann erneut. |
| `PAGE_OUT_OF_RANGE` | 400 | Der Seitenbereich nennt eine Seite, die die PDF nicht hat. | Prüfen Sie die Seitenzahl und senden Sie einen Bereich innerhalb davon. |
| `INVALID_PAGE_RANGE` | 400 | Der Seitenbereich hat keine gültige Syntax. | Verwenden Sie Seitenzahlen wie `1-3,5`. |
| `CANNOT_REMOVE_ALL_PAGES` | 400 | Remove Pages sollte jede Seite entfernen. | Behalten Sie mindestens eine Seite. |
| `NESTING_TOO_DEEP` | 400 | Das JSON oder XML ist mehr als 100 Ebenen tief verschachtelt. | Flachen Sie das Dokument ab und konvertieren Sie es dann. |
| `IMAGE_UNDECODABLE` | 400 | Das Bild kann nicht dekodiert werden, oder seine Abmessungen können nicht gelesen werden. Die Datei ist möglicherweise beschädigt oder verwendet eine Kodierung, die der Decoder nicht unterstützt. | Exportieren Sie das Bild aus einer anderen App neu oder konvertieren Sie es zuerst in PNG oder JPEG. |
| `INVALID_SETTINGS` | 400 | Eine Einstellung liegt außerhalb des gültigen Bereichs oder passt nicht zu dieser Datei: ein Zuschnitt außerhalb des Bildes, eine Größenänderung auf null, ein GIF-Frame, den die Animation nicht hat, eine Passfoto-Vorgabe, die nicht existiert. Der Text von `error` benennt die Einstellung. | Korrigieren Sie die in `error` genannte Einstellung und versuchen Sie es dann erneut. |
| `CHART_DATA_INVALID` | 400 | Chart Maker konnte keine Diagrammdaten aus der Datei lesen: Die CSV oder das JSON lässt sich nicht parsen, hat keine numerische Spalte, hat mehr als 100 Zeilen oder enthält einen negativen Wert. Der Text von `error` gibt an, was zutrifft. | Senden Sie CSV oder JSON mit bis zu 100 Zeilen, jeweils ein Label und eine Zahl von null oder mehr. |
| `NO_FACE_DETECTED` | 400 | Passport Photo hat kein Gesicht im Bild gefunden. | Senden Sie ein klares Foto von vorn mit guter Beleuchtung. |
| `TARGET_SIZE_UNREACHABLE` | 400 | Die Komprimierung oder das Größenlimit eines Passfotos kann die Datei selbst nach dem Verkleinern nicht unter die angeforderte Größe bringen. | Fordern Sie eine größere Zielgröße an oder schneiden Sie das Bild zuerst zu. |
| `TOO_MANY_PAGES` | 400 | Für OCR wurden mehr Seiten angefordert, als es in einem Job verarbeitet. | Wählen Sie mit dem Seitenbereich weniger Seiten aus. |
| `METADATA_DAMAGED` | 400 | Edit Metadata hat die vorhandenen EXIF-Daten des Bildes als beschädigt erkannt, daher kann es sie nicht sicher neu schreiben. | Entfernen Sie die Metadaten zuerst mit Remove Image Metadata und bearbeiten Sie sie dann. |
| `REMOTE_RESOURCES_DISABLED` | 400 | HTML oder Markdown zu PDF hat einen Verweis auf ein Bild, ein Stylesheet oder eine Schriftart im Netzwerk gefunden, die der Server nicht abruft. | Betten Sie die Ressource in die Datei ein (zum Beispiel als `data:`-URI) und versuchen Sie es dann erneut. |

## Dateien {#file-codes}

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Das Speichern in Dateien würde das Speicherkontingent des Benutzers überschreiten. | Löschen Sie Dateien oder bitten Sie einen Administrator um mehr Speicherplatz. |
| `INVALID_STORED_NAME` | 400 | Der Server hat einen gespeicherten Dateinamen abgelehnt. | Laden Sie die Datei erneut hoch. |

## Pipelines und Batch {#pipeline-codes}

Pipeline- und Batch-Anfragen geben für jeden Schritt, der ein Bundle benötigt, die oben genannten Funktionscodes zurück. Eine bereits verwendete Job-ID gibt `CONFLICT` mit Status 409 zurück. Senden Sie eine neue Job-ID.

## Einstellungen {#settings-codes}

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | Der Schlüssel ist keine bekannte Einstellung. | Prüfen Sie den Schlüsselnamen. |
| `READONLY_SETTING` | 400 | Die Einstellung kann nicht über die API geändert werden. | Ändern Sie sie über die Umgebung oder die Admin-Oberfläche. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | Der neue Wert steht im Konflikt mit anderen Einstellungen. Der Körper nennt die Einstellung in `setting` und listet die Probleme in `validationErrors` auf. | Korrigieren Sie die aufgelisteten Einstellungen und versuchen Sie es dann erneut. |
| `SETTING_DECRYPTION_FAILED` | 500 | Eine gespeicherte Einstellung kann nicht entschlüsselt werden. | Maßnahme des Betreibers, wie bei `DECRYPTION_FAILED`. |

Bei `VALIDATION_ERROR` für eine Einstellung enthält `details` die Schemaprobleme.

## Enterprise {#enterprise-codes}

| `code` | Status | Bedeutung | Was zu tun ist |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | Die Einstellung oder Richtlinie benötigt eine Enterprise-Lizenz, etwa die SSO-Erzwingung oder die MFA-Richtlinie. | Verwenden Sie eine lizenzierte Instanz oder lassen Sie die Einstellung deaktiviert. |
| `IP_NOT_ALLOWED` | 403 | Die IP-Adresse der Anfrage steht nicht in der Allowlist. | Verbinden Sie sich aus einem erlaubten Netzwerk. |
| `INVALID_CIDR` | 400 | Ein Allowlist-Eintrag ist kein gültiges CIDR. Die Meldung listet die fehlerhaften Einträge auf. | Korrigieren Sie die Einträge und speichern Sie erneut. |
| `SELF_LOCKOUT` | 400 | Das Speichern der Allowlist würde die aktuelle IP des Aufrufers sperren. | Fügen Sie zuerst Ihre aktuelle IP zur Liste hinzu. |

GDPR-Löschrouten geben ein einfaches `CONFLICT` mit Status 409 zurück, wenn ein Benutzer oder Team unter Legal Hold steht.

## Codes, die Clients nicht erhalten {#internal-codes}

Diese Codes existieren im Servercode für Logs, Telemetrie oder die eigenen Fehler von Fastify. Ein Client erhält sie weder in einem Antwortkörper noch in einer Job-Zeile, daher sollten Sie keine Client-Logik darauf stützen.

| `code` | Wohin er geht |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Wird vom Alert-Evaluator an das Error-Tracking gemeldet. Der Auth-Header eines Alert-Webhooks kann nicht entschlüsselt werden. |
| `SIEM_DECRYPTION_FAILED` | Wird von der SIEM-Weiterleitung an das Error-Tracking gemeldet. Der SIEM-Auth-Header kann nicht entschlüsselt werden. |
| `WEBHOOK_DECRYPTION_FAILED` | Wird an das Error-Tracking gemeldet. Die Anfrage, die auf denselben Fehler stieß, antwortet mit `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Wird an das Error-Tracking gemeldet, wenn ein bereitgestellter Upload nicht entfernt werden kann. |
| `USERNAME_RACE_EXHAUSTED` | Wird ausgelöst, wenn die SSO-Auto-Erstellung bei jedem Wiederholungsversuch das Rennen um den Benutzernamen verliert. Die Anmeldeseite zeigt stattdessen einen Fehler an. |
| `ERR_OUT_OF_RANGE` | Wird vom Reader des Objektspeichers für einen ungültigen Byte-Bereich ausgelöst. |
| `ETIMEDOUT` | Wird beim Timeout-Fehler eines GDPR-Exports gesetzt. Der Export schlägt fehl und kann erneut angefordert werden. |
| `FST_REQ_FILE_TOO_LARGE` | Der Fastify-Code für einen Upload über dem Limit. Clients erhalten ein 413 mit `PAYLOAD_TOO_LARGE` oder die eigene 413-Meldung der Route. |
| `TARGET_SIZE_EXCEEDED` | Wird ausgelöst, wenn eine Komprimierung auf Zielgröße ihr Ziel verfehlt. Der Fehler hat weder Status noch Code, daher erhalten Clients einen allgemeinen Fehler. |
| `OCR_CACHE_PERMISSIONS` | Wird als Betriebsfehler an das Error-Tracking gemeldet, wenn das KI-Datenvolume den OCR-Laufzeit-Cache für alle beschreibbar lässt. Der Installationsjob schlägt mit einer Meldung fehl, die das Speicherproblem benennt. |
| `OCR_RUNTIME_UNREACHABLE` | Wird als Betriebsfehler an das Error-Tracking gemeldet, wenn der Server huggingface.co zum Herunterladen der OCR-Laufzeit nie erreicht hat. Der Installationsjob schlägt mit einer Meldung über den Netzwerkzugriff, `HTTPS_PROXY` und den Offline-Import fehl. |
