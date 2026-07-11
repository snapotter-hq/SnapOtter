---
description: "Vul een afbeelding op tot een doelbeeldverhouding met een effen kleur, transparante of vervaagde achtergrond."
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: 6cc7c1b428f3
---

# Afbeelding opvullen {#image-pad}

Vul een afbeelding op tot een doelbeeldverhouding door er een effen kleur, transparante of vervaagde achtergrond omheen toe te voegen. Handig om afbeeldingen in vaste beeldverhoudingen te passen voor sociale media of print zonder bij te snijden.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

Accepteert multipart-formuliergegevens met een afbeeldingsbestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| target | string | Nee | `"1:1"` | Doelbeeldverhouding: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` of `custom` |
| ratioW | integer | Nee | `1` | Aangepaste verhoudingsbreedte (1-100, gebruikt wanneer target `custom` is) |
| ratioH | integer | Nee | `1` | Aangepaste verhoudingshoogte (1-100, gebruikt wanneer target `custom` is) |
| background | string | Nee | `"color"` | Achtergrondmodus: `color`, `transparent` of `blur` |
| color | string | Nee | `"#ffffff"` | Achtergrondkleur in hex (wanneer background `color` is) |
| padding | integer | Nee | `0` | Extra padding als percentage van het canvas (0-50) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## Opmerkingen {#notes}

- De achtergrondmodus `blur` maakt een vervaagde kopie van de oorspronkelijke afbeelding als opvulling, wat een visueel samenhangend resultaat oplevert.
- Bij gebruik van de achtergrond `transparent` wordt de uitvoer geconverteerd naar PNG om het alfakanaal te behouden.
- Het uitvoerformaat komt overeen met het invoerformaat, tenzij er transparantie in het spel is. HEIC-, RAW-, PSD- en SVG-invoer wordt automatisch gedecodeerd vóór de verwerking.
- Stel `target` in op `custom` en geef `ratioW` en `ratioH` op voor willekeurige beeldverhoudingen (bijv. `ratioW: 3, ratioH: 2` voor 3:2).
