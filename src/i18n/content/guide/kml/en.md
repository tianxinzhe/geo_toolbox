---
title: "KML and KMZ explained: structure, styles and packaging | GeoToolbox"
description: KML's Document, Placemark, coordinates and styling, what a KMZ archive contains, and their limits on coordinate systems, attributes and attachments.
heading: KML and KMZ explained
group: vector
order: 6
readingMinutes: 1
updated: 2026-11-09
---

KML is an OGC standard and the native format of Google Earth. It uses XML to describe placemarks, lines, polygons, styles and time spans. KMZ packages a KML file together with its images and icons into a ZIP archive.

## KML structure

The root is `<kml>`, usually containing `<Document>`, `<Folder>` and `<Placemark>`. Coordinates sit in `<coordinates>` in **longitude,latitude[,altitude]** order.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Example</name>
    <Placemark>
      <name>Tiananmen</name>
      <Point>
        <coordinates>116.3974,39.9088,0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>Example extent</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              116.39,39.90,0 116.41,39.90,0 116.41,39.92,0 116.39,39.90,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>
```

Points are separated by spaces; polygons require closed rings.

## Styling

KML's strength is presentation: `<Style>` defines icons, colours, line widths and fill opacity; `<description>` supports HTML balloons; `<TimeStamp>` and `<TimeSpan>` drive time animations. All of this disappears when converting to GeoJSON.

## KMZ

KMZ is not a new syntax; it is a ZIP:

```text
example.kmz
├─ doc.kml
├─ images/
│  └─ icon.png
└─ files/
   └─ photo.jpg
```

Relative paths in the KML point inside the archive. Extract only `doc.kml` and the images and icons break. KMZ is good for distribution and presentation, not for programmatic exchange.

## Limits

- **Always WGS84**; no EPSG code is declared.
- **Weak attributes**: business fields must go into `<ExtendedData>`, with uneven support across applications.
- **Hand editing easily breaks `<coordinates>`** whitespace and line breaks.
- **Not a database format**: with hundreds of thousands of features both size and parsing speed suffer.

## Conversion notes

KML / KMZ to GeoJSON keeps geometry and names, but styles, balloons and attachments are lost. The reverse produces basic placemarks without reconstructing styles. Use the [vector format converter](/en/tools/format-convert/); see the [overview](/en/guide/vector-formats/) for other formats.