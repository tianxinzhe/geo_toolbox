---
title: "TopoJSON explained: topology, arcs and quantisation | GeoToolbox"
description: How TopoJSON shares boundaries through arcs, quantises coordinates with transform, organises layers in objects, and why it cannot be opened directly and loses a little precision.
heading: "TopoJSON explained: arcs and quantisation"
group: vector
order: 5
readingMinutes: 5
updated: 2026-11-23
---

TopoJSON is a compressed, topology-aware version of GeoJSON. It is still JSON text, but instead of storing each polygon's full outline, it extracts shared boundaries into `arcs` and lets geometries reference arc indices.

The indirection does more than shrink files. A boundary shared by neighbouring districts, parcels or watersheds exists once, so editing one arc moves both sides and no centimetre-wide gap appears between them. The cost is that every consumer has to turn it back into GeoJSON before it can be drawn on a map.

## Why it exists

Administrative boundaries, parcels and watersheds share a lot of edges. GeoJSON stores those edges twice or more; TopoJSON stores them once. Combined with integer quantisation, files can shrink to a fraction of the original size.

The more shared edges, the bigger the gain. In a nested hierarchy a provincial border may be referenced by three or four polygons at once. Scattered points and isolated parcels share almost nothing, so TopoJSON adds a conversion step without any size benefit.

## Minimal example: the structure

```json
{
  "type": "Topology",
  "transform": { "scale": [0.0001, 0.0001], "translate": [116.3, 39.8] },
  "objects": {
    "districts": {
      "type": "GeometryCollection",
      "geometries": [
        { "type": "Polygon", "arcs": [[0]], "properties": { "name": "A" } },
        { "type": "Polygon", "arcs": [[1]], "properties": { "name": "B" } }
      ]
    }
  },
  "arcs": [
    [[0, 0], [1000, 0], [1000, 1000], [0, 0]],
    [[1000, 0], [2000, 0], [2000, 1000], [1000, 0]]
  ]
}
```

- `objects` acts as a layer container and can hold several geometry collections.
- `arcs` are deduplicated paths of quantised integers, restored through `transform`.
- `transform.scale` and `translate` restore real coordinates.
- A negative arc index means the same arc traversed in reverse.

The coordinates above are written out as whole integers to make the structure readable. In a real file only the first point of each arc is an absolute integer; the rest are differences from the previous point. The sample shipped with this site, `sample.topojson`, follows that rule: the second position of an arc is `[83, -53]`, which must be added to the previous point rather than read as a new coordinate.

## Structure and fields

| Field | Purpose | Required | Common values |
|---|---|---|---|
| `type` | top-level object type | yes | `"Topology"` |
| `objects` | map of layer names to geometry objects | yes | `districts`, `stations` |
| `arcs` | deduplicated arc collection | yes, may be empty | arrays of integer positions |
| `transform` | quantisation parameters | optional | `scale`, `translate` |
| `bbox` | bounding box | optional | four or six numbers |
| `properties` | attributes on geometry objects | optional | same as GeoJSON |
| arc index | reference into `arcs` | inside geometry | non-negative or negative integer |

A few rules matter. `objects` is an object, not an array; its keys are layer names, usually read in order. `GeometryCollection` can nest, and its children reference arcs in the same way. A line geometry holds an array of arc indices; a polygon holds an array of rings, each ring an array of indices; the first ring is the exterior and the rest are holes. Points are different: they carry quantised absolute coordinates directly and reference no arc.

Properties still live in `properties` with the same structure as GeoJSON and normally survive decoding; what is lost is the object names and the quantisation parameters, which have to be recorded separately.

Negative indices are specific to TopoJSON. Index `i` walks arc `i` forwards, and `~i` (that is, `-i-1`) walks the same arc backwards. This lets two neighbouring polygons share one arc instead of duplicating it in reverse. Reading the sign wrong turns an exterior ring into a hole, so the polygon renders as a hole or disappears.

## Quantisation and precision

TopoJSON commonly compresses floats into integers. `scale` is the size of a quantisation cell: raising it coarsens the grid, shrinks the integers and the file, and increases the coordinate offset; lowering it does the opposite. For centimetre-level or survey-grade data, that error may be unacceptable; assess precision first.

Decoding is direct: real coordinate = `translate` + `scale` × integer. With a `scale` of 0.0001 degrees, the grid cell is roughly 11 metres near the equator, which is the size of the quantisation error. That is fine for provincial or municipal boundaries and not fine for cadastral parcels or pipelines. Quantisation also merges neighbouring points that fall into the same cell, so very short edges can vanish and leave a degenerate ring.

Topology pays off again during simplification. Simplify a topology and each shared arc is thinned once, so both polygons keep matching edges; simplify two GeoJSON copies separately and the common border drifts apart, leaving hairline gaps or overlaps. That is why boundary data is often converted to TopoJSON, simplified, then converted back.

## Common mistakes

### Feeding TopoJSON straight to a map library

**Symptom**: a blank map, an unknown-geometry error, or a single point drawn.

**Cause**: the library expects a GeoJSON `FeatureCollection`, but the top level is `Topology` and the geometry sits under `objects` referencing `arcs`.

**Consequence**: either an error or an empty collection. Run the file through `feature()` from topojson-client first, or use a converter that produces GeoJSON.

### Editing arc coordinates by hand

**Symptom**: two adjacent areas develop a gap, or their borders cross.

**Cause**: several geometries reference the same arc, so one edit changes every polygon using it; with delta encoding, moving one point also shifts every later point in that arc.

**Consequence**: the topology is broken and the culprit is hard to find. Edit geometry in a GIS application and regenerate the TopoJSON instead.

### Quantising too aggressively

**Symptom**: jagged borders, missing islets, narrow polygons collapsing into lines.

**Cause**: `scale` is too large, the grid is too coarse, and distinct points merge into one cell.

**Consequence**: irreversible loss of precision. The topology stays consistent because both sides use the same merged points, but the shape is deformed and cannot be recovered by converting again.

### Getting the arc direction wrong

**Symptom**: a polygon renders hollow, or its computed area comes out negative.

**Cause**: a negative index walks the arc backwards — `-1` means arc 0 reversed — and treating it as "arc 1" flips the winding.

**Consequence**: exterior and interior rings swap roles, so the polygon is filled as a hole or dropped by the renderer.

### Reading only the first key of objects

**Symptom**: after conversion only one layer remains.

**Cause**: `objects` is a map, and one file can hold administrative areas, roads and rivers at the same time.

**Consequence**: incomplete data. Count the objects before converting and expand all of them when needed.

## Compared with neighbours

| Format | Size | Topology | Readability | Compatibility |
|---|---|---|---|---|
| TopoJSON | small, better with more shared edges | yes, shared arcs | medium, needs decoding | narrow, mostly topojson-client |
| GeoJSON | large | no | high, explicit structure | widest, nearly every map library |
| FlatGeobuf | small, binary | no | low, needs tooling | GIS applications and some libraries |
| GeoPackage | medium, indexed | no | low, SQLite | GIS software and databases |

The choice is straightforward. If the data goes into a web map, feeds an API or must be inspected by eye, use GeoJSON. If the data is mostly shared borders, size is the bottleneck and a TopoJSON tool already sits in the pipeline, use TopoJSON. Converting between them changes organisation only; it does not reproject, and it does not repair boundaries that were already mismatched.

## Conversion notes

TopoJSON ↔ GeoJSON changes numeric precision but preserves shape, and shared edges are not guaranteed to remain bit-identical. Use the [vector format converter](/en/tools/format-convert/); the plain structure is described in [GeoJSON](/en/guide/geojson/), and the wider comparison in the [15-format overview](/en/guide/vector-formats/).

## Sample data and parser

- [sample.topojson](/examples/data/sample.topojson), [topojson_parser.py](/examples/python/topojson_parser.py)

The sample holds a point, a line and a rectangular polygon, with `transform` set to `scale: [0.0001, 0.0001]` and `translate: [-180, -90]`. The standard-library script undoes the deltas, applies the quantisation parameters and stitches arcs by index:

```bash
python topojson_parser.py sample.topojson -o out.geojson
```

It handles Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon and GeometryCollection. Object names are not preserved.

## References

- [TopoJSON specification](https://github.com/topojson/topojson-specification)
- [topojson-client](https://github.com/topojson/topojson-client)