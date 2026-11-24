---
title: 'Equidistant Circles & Buffers | GeoToolbox'
description: 'Create geodesic circles around any point, with multiple radii, or buffer existing features. See the result on a map and export GeoJSON, KML or WKT.'
updated: 2026-11-23
readingMinutes: 7
faq:
  - q: 'How is an equidistant circle different from a circle drawn on a web map?'
    a: 'A circle drawn on a Web Mercator map is projected first and then drawn, so its radius is stretched at high latitudes. That is a projected circle. The equidistant circle here is defined on the ellipsoid: every boundary point lies the same geodesic distance from the centre in every direction. The same radius therefore covers the same real-world distance at the equator and at high latitude, which is the semantics that site selection and coverage analysis need.'
  - q: 'Why is the radius capped at 20,000 km?'
    a: '20,000 km is close to half the Earth’s circumference, the distance from the centre to its antipode. Beyond that the boundary wraps around the far side and starts to overlap itself, so “within N kilometres of the centre” stops describing a simple region. The tool rejects such values and explains why rather than producing a polygon that looks plausible but is meaningless.'
  - q: 'Which algorithm does buffer mode use?'
    a: 'Buffer mode expands pasted or imported points, lines and polygons using the community-standard JSTS planar approximation through turf.buffer. It is not an ellipsoidal geodesic buffer; it is suitable for illustration and coverage screening, not legal surveying. Equidistant circle mode uses Vincenty direct calculations in every direction. The two modes have different accuracy semantics, stated in the result panel and documentation.'
  - q: 'How accurate are the area and perimeter figures?'
    a: 'Area uses an authalic sphere so that area is conserved, while perimeter sums geodesic distances on the WGS 84 ellipsoid so that length is not distorted by the equal-area mapping. This follows the same SR-03 rules as the area converter. For very small radii the polygonal approximation introduces a slightly larger relative area error; increasing the segment count reduces it.'
---

## What question this tool answers

“What falls within three kilometres of this point?” Site selection, delivery coverage, emergency planning, radio coverage and retail catchment analysis all ask it. The answer has to be visible on a map, and it has to export in a standard format before it can move to the next step.

There are two modes:

- **Equidistant circle**: given a centre and a radius, generate a surface circle that respects the Earth’s curvature. Multiple radii produce concentric rings distinguished by colour.
- **Buffer**: expand existing points, lines or polygons by a given distance. Useful for “500 metres either side of this road” or “100 metres around this parcel”.

In buffer mode a point does not need to be GeoJSON: write one `longitude, latitude` pair per line in the input box and each line is treated as a point, so coordinate lists can be pasted straight in.

You can also upload a file — GeoJSON, KML, GPX, CSV, Shapefile ZIP, GeoPackage and more. When the file has several layers a “Layer” dropdown appears: GeoPackage and Shapefile ZIP use the real layer names inside the file, while GeoJSON is split into points, lines and polygons that you can pick from before buffering.

## Inputs and outputs

The centre can be typed as longitude and latitude, or picked from the map after enabling “Pick centre from map”. Radii support metres, kilometres, miles and nautical miles; separate multiple values with commas, spaces or semicolons, for example `1, 3, 5`. Advanced options control the number of boundary segments, 128 by default.

The result panel lists radius, area, perimeter and boundary point count for each ring, and the map draws each ring in a different colour. Export supports GeoJSON, KML and WKT, with the original radius and unit preserved in the feature properties.

## Accuracy and limits

Circle area uses an authalic sphere and perimeter uses geodesic distances on the WGS 84 ellipsoid. Larger radii and fewer segments increase the polygonal approximation error. When the total point count becomes too large, the tool automatically reduces the segment count and says so instead of freezing the page.

A single radius cannot exceed 20,000 km: beyond that the circle approaches a hemisphere and the concept stops being meaningful. The tool rejects such values and explains why. Radii less than or equal to zero are also rejected.

Buffer mode uses a planar approximation through turf, which is different from the geodesic semantics of circle mode. That suits quick illustration and is weak for coverage analysis where real distance matters. For strict accuracy, prefer circle mode, or treat the buffer as a first-pass extent for a professional GIS.

## Map behaviour and fallback

The map uses keyless Esri street tiles by default (falling back to OpenStreetMap if Esri is unreachable), with a top-right switch to Esri satellite imagery or the Esri topographic map. It is lazily initialised by an IntersectionObserver, so no tiles are requested while it is outside the viewport. If tiles fail to load, circle calculations, metrics and export remain fully available, and the page states that clearly.

On touch devices the map does not capture one-finger dragging by default, so vertical page scrolling is not hijacked. A visible “tap to enable map dragging” button switches the behaviour; pinch zoom always works.

## Coordinates, geometry and properties

Both modes compute in WGS 84 longitude and latitude. A Shapefile with a `.prj` file is reprojected to WGS 84 during parsing; projected coordinates in metres in other formats are not converted, so they land in completely the wrong place and need conversion first. Background on projection distortion is in [Map projections at a glance](/en/guide/projection-types/). The centre accepts many decimal places, but the map can only show what the current zoom level resolves; use the typed values, not the visual position, when the result must be reproduced exactly.

Each radius in circle mode becomes one Polygon with a closed ring and boundary points spaced evenly by bearing. Exported properties carry the original `radius`, the `unit`, the converted `radius_m`, spherical `area_m2`, ellipsoidal `perimeter_m`, the boundary `points` count, and a `color` that is only a display hint. The centre coordinates are not written into the properties, and the polygon no longer carries a centre-and-radius meaning; if the centre is needed later, keep a separate record of it.

Buffer mode creates one result feature for every source feature and every radius. Properties are copied from the source and extended with `source_type` and `radius_m`. Adjacent or overlapping buffers are not merged or dissolved: two parallel roads buffered by 500 metres yield two overlapping polygons. Use a dissolve tool or a desktop GIS when a single merged area is required.

## Boundaries and limits

Centre latitude must lie between −90 and 90 and longitude between −180 and 180. Radii must be positive and a single radius cannot exceed 20,000 km. The segment count is an integer from 8 to 1024, 128 by default; decimals are rounded and out-of-range values are clamped. When the total boundary point count would exceed 8192, the tool lowers the segment count and says so instead of building an oversized geometry.

Near the antipode, Vincenty's direct calculation may fail to converge, and some boundary points fall back to a spherical approximation. The page marks this explicitly; the result remains usable but is no longer a strict ellipsoidal solution. Zero, negative and non-numeric radii are rejected rather than producing an empty polygon.

Buffer mode accepts points, lines and polygons. Features without geometry are skipped, and zero or negative radius combinations produce nothing. Empty source properties are carried through unchanged rather than filled with defaults. Files above 20 MB or 50,000 features are refused and must be cropped first.

## Performance and data volume

Circle work grows with the number of radii multiplied by the segment count. Three radii at 128 segments produce only a few hundred points and finish immediately. Raising the segment count to 1024 and entering a dozen radii increases the point count, so map redraws and export take longer, though they remain manageable.

Buffer mode is much heavier: every feature and every radius runs a separate JSTS buffer, and complex polygons or long lines add many vertices. Tens of features with one radius are easy; thousands of features with several radii become visibly slow and can pressure memory. At that scale, buffer in a desktop GIS or PostGIS and bring the result back here for inspection.

Browser-side work suits quick extent checks, illustration and first-pass coverage screening. Batch jobs, topology cleanup, projected buffers and legally precise distances need professional tools. When data approaches the limits, simplifying geometry or splitting by extent helps more than increasing the segment count.

## Compared with alternatives

| Aspect | Circle mode | Buffer mode | Desktop GIS |
| --- | --- | --- | --- |
| Distance meaning | Ellipsoidal geodesic, per bearing | Local azimuthal equidistant approximation | Projected or geodesic, configurable |
| High latitude, large radius | Boundary stays equidistant | Shape distorts at very large radii | Depends on projection and settings |
| Input | Centre and radius | Points, lines and polygons | Any layer |
| Result | One Polygon per radius | One feature per feature and radius | Dissolve and topology editing available |
| Best for | Coverage and catchment radii | Roadside or parcel setbacks | Production analysis and loading |

Use circle mode when equal real-world distance matters, and buffer mode for setbacks along roads or parcels. When you need dissolve, projected buffers or strict accuracy, a desktop GIS or spatial database is the right tool.

## A worked example

Take a point in Beijing at `116.3974, 39.9088`, enter radii `1, 3, 5`, choose kilometres and keep 128 segments.

The run produces three concentric polygons, and the result table lists radius, area, perimeter and boundary point count for each. The 1 km ring has an area close to 3.14 square kilometres and a perimeter close to 6.28 km; the 5 km ring is close to 78.5 square kilometres. Because the boundary is a polygon rather than a perfect circle, the area is slightly below πr², and more segments close the gap. The exported GeoJSON contains three features with `radius` and `unit` preserved; colour is only a display hint.

In buffer mode, paste a road LineString and enter `0.5` km to get a corridor covering 500 metres on each side, with `source_type: "LineString"` and `radius_m: 500` in the properties. Add a second road and the two buffers remain separate features; the overlap is not dissolved.

## References

- [OGC Simple Features: geometry types and buffer semantics](https://www.ogc.org/publications/standard/sfa/)
- [GeographicLib: geodesic algorithms and accuracy](https://geographiclib.sourceforge.io/)
- [Movable Type: spherical distance and bearing formulas](https://www.movable-type.co.uk/scripts/latlong.html)
