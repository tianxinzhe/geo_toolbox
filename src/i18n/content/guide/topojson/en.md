---
title: "TopoJSON explained: topology, arcs and quantisation | GeoToolbox"
description: How TopoJSON shares boundaries through arcs, quantises coordinates with transform, organises layers in objects, and why it cannot be opened directly and loses a little precision.
heading: "TopoJSON explained: arcs and quantisation"
group: vector
order: 5
readingMinutes: 1
updated: 2026-11-09
---

TopoJSON is a compressed, topology-aware version of GeoJSON. It is still JSON text, but instead of storing each polygon's full outline, it extracts shared boundaries into `arcs` and lets geometries reference arc indices.

## Why it exists

Administrative boundaries, parcels and watersheds share a lot of edges. GeoJSON stores those edges twice or more; TopoJSON stores them once. Combined with integer quantisation, files can shrink to a fraction of the original size.

## Structure

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
- `arcs` are deduplicated paths, stored as integers relative to `transform`.
- `transform.scale` and `translate` restore real coordinates.
- A negative arc index means the same arc traversed in reverse.

## Quantisation and precision

TopoJSON commonly compresses floats into integers. A smaller `scale` means stronger compression and a larger coordinate offset. For centimetre-level or survey-grade data, that error may be unacceptable; assess precision first.

## Limits

- **Cannot be opened directly**: browsers, QGIS and most GIS applications need a conversion back to GeoJSON or Shapefile.
- **Smaller ecosystem**: JavaScript has `topojson-client`; support elsewhere varies.
- **Only useful for vector topology**: point data gains nothing and adds a conversion step.
- **Properties stay in `properties`**, with the same structure as GeoJSON, so they usually survive.

## Conversion notes

TopoJSON ↔ GeoJSON changes numeric precision but preserves shape, and shared edges are not guaranteed to remain bit-identical. Use the [vector format converter](/en/tools/format-convert/); see the [15-format overview](/en/guide/vector-formats/) for alternatives.