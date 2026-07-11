---
description: "Formatierte Textüberlagerungen mit Schlagschatten und Hintergrundflächen hinzufügen."
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: ba2b534496b5
---

# Textüberlagerung {#text-overlay}

Fügt Bildern formatierten Text mit optionalem Schlagschatten und halbtransparenter Hintergrundfläche hinzu. Geeignet für Titel, Bildunterschriften oder Anmerkungen auf Fotos.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

Nimmt Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings` entgegen.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| text | string | Ja | - | Zu überlagernder Text (1 bis 500 Zeichen) |
| fontSize | number | Nein | `48` | Schriftgröße in Pixeln (8 bis 200) |
| color | string | Nein | `"#FFFFFF"` | Textfarbe im Hexformat (`#RRGGBB`) |
| position | string | Nein | `"bottom"` | Vertikale Platzierung: `top`, `center`, `bottom` |
| backgroundBox | boolean | Nein | `false` | Ein halbtransparentes Hintergrundrechteck hinter dem Text anzeigen |
| backgroundColor | string | Nein | `"#000000"` | Farbe der Hintergrundfläche im Hexformat (`#RRGGBB`) |
| shadow | boolean | Nein | `true` | Einen Schlagschatten hinter dem Text anwenden |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

Mit einer Hintergrundfläche:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Hinweise {#notes}

- Der Text ist innerhalb des Bildes immer horizontal zentriert.
- Der Schlagschatten verwendet einen Versatz von 2px mit 3px Weichzeichnung bei 70 % schwarzer Deckkraft.
- Die Hintergrundfläche erstreckt sich über die gesamte Bildbreite bei 70 % Deckkraft, mit einer Höhe proportional zur Schriftgröße (1,8-fach).
- Der Text wird über eine SVG-Komposition gerendert, daher wird die serifenlose Standardschriftart des Systems verwendet.
- XML-Sonderzeichen im Text werden sicher maskiert.
- Das Ausgabeformat entspricht dem Eingabeformat. HEIC-, RAW-, PSD- und SVG-Eingaben werden vor der Verarbeitung automatisch dekodiert.
