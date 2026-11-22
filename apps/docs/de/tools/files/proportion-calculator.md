---
description: "Löst den Dreisatz und findet X aus drei bekannten Werten."
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: 7fd31f37080c
i18n_hash_version: 2
---

# Dreisatz-Rechner {#proportion-calculator}

Löst den Dreisatz (Kreuzmultiplikation). Gib drei Werte ein, wähle direkt oder invers und erhalte den vierten. Die Werte bleiben nach jeder Antwort im Formular, sodass du eine Zahl ändern und mit der Eingabetaste die nächste Rechnung starten kannst.

Dies ist der mathematische Proportionsrechner, nicht das Drittelregel-Raster zur Fotokomposition.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

Akzeptiert einen JSON-Body statt Multipart-Formulardaten und antwortet mit einer Zahl statt mit einer herunterladbaren Datei.

## Parameters {#parameters}

| Name | Typ | Standard | Beschreibung |
|------|------|---------|-------------|
| `a` | number | (erforderlich) | Erster bekannter Wert. |
| `b` | number | (erforderlich) | Der Wert, der zu `a` gehört. |
| `c` | number | (erforderlich) | Dritter bekannter Wert. X ist der Wert, der dazu gehört. |
| `mode` | string | `direct` | `direct` oder `inverse`. |

| Modus | Lesart | Formel | Beispiel |
|------|----------|---------|---------|
| `direct` | A verhält sich zu B wie C zu X | X = B × C ÷ A | 3 Äpfel kosten 6, also kosten 10 Äpfel 20 |
| `inverse` | A × B = C × X | X = A × B ÷ C | 4 Arbeiter brauchen 6 Tage, also brauchen 8 Arbeiter 3 Tage |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/proportion-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"a": 3, "b": 6, "c": 10, "mode": "direct"}'
```

## Example Response {#example-response}

```json
{
  "mode": "direct",
  "x": 20
}
```

## Notes {#notes}

- Die Antwort wird auf 15 signifikante Stellen gerundet, daher kommt `0.1 × 3 ÷ 3` als `0.1` zurück und nicht als `0.10000000000000002`.
- `a` darf bei einer direkten Proportion nicht `0` sein und `c` bei einer inversen nicht `0`, weil jeweils durch diesen Wert geteilt wird. In beiden Fällen kommt ein 400 zurück.
- Eine Antwort außerhalb des Bereichs, den ein Double fassen kann (über etwa `1.8e308` oder so nah bei null, dass die Genauigkeit verloren geht), liefert ein 400.
- In der Web-App kannst du `1,5` oder `1.5` eingeben, und auch arabisch-indische oder Devanagari-Ziffern funktionieren. Tausendertrennzeichen werden nicht akzeptiert.
