---
title: "KML and KMZ explained: structure, styles and packaging | GeoToolbox"
description: KML's Document, Placemark, coordinates and styling, what a KMZ archive contains, and their limits on coordinate systems, attributes and attachments.
heading: "KML and KMZ explained"
group: vector
order: 6
readingMinutes: 5
updated: 2026-11-23
---

KML is an OGC standard and the native format of Google Earth. It uses XML to describe placemarks, lines, polygons, styles and time spans. KMZ packages a KML file together with its images and icons into a ZIP archive.

## Minimal working example

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

A Placemark is simplest when it holds one kind of geometry. To keep a point, a line and a polygon in the same placemark, wrap them in `<MultiGeometry>`; putting several `<Point>` elements directly under a Placemark is not a valid structure, and a parser may read only the first one.

## Structure and fields

KML element names are fixed and their nesting is constrained by the schema. The table lists the parts a reader meets most often, roughly in document order.

| Element or attribute | Required | Common values or units |
| --- | --- | --- |
| `<kml>` | Yes, as the root | Carries the KML namespace, commonly 2.2 |
| `<Document>`, `<Folder>` | Optional | Organise placemarks; folders nest, usually one document |
| `<Placemark>` | For each feature | Holds name, description, geometry and style references |
| `<name>` | Optional | Plain text, shown in the list and balloon title |
| `<description>` | Optional | May contain HTML, often wrapped in CDATA |
| `<coordinates>` | Required for geometry | Longitude,latitude[,altitude]; tuples separated by whitespace |
| `<Point>`, `<LineString>`, `<Polygon>` | One per feature type | Polygons use `outerBoundaryIs` and `innerBoundaryIs` |
| `<Style>` | Optional | Contains IconStyle, LineStyle, PolyStyle and LabelStyle |
| `<ExtendedData>` | Optional | `Data` name/value pairs for business fields |
| `<TimeStamp>`, `<TimeSpan>` | Optional | ISO 8601 times that drive the time slider |
| `altitudeMode` | Optional | clampToGround, relativeToGround or absolute |

Longitude and latitude are decimal degrees, altitude is metres. The altitude is interpreted according to `altitudeMode`, which decides whether it is clamped to the ground, relative to the terrain or absolute. Defaults are not identical across applications, so write the value explicitly when data crosses tools.

## Styling

KML's strength is presentation: `<Style>` defines icons, colours, line widths and fill opacity; `<description>` supports HTML balloons; `<TimeStamp>` and `<TimeSpan>` drive time animations. All of this disappears when converting to GeoJSON.

```xml
<Style id="line">
  <LineStyle>
    <color>ff0000ff</color>
    <width>2</width>
  </LineStyle>
</Style>
<Placemark>
  <name>Example line</name>
  <styleUrl>#line</styleUrl>
  <ExtendedData>
    <Data name="category"><value>landmark</value></Data>
  </ExtendedData>
</Placemark>
```

KML colour is not RGB or RGBA in the usual order but `aabbggrr`: alpha, blue, green, red. Writing `ff0000ff` out of CSS habit produces blue rather than red, which is the most common styling mistake in KML. A style can be inline or carry an `id` and be reused through `<styleUrl>#id</styleUrl>`; `<StyleMap>` can also assign separate styles for normal and highlighted states.

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

The archive normally uses `doc.kml` at its root as the entry point, but the name is not enforced; some tools read the first `.kml` in the package while others insist on `doc.kml`. Keeping the entry file at the root and preserving relative paths gives the widest compatibility.

## Common mistakes and pitfalls

- **Reversed latitude and longitude**: the placemark appears in the wrong hemisphere; the author followed the GeoJSON habit of latitude first; positions are wrong without any error, and large batches are hard to audit one by one.
- **Colour written as RGBA**: red renders as blue or transparency looks wrong; KML expects `aabbggrr`; the whole layer ends up with the wrong palette and every style has to be checked.
- **Unclosed ring**: a polygon does not render or appears clipped; the first and last coordinates differ or the closing point is missing; that feature is dropped while neighbours look fine, which suggests missing data.
- **Only `doc.kml` extracted**: icons turn into default markers and photos fail to open; the attachments were not moved with the file; the presentation is lost even though the geometry still works.
- **Attributes stored in `description`**: converted output has no structured fields; business data was written into HTML text; downstream code has to scrape it with regular expressions and breaks whenever the markup changes.
- **Too many placemarks in one file**: Google Earth stutters or crashes; hundreds of thousands of placemarks sit in a single Document; the file becomes hard to open and cannot be loaded on demand.

## Limits

- **Always WGS84**; no EPSG code is declared.
- **Weak attributes**: business fields must go into `<ExtendedData>`, with uneven support across applications.
- **Hand editing easily breaks `<coordinates>`** whitespace and line breaks.
- **Not a database format**: with hundreds of thousands of features both size and parsing speed suffer.

KML stores no topology either, so the shared edge of two adjacent polygons is written twice. Its time support is aimed at presentation, not at full trajectory logging; when every point needs a timestamp and elevation, GPX or a time-aware extension is a better fit.

## Compared with neighbouring formats

| Dimension | KML / KMZ | GeoJSON | GPX |
| --- | --- | --- | --- |
| Syntax | XML; KMZ is a ZIP package | JSON | XML |
| Coordinate system | WGS84 only | WGS84 only | WGS84 only |
| Styling | Strong: icons, widths, fills, time slider | None, handled by the app | None |
| Attributes | Weak, through ExtendedData | `properties` | Fixed fields plus extensions |
| Size | Medium; KMZ compresses assets | Small | Medium, many per-point tags |
| Typical use | Globe browsing, briefings, distribution | Web maps and APIs | GPS records and activity tracks |

KML wins on "open and look": icons, balloons, time animation and bundled assets all live in one file. GeoJSON is better for programs, with geometry and properties clearly separated, but it carries no presentation semantics. GPX only covers waypoints, tracks and routes, with no polygons and no styling, which suits device records rather than map publishing.

## Converting and tools

KML / KMZ to GeoJSON keeps geometry and names, but styles, balloons and attachments are lost. The reverse produces basic placemarks without reconstructing styles. Use the [vector format converter](/en/tools/format-convert/), see [GeoJSON](/en/guide/geojson/) for the lightweight structure with attributes, and see the [overview](/en/guide/vector-formats/) for other formats.

Decide first what must survive the conversion. For geometry alone, convert directly; for attributes, map ExtendedData into properties; for styling, store the style rules alongside the target format. For KMZ, unpack the archive first, confirm the entry KML and asset paths, and then process the coordinates.

## Sample data and parser script

The repository ships both KML and KMZ samples: [sample.kml](/examples/data/sample.kml) with [kml_parser.py](/examples/python/kml_parser.py), and [sample.kmz](/examples/data/sample.kmz) with [kmz_parser.py](/examples/python/kmz_parser.py). Both scripts rely only on the standard library: they walk every Placemark, support Point, LineString, Polygon and MultiGeometry, and read `gx:Track` as a LineString; altitude is dropped, styles and overlays are ignored, and nothing is reprojected. The KMZ script unzips in memory and reads the first `.kml` in ZIP order. Run either as `python kml_parser.py sample.kml -o out.geojson`.

## References

- [OGC KML](https://www.ogc.org/publications/standard/kml/)
- [Google KML Reference](https://developers.google.com/kml/documentation/kmlreference)