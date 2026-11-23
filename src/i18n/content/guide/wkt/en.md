---
title: "WKT explained: geometry text, dimensions and SRID | GeoToolbox"
description: How WKT writes POINT, LINESTRING, POLYGON and MULTIPOLYGON, the Z and M dimensions, ring closure rules, and the difference between standard WKT and PostGIS EWKT.
heading: "WKT explained: geometry text, dimensions and SRID"
group: vector
order: 10
readingMinutes: 5
updated: 2026-11-23
---

WKT (Well-Known Text) is the OGC text notation for geometry. It describes geometry only, with no attributes, which makes it ideal for database columns, logs and exchanging a single shape.

## Minimal working example

```text
POINT (116.3974 39.9088)
LINESTRING (116.39 39.90, 116.40 39.91, 116.41 39.92)
POLYGON ((116.39 39.90, 116.41 39.90, 116.41 39.92, 116.39 39.90))
MULTIPOLYGON (((116.39 39.90, 116.41 39.90, 116.41 39.92, 116.39 39.90)))
GEOMETRYCOLLECTION (POINT (116.3974 39.9088), LINESTRING (116.39 39.90, 116.40 39.91))
```

- **Coordinate order is x y**, which in geographic data usually means longitude then latitude.
- **Polygons use double parentheses**: the outer pair holds the ring list, the inner pair one ring; the first ring is the exterior, the rest are holes.
- **Rings must close**, with identical first and last coordinates.
- **Z and M are supported**: `POINT Z (116.3974 39.9088 44)`.

`MULTIPOINT` and `MULTILINESTRING` are also common, as are empty geometries such as `POINT EMPTY` and `GEOMETRYCOLLECTION EMPTY`. An empty geometry means the record exists but has no position; exporters may write it as `NULL` or drop it entirely, so a reader has to handle both cases.

## Structure and fields

WKT has only a type keyword and coordinates, with no key-value pairs and no attribute table. Parsers start collecting numbers when they reach the parentheses, so the number of spaces, commas and brackets must match exactly.

| Part | Required | Common values or units |
| --- | --- | --- |
| Type keyword | Yes | POINT, LINESTRING, POLYGON, MULTIPOINT, MULTILINESTRING, MULTIPOLYGON, GEOMETRYCOLLECTION |
| Dimension marker | Optional | Z for elevation, M for measure, ZM for both; omitted means two dimensions |
| Coordinate tuple | Yes for every geometry | Numbers separated by spaces; geographic coordinates are usually decimal degrees |
| Bracket depth | Yes | One level for points, one for lines, two for polygons, three for multipolygons |
| Ring closure | Yes for polygons | First and last coordinates identical; a valid ring has at least four points |
| SRID prefix | Not part of the standard | PostGIS EWKT only, written as `SRID=4326;` |

Coordinates carry no unit of their own. A value such as `116.3974` may be degrees or metres, and only outside context can tell. Geographic systems are normally read as longitude and latitude, while projected systems use metres or feet; mixing the two rarely raises an error, it simply puts features in the wrong place. The Z value follows the same rule, most often metres, with nothing in the text to confirm it.

## SRID and EWKT

Standard WKT carries no coordinate system. What you often see in databases:

```text
SRID=4326;POINT (116.3974 39.9088)
```

is PostGIS's EWKT extension. When you see the SRID prefix, check that the target tool accepts it; parsers without support reject the whole string as invalid.

EWKT exists only in the PostGIS ecosystem. PostGIS reads a prefixed string with `ST_GeomFromEWKT` and writes one with `ST_AsEWKT`; using `ST_GeomFromText` instead means passing the SRID as a second argument and leaving the prefix out of the string. A database column usually enforces an SRID, and that information disappears when the value is exported as plain WKT, so it has to be recorded separately when data crosses systems.

## Common mistakes and pitfalls

- **Swapped longitude and latitude**: the point lands on the other side of the globe or in the ocean; latitude was written first; the map still loads, every location is wrong, and nothing reports an error.
- **Unclosed ring**: the import reports a ring-not-closed error or the area comes out as zero; the first coordinate was written only once; the record is rejected, and a batch import may stop entirely.
- **Wrong bracket depth**: the parser reports a syntax error; a polygon was written with a single pair of brackets, or a multipolygon is missing one level; the file cannot be read, and the fault often appears far from the start.
- **EWKT treated as generic WKT**: a converter rejects the geometry; the string begins with `SRID=4326;`; the whole value is refused, or the prefix is silently stripped and the coordinates are misread in another system.
- **Truncated decimals**: neighbouring points collapse onto each other and lines turn jagged; only two or three decimals were kept; survey precision is lost for good, and the original values cannot be reconstructed.
- **Self-intersecting polygon**: areas look wrong or spatial queries miss results; the ring crosses itself; some databases store the geometry but mark it invalid, and later overlays cannot be trusted.

## Limits

- **One geometry at a time**: multiple features need multiple lines or records.
- **No attributes**: business fields must be stored separately.
- **No styling and no time**.
- **Precision depends entirely on the written string**, so do not truncate survey measurements to a fixed number of decimals.

WKT also carries no topology. Adjacent polygons each store the shared edge, and editing the boundary means updating both copies; data that must share edges belongs in a topological format. As text, the same coordinates are repeated as characters rather than binary values, which costs both size and parsing time at the million-feature scale.

## Compared with neighbouring formats

| Dimension | WKT | GeoJSON | WKB |
| --- | --- | --- | --- |
| Scope | One geometry, collections allowed | Feature collection with attributes | One geometry, binary |
| Coordinate system | None in the text, except EWKT | WGS84 by default | External convention |
| Readability | High, plain text | High, JSON | Low, needs decoding |
| Size | Small | Larger, repeated key names | Smallest |
| Attributes | None | `properties` | None |
| Typical use | Database columns, logs, test cases | Web transfer, front-end rendering | Database storage, bulk transfer |

WKT and WKB encode the same geometry model in different ways. WKB stores the type and coordinates as bytes, which is smaller and faster to parse but unreadable, and suits program-to-program transfer. GeoJSON adds attributes and a collection structure, which suits browsers and HTTP APIs at the cost of repeated key names. When attributes and readable text are both needed, GeoJSON fits better; when a single geometry must go straight into SQL or a log line, WKT is more direct.

## Converting and tools

Converting WKT to GeoJSON drops the SRID or interprets it as WGS84; if the source SRID is not 4326, reproject first. Ring orientation, empty geometries and Z values are also handled differently between tools, so spot-check a few points after conversion. Use the [vector format converter](/en/tools/format-convert/) for conversion, see [GML](/en/guide/gml/) for the XML form of geometry, and see [GeoJSON](/en/guide/geojson/) for the JSON structure with attributes.

## Sample data and parser script

The repository includes a text file with three sample geometries and a matching parser: [sample.wkt](/examples/data/sample.wkt) and [wkt_parser.py](/examples/python/wkt_parser.py). The script parses the full grammar with shapely and writes a GeoJSON FeatureCollection; it strips an optional `SRID=` prefix but performs no reprojection, and attributes stay empty. Run it as `python wkt_parser.py sample.wkt -o out.geojson`.

## References

- [OGC Simple Feature Access](https://www.ogc.org/publications/standard/sfa/)
- [PostGIS ST_GeomFromEWKT](https://postgis.net/docs/ST_GeomFromEWKT.html)