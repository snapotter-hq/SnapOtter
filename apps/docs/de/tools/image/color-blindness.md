---
description: "Simuliert, wie Bilder für Menschen mit verschiedenen Arten von Farbfehlsichtigkeit erscheinen."
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: 61af5943cc81
---

# Farbenblindheits-Simulation {#color-blindness-simulation}

Simuliert Farbfehlsichtigkeit (CVD), um vorab zu zeigen, wie Bilder für Menschen mit verschiedenen Arten von Farbenblindheit erscheinen. Nützlich für Barrierefreiheitstests von Designs, Diagrammen und Benutzeroberflächen.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

Akzeptiert Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| simulationType | string | Nein | `"deuteranomaly"` | Art der zu simulierenden Farbfehlsichtigkeit |

### Simulationstypen {#simulation-types}

| Wert | Zustand | Beschreibung |
|-------|-----------|-------------|
| `protanopia` | Rotblind | Vollständiges Fehlen der roten Zapfenzellen |
| `deuteranopia` | Grünblind | Vollständiges Fehlen der grünen Zapfenzellen |
| `tritanopia` | Blaublind | Vollständiges Fehlen der blauen Zapfenzellen |
| `protanomaly` | Rotschwäche | Verringerte Empfindlichkeit der roten Zapfen |
| `deuteranomaly` | Grünschwäche | Verringerte Empfindlichkeit der grünen Zapfen (am häufigsten) |
| `tritanomaly` | Blauschwäche | Verringerte Empfindlichkeit der blauen Zapfen |
| `achromatopsia` | Vollständig farbenblind | Vollständiges Fehlen des Farbsehens |
| `blueConeMonochromacy` | Nur Blauzapfen | Nur die blauen Zapfen sind funktionsfähig |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Hinweise {#notes}

- Deuteranomalie (Grünschwäche) ist die Voreinstellung, da sie die häufigste Form der Farbfehlsichtigkeit ist und etwa 6 % der Männer betrifft.
- Die Simulation verwendet Farbtransformationsmatrizen, die modellieren, wie verringerte oder fehlende Zapfenphotorezeptoren die wahrgenommenen Farben verändern.
- Dieses Werkzeug ist zerstörungsfrei und erzeugt nur eine Vorschau. Es verändert das Originalbild nicht im Sinne der Barrierefreiheit.
- Das Ausgabeformat entspricht dem Eingabeformat. HEIC-, RAW-, PSD- und SVG-Eingaben werden vor der Verarbeitung automatisch dekodiert.
