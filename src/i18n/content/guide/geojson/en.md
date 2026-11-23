---
title: "GeoJSON explained: structure, coordinate order and limits | GeoToolbox"
description: The FeatureCollection, Feature and Geometry structure of GeoJSON, its longitude-first WGS84 convention, polygon ring rules, and the size, attribute and CRS limits.
heading: "GeoJSON explained: structure and limits"
group: vector
order: 4
readingMinutes: 6
updated: 2026-11-23
---

GeoJSON is the de facto standard for geodata on the web. It expresses points, lines, polygons and attributes as JSON, can be read by every language, parsed directly by browsers, and understood by almost every GIS and mapping library.

The specification is IETF RFC 7946, published in 2016, with the registered media type `application/geo+json`. Repository map previews, open data APIs and mapping component data sources mostly consume it directly. Its value is not compactness but universality: one `.geojson` file can be opened by a browser, Python, PostGIS and a desktop GIS.

The trade-off is size and limited expressiveness. Coordinate order, ring rules and the fixed coordinate system account for most cases of a file that opens but puts features in the wrong place.

## Minimal example

The top level is usually a `FeatureCollection` holding an array of `Feature` objects. Each feature has a `geometry` and a `properties` object.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [116.3974, 39.9088] },
      "properties": { "name": "Tiananmen", "category": "landmark" }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[116.39, 39.90], [116.41, 39.90], [116.41, 39.92], [116.39, 39.90]]]
      },
      "properties": { "name": "Example extent" }
    }
  ]
}
```

A single `Feature` or a bare Geometry is also legal at the top level, but `FeatureCollection` is the usual container for datasets.

In the example, the point's `coordinates` is one pair of numbers, while the polygon has two more bracket levels: the outer list holds rings, the inner list holds the coordinate sequence of one ring. Array depth follows geometry type; one level too many or too few makes a reader fail or misread the shape.

## Structure and fields

The three levels divide their fields cleanly:

| Level | Field | Required | Meaning |
|---|---|---|---|
| FeatureCollection | `type` | Yes | Always `FeatureCollection` |
| FeatureCollection | `features` | Yes | Array of features |
| FeatureCollection | `bbox` | No | Bounding box as `[west, south, east, north]` |
| Feature | `type` | Yes | Always `Feature` |
| Feature | `geometry` | Yes | Geometry object, may be `null` |
| Feature | `properties` | Yes | Attribute object, may be empty |
| Feature | `id` | No | Identifier, string or number |
| Geometry | `type` | Yes | Geometry type name |
| Geometry | `coordinates` | Yes | Coordinate array, depth depends on type |
| GeometryCollection | `geometries` | Yes | Array of geometries instead of `coordinates` |

`bbox` is an optional optimisation that lets a reader test extent before parsing every coordinate. Across the 180° meridian it follows its own convention and cannot be a simple minimum/maximum pair; omitting the field is safer when unsure.

### Coordinate rules

- **Longitude first, latitude second**: `[lng, lat]`. This is the most common GeoJSON mistake; swapping them raises no error but moves the point to the other side of the planet.
- **Always WGS84 longitude/latitude in degrees**. RFC 7946 removed the `crs` member; older files that still carry it must be read according to their declaration.
- **Polygons use nested arrays**: the outer list holds rings, the inner list holds coordinates for one ring.
- **Rings must close**: first and last coordinates are identical. Exterior/hole winding is a convention, not something every reader enforces.
- **A third dimension** (elevation) is allowed, but many tools ignore it.
- **Right-hand rule**: RFC 7946 recommends counterclockwise exterior rings and clockwise holes, while requiring readers not to reject a polygon solely for reversed winding. Follow the recommendation when writing, and do not assume correct winding when reading.
- **`properties` is a plain JSON object**: values may be strings, numbers, booleans, null, nested objects or arrays, but flat values travel more reliably between systems.
- **`geometry` may be `null`**: attributes without a location, useful for addresses awaiting geocoding or placeholder records.

### Geometry types

| Type | `coordinates` depth | Notes |
|---|---|---|
| `Point` | position | One `[lng, lat]` |
| `MultiPoint` | array of positions | Several points |
| `LineString` | array of positions | At least two positions |
| `MultiLineString` | array of lines | Several lines |
| `Polygon` | array of rings | First ring exterior, rest holes |
| `MultiPolygon` | array of polygons | Several polygons |
| `GeometryCollection` | uses `geometries` | A set of mixed geometries |

A position is `[longitude, latitude]` or `[longitude, latitude, elevation]`. Count the `[` levels to check nesting: one for a point, two for a line, three for a polygon, four for a multipolygon.

## Common mistakes and pitfalls

**Swapped longitude and latitude.** The symptom is a point in the sea, on another continent, or clipped at the edge of the map. The cause is `[latitude, longitude]` used where `[longitude, latitude]` is required. The consequence is no error at all, just a displaced dataset; Times Square should be `[-73.9855, 40.7580]`, while `[40.7580, -73.9855]` lands in the southern hemisphere. Check ranges first: a latitude beyond ±90 is swapped unless the data is projected.

**An unclosed polygon ring.** Browsers or desktop GIS show no polygon, or area calculations come out wrong. The cause is a last coordinate that differs from the first, or a ring with only three positions. The consequence is invalid geometry: some tools close the ring automatically, others drop the feature. Close the ring before writing, and keep at least four positions including the repeated first point.

**Projected coordinates inside GeoJSON.** Values such as `500000` and `4400000` appear, and the map stays blank. The cause is UTM or Gauss-Krüger data exported without conversion to WGS84. The consequence is coordinates outside the valid longitude/latitude range, which readers may clip, clamp or draw in the wrong place. Reproject first, then export.

**Too many decimal places.** File size doubles and version diffs fill with meaningless digits. The cause is 15 decimal places, while 1e-7 degrees is about 1 cm of latitude. The consequence is larger files and slower parsing with no real gain. Six or seven decimals, roughly 0.1 m and 1 cm, cover most uses.

**Geometry or bulk data stuffed into `properties`.** After import, attributes disappear, column types turn into text, or the file balloons. The cause is WKT, base64 images or deeply nested objects in properties while the target system accepts only scalars. The consequence is attributes that cannot be queried, indexes that stop working and slower transfers. Keep geometry in `geometry`, properties flat, and large objects elsewhere.

**Comments, trailing commas or `NaN` in the JSON.** The whole file fails to parse, and the error gives only a line and column. The cause is that JSON does not support comments, trailing commas, `NaN` or `Infinity`. The consequence is an unreadable file with no fallback. Remove comments and trailing commas, and use `null` for missing values.

**Using a `crs` member to declare a projection.** The file says `EPSG:3857`, yet the map is offset or wrongly scaled. The cause is that RFC 7946 removed `crs`, so modern readers ignore it and assume WGS84. The consequence is projected coordinates interpreted as degrees. Convert to WGS84 instead of relying on `crs`.

## Comparison with neighbouring formats

GeoJSON is built for exchange and display, not for storing every detail. The same data in another format trades size, topology and styling in different ways.

| Item | GeoJSON | TopoJSON | KML | Shapefile |
|---|---|---|---|---|
| Encoding | JSON text | JSON text | XML | Binary |
| Topology | None, shared edges repeated | Shared `arcs` | None | None |
| Styling | None | None | Yes, icons and balloons | None |
| Coordinate system | WGS84 only | WGS84 only | WGS84 only | `.prj` may declare many |
| Size | Large | Smaller | Medium | Medium |
| Direct browser read | Yes | Needs a library | Needs a library | Needs a library |
| Attributes | `properties`, free types | `properties` | `ExtendedData` | DBF, 10-character names |

TopoJSON suits administrative data with many shared edges; KML suits styled presentations with balloons; Shapefile suits traditional GIS pipelines but carries hard limits on field names and geometry types. GeoPackage and FlatGeobuf are better for archiving or millions of features.

## Conversion and tools

KML to GeoJSON loses styles and balloon descriptions. Shapefile to GeoJSON keeps field names, but the projection declared in `.prj` is not preserved automatically; convert coordinates first. Use the [vector format converter](/en/tools/format-convert/) for actual work, or return to the [15-format overview](/en/guide/vector-formats/).

The converter parses files in the browser, converts between GeoJSON, TopoJSON, KML, Shapefile and other formats, and always writes WGS84 longitude/latitude. [Map preview](/en/tools/map-preview/) opens a `.geojson` file directly for a visual check before and after conversion. If the source is projected, run it through the [coordinate converter](/en/tools/epsg-convert/) first.

On the command line, GDAL works well:

```bash
ogr2ogr -f GeoJSON out.geojson input.shp
```

With a `.prj` file, `ogr2ogr` reprojects to WGS84 as declared. Without one, it treats the coordinates as stored, which may place features in the wrong location. A reverse conversion writes WGS84 and does not restore the original projection definition.

## Sample data and parser

A downloadable sample and parser are available:

- [sample.geojson](/examples/data/sample.geojson): three features, a point, a line and a polygon
- [geojson_parser.py](/examples/python/geojson_parser.py): a standard-library parser

The sample describes Times Square in New York: `Times Square` is a point, `Walk` is a line to a nearby place, and `Square` is a closed rectangular area. All three sit in one `FeatureCollection`, with `name` and `kind` properties and longitude-first coordinates.

The script accepts a `FeatureCollection`, a single `Feature` or a bare Geometry at the top level; the last two are wrapped into a collection, so hand-written single-feature files still load. A `crs` member is ignored, coordinates are not reprojected, and an unrecognised top-level type raises an error instead of producing an empty file.

```bash
python geojson_parser.py sample.geojson
python geojson_parser.py sample.geojson -o out.geojson --indent 0
```

The output is still a GeoJSON `FeatureCollection`, useful for checking that a file parses strictly or for comparing against another implementation.

## References

- [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946): the formal GeoJSON specification, including coordinate order, ring winding and the removal of `crs`.
- [IANA media type `application/geo+json`](https://www.iana.org/assignments/media-types/application/geo+json): registration details for HTTP headers and file type detection.

Related reading: [TopoJSON](/en/guide/topojson/), [KML](/en/guide/kml/), [Shapefile](/en/guide/shapefile/), [15-format overview](/en/guide/vector-formats/).