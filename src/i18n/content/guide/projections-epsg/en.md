---
title: "Map projections and EPSG codes: choosing UTM or Gauss-Krüger | GeoToolbox"
description: What happens between longitude/latitude and planar coordinates, how UTM differs from Gauss-Krüger, how to read EPSG codes, and the zone, axis-order and unit traps.
heading: Map projections and EPSG codes
group: projection
order: 2
readingMinutes: 5
updated: 2026-11-23
---

Longitude and latitude are angles on a sphere, so you cannot measure distance or area with them directly. Surveying, planning and map production all require flattening the sphere first, which is what a projection does.

## Every projection distorts something

You cannot preserve angles, distances and areas at the same time. A projection chooses what to keep:

- **Conformal**: local shape and direction are preserved, but area grows with latitude. Mercator is conformal.
- **Equal-area**: area is accurate, shapes stretch. Useful for statistics and thematic maps.
- **Equidistant**: distance is correct only along specific directions, suitable for small extents.

If an area result is off by tens of square metres, check the projection before blaming the formula.

## UTM versus Gauss-Krüger

Both are transverse Mercator variants with zones. The differences are the zone width and scale factor:

| | UTM | Gauss-Krüger |
|---|---|---|
| Zone width | 6° | 3° or 6° |
| Central meridian scale | 0.9996 | 1 |
| False easting | 500,000 m | 500,000 m (zone prefix varies) |
| Typical use | Global | China, Japan and others |

UTM has globally consistent zone numbers, which simplifies cross-border data. Gauss-Krüger is common in Chinese and Japanese surveying, and the zone number and central meridian must match what the data provider used.

## What an EPSG code means

EPSG codes identify a coordinate reference system. One code fixes the datum, projection method, units and parameters:

- `EPSG:4326`: WGS84 longitude/latitude
- `EPSG:3857`: Web Mercator, used by web map tiles
- `EPSG:32650`: WGS84 / UTM zone 50N
- `EPSG:4547`: CGCS2000 / 3-degree Gauss-Krüger, central meridian 114°E

“UTM zone 50” alone is not enough: the datum could be WGS84 or CGCS2000, and the planar coordinates differ by metres.

## Three traps

1. **Zone edges**: data spanning two 3-degree zones should not be forced into one zone; distortion grows quickly at the edges.
2. **Axis order**: Japan's plane rectangular coordinate system uses X for northing and Y for easting, the opposite of the usual convention. Field labels must follow the CRS.
3. **Units**: projected coordinates are in metres, geographic coordinates in degrees. Mixing them in one column produces wrong results.

## How to choose

- Display only, no measurement: use `EPSG:4326` or `EPSG:3857`.
- Engineering measurement or area statistics: pick a projection that covers the extent, preferably equal-area or locally equidistant.
- Cross-border data: UTM. Chinese deliverables: the CGCS2000 3-degree or 6-degree zone required by the project.
- Japan: JGD2011 with one of the 19 plane rectangular zones.

## Common mistakes and traps

Most projection problems raise no error and simply shift the result. These four cover the usual cases.

1. **Feeding projected coordinates into a longitude/latitude field**
   - Symptom: `500000 4331000` in a lon/lat box lands in the Gulf of Guinea, or is rejected as out of range.
   - Cause: the source is a metric projected CRS, but the column header says lon / lat. Coordinates copied from CAD drawings or survey deliverables rarely carry a CRS label.
   - Effect: the point is hundreds or thousands of kilometres away, and every later buffer, overlay or clip is invalid without a single warning.
   - Fix: check magnitude first. Longitude stays within ±180 and latitude within ±90. Anything larger is a planar coordinate, so identify its EPSG code before converting.

2. **Mixing EPSG:4326 with EPSG:3857**
   - Symptom: the basemap and the overlay drift apart, more at higher latitudes, and measured lengths come out too large.
   - Cause: one CRS uses degrees, the other metres. Web Mercator scales coordinates through a projection function, so plotting raw numbers against the other CRS shifts them.
   - Effect: the error is minor near the equator and reaches tens of kilometres at mid latitudes; areas measured on 3857 are inflated.
   - Fix: keep tiles on 3857 and stored data on 4326, let the map library reproject for display, and do not rewrite values back and forth in the file.

3. **Ignoring units and axis order**
   - Symptom: a geometry is rotated by ninety degrees or mirrored, or an area result is off by an order of magnitude.
   - Cause: units and axis order belong to the CRS definition. The registered EPSG:4326 axis order is latitude first, longitude second, while most software displays longitude first.
   - Effect: every individual value is legal, but positions and measurements are wrong, which sends people looking for a formula bug.
   - Fix: map fields according to the EPSG definition, state units on input and output, and convert units before calculating.

4. **Zones and central meridians that do not match**
   - Symptom: seams show stretching or gaps, or an entire layer is shifted one zone width east or west.
   - Cause: the zone number was applied without checking the central meridian. Three-degree and six-degree zones are numbered differently, and the false-easting prefix is often dropped.
   - Effect: distortion grows away from the central meridian, edges no longer line up, and results cannot be measured directly.
   - Fix: confirm the zone width and whether the zone number carries a prefix, then project each zone separately before joining.

A PROJ string and an EPSG code describe the same definition at two levels. The EPSG code is a registered identifier for a full set of datum, projection, units and parameters. A PROJ string writes those parameters out, for example `+proj=utm +zone=50 +datum=WGS84`. The same code may resolve to updated parameters in a newer PROJ release, so pass EPSG codes between software and fall back to the full string only when the registry has no match. The command `projinfo EPSG:4547` prints the definition PROJ actually uses. The registry is at [epsg.org](https://epsg.org/); the implementation and documentation are at [proj.org](https://proj.org/).

## Choosing a CRS

| Task | Recommended CRS | Watch out for |
|---|---|---|
| Web display, tile basemaps | EPSG:3857 | Display only, never measure on it |
| Storage and exchange | EPSG:4326 | Degrees, and the longitude/latitude order |
| Chinese engineering deliverables | CGCS2000 3-degree or 6-degree Gauss-Krüger | Check zone number, central meridian and false-easting prefix |
| Cross-border or very large extents | The matching WGS84 UTM zone | Check hemisphere and zone number |

## Tools and examples on this site

When a pair of numbers could be degrees or metres, run it through the [projected CRS converter](/en/tools/epsg-convert/) against the target EPSG code. The field labels follow the selected CRS, which keeps eastings out of the latitude box. To check degree-minute-second notation, use the [DMS converter](/en/tools/dms-decimal/). For tiles, the [Google tile coordinate generator](/en/tools/tile-coords/) exports x/y/z lists for a selected box, and [how Google map tiles work](/en/guide/google-tiles/) explains the Web Mercator connection. To confirm where converted data actually lands, overlay it in [map preview](/en/tools/map-preview/).

For the coverage and use cases of each projection group, see [map projections at a glance](/en/guide/projection-types/). For actual conversions, use the [EPSG converter](/en/tools/epsg-convert/), which labels fields in the correct axis order.

A projection is not “whatever works”: it must be accurate enough for the extent in question. Choosing the wrong one raises no error; the numbers simply drift.