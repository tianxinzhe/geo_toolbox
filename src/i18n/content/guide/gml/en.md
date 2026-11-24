---
title: 'GML explained: XML features and axis order | GeoToolbox'
description: 'How GML structures features, gml:pos and srsName, the namespace rules, the EPSG:4326 axis-order ambiguity, and why GML files are large.'
heading: "GML explained: OGC XML features and axis order"
group: vector
order: 11
readingMinutes: 5
updated: 2026-11-23
---

GML (Geography Markup Language) is the OGC XML encoding standard. Before GeoJSON became widespread it was the main carrier of web geodata, and it still appears in OGC services, industry platforms and government datasets.

## Minimal working example

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

A file may also use `gml:featureMembers` to wrap several features at once and avoid repeating the outer element. Both forms mean the same thing, but the element names differ in the schema, so a validating parser cannot mix them.

## Structure and fields

GML is a family of XML schemas, not one fixed document layout. Real files follow an application schema and use only part of the vocabulary. A generic parser mostly meets the parts below.

| Element or attribute | Required | Common values or units |
| --- | --- | --- |
| `gml:FeatureCollection` | Usually the root | Container for features; other roots are possible |
| `gml:featureMember` / `gml:featureMembers` | At least one | Each member carries one feature |
| Feature element | Yes | Defined by the application schema, often in a custom namespace |
| `gml:Point`, `gml:LineString`, `gml:Polygon` | Usually present | `curve` and `surface` are accepted aliases |
| `srsName` | Recommended | An EPSG code or a URI such as `urn:ogc:def:crs:EPSG::4326` |
| `gml:pos` | For a single coordinate | Numbers separated by spaces, order set by the CRS |
| `gml:posList` | For lines and polygons | Flat number list; `srsDimension` states the dimension |
| `gml:boundedBy` | Optional | `Envelope` with `lowerCorner` and `upperCorner` |
| `xsi:schemaLocation` | Optional | Points at the XSD for validation and tool hints |

GML coordinates have no universal unit. Degrees are used for geographic CRSs, metres or feet for projected ones, and `srsName` decides which. The attribute may sit on the geometry or on an ancestor and be inherited downwards, so reading only the current node is not enough.

Because GML is an encoding rather than one dataset format, two files that both validate can share almost no element names. A reader should target a known profile, such as a WFS feature collection, instead of assuming a universal layout.

## The axis-order ambiguity

The official axis order of EPSG:4326 puts **latitude first**, yet many real files write longitude first. `srsName` alone cannot tell you which, so check the value ranges (longitude is usually -180 to 180, latitude -90 to 90) and ask the data provider.

The problem shows up more often in GML than elsewhere because GML follows the CRS definition strictly, while desktop tools and hand-written files usually put longitude first. In China the ranges are distinct enough to guess, but data near the equator or the prime meridian can look plausible either way, leaving the data description or a known landmark as the only reliable check.

## Common mistakes and pitfalls

- **Missing namespace or mismatched prefix.** The parser reports an unbound prefix or cannot find the element. Either `xmlns:gml` was never declared, or the file uses `gml2:` while the reader looks for `gml:`. The whole document fails to parse.
- **Mixed GML versions.** Schema validation fails, or geometry elements go unrecognised. The file declares the GML 3.2 namespace but uses a 2.x structure. Strict validation rejects it; lenient parsers silently drop parts.
- **Wrong axis-order assumption.** Features come out shifted or flipped. The official axis order was confused with the order actually written, and nothing warns you. Positions are wrong, so spatial queries and overlays cannot be trusted.
- **Bad `posList` separator.** The coordinate count does not add up, or numbers fail to parse. Commas between tuples cause it. Lines and polygons become misaligned and may even span the whole map.
- **Namespace prefixes left on attributes.** Converted field names look like `app:name` because the raw tag was copied unchanged. Any downstream lookup for `name` returns nothing.
- **Non-4326 coordinates left unprojected.** Everything falls outside the map extent. The tool was assumed to reproject from `srsName`, and it does not. Reproject the data and rebuild any derived output.

## Limits

- **Verbose**: the same point data is often several times larger than GeoJSON.
- **Strict namespaces**: a missing `xmlns` or a mismatched prefix fails parsing outright.
- **Very flexible structure**: industry GML application schemas differ widely, so generic parsers only handle common geometry.
- **Not built for browsers**: parsing it in the front end is expensive.

GML also covers curves, surfaces, coverages and topology, which most lightweight parsers do not implement. Mathematically defined arcs or complex application schemas usually call for GDAL, GeoServer or a schema-aware library rather than the standard XML parser.

## Compared with neighbouring formats

| Dimension | GML | KML | GeoJSON |
| --- | --- | --- | --- |
| Syntax | XML with strict namespaces | XML with a fixed structure | JSON |
| Coordinate system | Set by `srsName`, projections allowed | WGS84 only | WGS84 only |
| Attributes | Strong, defined by the schema | Weak, via `ExtendedData` | `properties` |
| Size | Large, repeated tags | Medium | Small |
| Typical use | WFS, government and industry data | Google Earth, presentation | Web APIs, front-end rendering |

GML and KML are both XML but aim at different jobs. KML targets presentation, with styles, icons and time as central features and a fixed coordinate system. GML targets data exchange, with extensible coordinate systems and attribute schemas at the cost of size and parsing effort. GeoJSON takes the lightweight middle path: simple attributes and browser-friendly syntax, but a poor fit for complex application schemas and projected coordinates.

## Converting and tools

Converting GML to GeoJSON may leave namespace prefixes on attribute names, which need cleaning; coordinates are not reprojected automatically if `srsName` is not EPSG:4326. Use the [vector format converter](/en/tools/format-convert/) for conversion, see [WKT](/en/guide/wkt/) for the text form of geometry, and see [KML](/en/guide/kml/) for the presentation-oriented structure.

GML from a WFS also tends to include `boundedBy`, `Envelope` and several levels of application-schema nesting, so locate the geometry level before converting. When the axis order is uncertain, check one known point against both interpretations and only then process the batch; correcting afterwards is far more work.

## Sample data and parser script

The repository includes [sample.gml](/examples/data/sample.gml) and a parser, [gml_parser.py](/examples/python/gml_parser.py). The script uses only the Python standard library, reads features under `featureMember` or `member`, converts the first geometry descendant to GeoJSON, and takes coordinates from `pos`, `posList` or the legacy `coordinates` element; other direct children become properties from their text. It does not handle application-schema nesting and does not reproject a `srsName` other than 4326. Run it as `python gml_parser.py sample.gml -o out.geojson`.

## References

- [OGC Geography Markup Language](https://www.ogc.org/publications/standard/gml/)
- [OGC Simple Feature Access](https://www.ogc.org/publications/standard/sfa/)