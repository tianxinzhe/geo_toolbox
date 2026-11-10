---
title: "GML explained: OGC XML features and axis order | GeoToolbox"
description: How GML structures FeatureCollection, featureMember, gml:pos and srsName, the namespace rules, the EPSG:4326 axis-order ambiguity, and why GML files are so large.
heading: "GML explained: OGC XML features and axis order"
group: vector
order: 11
readingMinutes: 6
updated: 2026-11-09
---

GML (Geography Markup Language) is the OGC XML encoding standard. Before GeoJSON became widespread it was the main carrier of web geodata, and it still appears in OGC services, industry platforms and government datasets.

## Basic structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gml:FeatureCollection
    xmlns:gml="http://www.opengis.net/gml/3.2"
    xmlns:app="https://example.com/app">
  <gml:featureMember>
    <app:station>
      <app:name>Tiananmen</app:name>
      <app:location>
        <gml:Point srsName="EPSG:4326">
          <gml:pos>116.3974 39.9088</gml:pos>
        </gml:Point>
      </app:location>
    </app:station>
  </gml:featureMember>
</gml:FeatureCollection>
```

- **Features and geometry are separate**: business attributes live in a custom namespace (`app:`), geometry in `gml:` elements.
- **`srsName` declares the coordinate system**, as an EPSG code or a URI.
- **`gml:pos` holds one coordinate**; multi-point lines and polygons use `gml:posList`.
- **`featureMember`** is also written as `featureMembers` in newer GML, so readers must accept both.

## The axis-order ambiguity

The official axis order of EPSG:4326 puts **latitude first**, yet many real files write longitude first. `srsName` alone cannot tell you which, so check the value ranges (longitude is usually -180 to 180, latitude -90 to 90) and ask the data provider.

## Limits

- **Verbose**: the same point data is often several times larger than GeoJSON.
- **Strict namespaces**: a missing `xmlns` or a mismatched prefix fails parsing outright.
- **Very flexible structure**: industry GML application schemas differ widely, so generic parsers only handle common geometry.
- **Not built for browsers**: parsing it in the front end is expensive.

## When converting

Converting GML to GeoJSON may leave namespace prefixes on attribute names, which need cleaning; coordinates are not reprojected automatically if `srsName` is not EPSG:4326. Use the [vector format converter](/en/tools/format-convert/) for conversion, and see [WKT](/en/guide/wkt/) for the text form of geometry.