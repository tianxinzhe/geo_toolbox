---
title: 'GeoJSON explained: structure and limits | GeoToolbox'
description: 'The FeatureCollection, Feature and Geometry structure, longitude-first WGS84 convention, polygon ring rules, and GeoJSON size and CRS limits.'
heading: "GeoJSON explained: structure and limits"
group: vector
order: 4
readingMinutes: 6
updated: 2026-11-23
---

GeoJSON is the de facto standard for geodata on the web. Points, lines, polygons and attributes go into plain JSON, which every language can read, browsers parse without help, and nearly every GIS and mapping library understands.

The specification is IETF RFC 7946, published in 2016 and registered as `application/geo+json`. Repository map previews, open data APIs and mapping libraries usually consume it directly. What it offers is reach, not compactness: one `.geojson` file opens in a browser, Python, PostGIS and a desktop GIS.

The price is size and limited expressiveness. Most files that load but put features in the wrong place come down to coordinate order, ring rules or the fixed coordinate system.

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

Fields split cleanly across the three levels:

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

**Swapped longitude and latitude.** A point lands in the sea, on another continent, or gets clipped at the map edge, because the file stores `[latitude, longitude]` where `[longitude, latitude]` is required. Nothing errors; the dataset is simply displaced. Times Square is `[-73.9855, 40.7580]`, while `[40.7580, -73.9855]` falls in the southern hemisphere. Check the ranges first: a latitude beyond ±90 means swapped values, unless the data is projected.

**Unclosed polygon ring.** No polygon appears in the browser or desktop GIS, or the area comes out wrong. The last coordinate differs from the first, or the ring has only three positions. Some tools close the ring for you, others drop the feature, because the geometry is invalid. Write the ring closed and keep at least four positions, counting the repeated first point.

**Projected coordinates inside GeoJSON.** You see values like `500000` or `4400000` and a blank map. The data came from UTM or Gauss-Krüger without conversion to WGS84, so the coordinates fall outside the valid longitude/latitude range; readers clip them, clamp them, or draw them in the wrong spot. Reproject before exporting.

**Too many decimal places.** Files double in size and version diffs fill with digits that mean nothing. Fifteen decimals is far past the point where 1e-7 degrees, about 1 cm of latitude, stops mattering. You get bigger files and slower parsing for no gain. Six or seven decimals, roughly 0.1 m and 1 cm, cover most work.

**Geometry or bulk data stuffed into `properties`.** After import, attributes vanish, column types turn to text, or the file balloons. Someone put WKT, base64 images or deeply nested objects into properties, and the target system accepts only scalars. Those attributes then cannot be queried, indexes stop working, transfers slow down. Keep geometry in `geometry`, properties flat, and large objects somewhere else.

**Comments, trailing commas or `NaN` in the JSON.** The file will not parse, and the error points at a line and column. JSON does not support comments, trailing commas, `NaN` or `Infinity`, so there is no fallback reader. Strip the comments and trailing commas, and use `null` for missing values.

**Using a `crs` member to declare a projection.** The file declares `EPSG:3857` but the map is offset or at the wrong scale. RFC 7946 removed `crs`, so current readers ignore it and assume WGS84, which means projected coordinates get read as degrees. Convert to WGS84 rather than leaning on `crs`.

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

TopoJSON fits administrative data with many shared edges. KML fits styled presentations with balloons. Shapefile still works for traditional GIS pipelines, though field names and geometry types are limited. For archiving or millions of features, GeoPackage and FlatGeobuf are the better choices.

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