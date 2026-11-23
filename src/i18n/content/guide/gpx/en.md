---
title: "GPX explained: waypoints, tracks and routes | GeoToolbox"
description: GPX's wpt, trk and rte elements, the lat/lon attribute convention, elevation and time fields, and its inability to store polygons or rich attributes.
heading: "GPX explained: waypoints, tracks and routes"
group: vector
order: 7
readingMinutes: 5
updated: 2026-11-23
---

GPX is the de facto standard for GPS devices, sports watches and tracking apps. It records waypoints, tracks and routes in XML, and almost every outdoor application can import it.

## Minimal working example

- `<wpt>`: a waypoint, one coordinate.
- `<trk>`: a track made of `<trkseg>` segments, each with `<trkpt>` points.
- `<rte>`: a route made of `<rtept>` points, usually a planned path rather than a recording.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GeoToolbox"
     xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="39.9088" lon="116.3974">
    <name>Tiananmen</name>
    <ele>44.0</ele>
  </wpt>
  <trk>
    <name>Morning run</name>
    <trkseg>
      <trkpt lat="39.9088" lon="116.3974"><time>2026-11-09T06:00:00Z</time></trkpt>
      <trkpt lat="39.9095" lon="116.3981"><time>2026-11-09T06:00:30Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>
```

All three element types can share one file, and the safest order is `wpt`, then `rte`, then `trk`. Most applications are lenient about order, but schema validation is not.

## Structure and fields

The GPX vocabulary is fixed; extensions go through `extensions`. The table lists the parts that matter when reading or writing a file.

| Element or attribute | Required | Common values or units |
| --- | --- | --- |
| `<gpx>` | Yes, as the root | Must carry `version` and `creator` |
| `<metadata>` | Optional | File-level name, description, author, time and bounds |
| `<wpt lat lon>` | For a waypoint | Decimal degrees, WGS84 |
| `<trk>`, `<trkseg>`, `<trkpt lat lon>` | For a track | One track may hold several segments, each with at least two points |
| `<rte>`, `<rtept lat lon>` | For a route | Usually a planned path |
| `<ele>` | Optional | Elevation in metres |
| `<time>` | Optional | ISO 8601 time in UTC with a `Z` suffix |
| `<name>`, `<desc>`, `<sym>`, `<type>` | Optional | Name, description, symbol and classification |
| `<extensions>` | Optional | Custom namespace, placed last in the element |
| `<link>` | Optional | Related web page, replacing the older url field |

`lat` and `lon` are attributes, not child elements, and their order is fixed: latitude first, longitude second. The unit is decimal degrees, never degrees and minutes. Elevation is metres, and time must be an ISO 8601 string with a time zone; a timestamp without one is read as UTC and shifts the whole track by several hours.

## Coordinates and fields

- **Latitude and longitude live in `lat` / `lon` attributes**, the reverse order of KML's `<coordinates>`.
- **Always WGS84**.
- **Common child elements**: `<ele>` elevation, `<time>`, `<name>`, `<desc>`, `<sym>`.
- **Times are UTC** with a `Z` suffix; local time must be converted.

Elevation and time can appear on every point, which is what separates GPX from a plain line format. Waypoints, track points and route points accept the same child elements, but not every application reads every field; `sym` and `type` often mean something only on a specific device or platform.

## Track simplification and timestamps

Recorded tracks usually sample at a fixed interval, which gives many points and high detail but also a size cost in display and storage. A common response is simplification by distance or shape, for example a Douglas-Peucker pass that keeps turning points within a tolerance. Simplification changes the shape and drops the time and elevation of removed points, so decide the purpose first: navigation needs corner detail, while distance statistics care more about the overall shape.

Timestamps drive speed, stops and segmentation. When a device pauses, loses satellite lock or is split manually, start a new `<trkseg>` instead of connecting the gap; otherwise the output contains a straight line across the map and impossible speeds. If the original time series is kept after simplification, check that the point and time counts match and that time still increases monotonically.

## Common mistakes and pitfalls

- **KML coordinate order carried over**: tracks land in the wrong place; latitude and longitude are swapped in the `lat` / `lon` attributes, or coordinates are written as child elements; parsing fails or every position is wrong, with little indication why.
- **Time without a zone**: everything shifts by several hours on import; local time was written but read as UTC; alignment with other tracks, speed calculations and daylight analysis all break.
- **Gaps connected into one segment**: long straight lines and impossible speeds appear; a pause or signal loss did not start a new `trkseg`; distance and pace statistics become unusable.
- **Extensions in the wrong position**: strict validation reports a schema error; custom elements sit outside `<extensions>` or not at the end; some applications reject the file and the extension data is lost.
- **Over-simplification**: loops become straight and corners vanish; the tolerance was set too high; the shape is distorted and area or coverage analysis based on the track is no longer reliable.
- **GPX used for polygons**: the import leaves only a closed line; GPX has no polygon type by design; area, holes and topology are gone and cannot be recovered.

## Limits

- **No polygons**: parcels, boundaries and administrative areas cannot be represented; forcing them in produces a closed line.
- **Fixed attributes**: beyond name, description, time and elevation there is no general slot for business fields.
- **Poor extension compatibility**: vendor-specific namespaces are often ignored elsewhere.
- **Not for large data**: per-point XML is bulky; a hundred thousand points becomes very heavy.

GPX does not declare a coordinate system either; WGS84 is an implicit convention. When projected coordinates, rich attributes or polygons are needed, use GeoJSON, GeoPackage or Shapefile instead. GPX works best as the intermediate format between a device and the rest of the pipeline.

## Compared with neighbouring formats

| Dimension | GPX | KML | GeoJSON |
| --- | --- | --- | --- |
| Geometry types | Points and lines (tracks, routes) | Points, lines, polygons, collections | Points, lines, polygons, collections |
| Coordinate notation | `lat` / `lon` attributes | `longitude,latitude` text | Longitude and latitude arrays |
| Time and elevation | First-class, per point | Time elements; altitude in coordinates | Kept in properties |
| Styling | None | Strong | None |
| Size | Medium, many per-point tags | Medium | Small |
| Typical use | GPS records, sport and outdoor | Globe browsing and presentation | Web APIs and front-end rendering |

GPX and KML both appear outdoors but do different jobs: GPX records the points that were walked, with time, elevation and segments at the centre; KML describes what should be shown, with styles, balloons and icons at the centre. GeoJSON is more general, supports polygons and offers free-form properties, but it has none of the GPS conventions and needs its own time and elevation fields.

## Converting and tools

GPX to GeoJSON turns tracks into LineStrings and waypoints into Points, usually carrying time and elevation as properties. The reverse cannot store polygons; at best it takes a boundary or degrades to a line. Use the [vector format converter](/en/tools/format-convert/), see [KML](/en/guide/kml/) for the presentation-oriented format, and see [GeoJSON](/en/guide/geojson/) for the general JSON structure.

When a track has several segments, decide whether the output is one MultiLineString or several independent lines; the first keeps the "one recording" meaning, the second makes segment filtering easier. Store time as strings with an explicit zone so that different tools do not each apply their own local-time assumption.

## Sample data and parser script

The repository includes a sample track, [sample.gpx](/examples/data/sample.gpx), and a parser, [gpx_parser.py](/examples/python/gpx_parser.py). The script uses only the Python standard library: `wpt` becomes a Point, each `trkseg` becomes a LineString, and several segments produce a MultiLineString; `rte` becomes a LineString. `name`, `desc`, `type`, `time` and `ele` become properties, and elevation is not written into the position, so output stays two-dimensional. GPX has no polygon type and the script does no reprojection. Run it as `python gpx_parser.py sample.gpx -o out.geojson`.

## References

- [Topografix GPX](https://www.topografix.com/gpx.asp)
- [OpenStreetMap Wiki: GPX](https://wiki.openstreetmap.org/wiki/GPX)