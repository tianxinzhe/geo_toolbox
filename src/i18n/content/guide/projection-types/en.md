---
title: "Map projections at a glance: coverage and use cases | GeoToolbox"
description: WGS84, Web Mercator, UTM, Gauss-Krüger, Japan Plane Rectangular and British National Grid — how the projections on this site group up, where they cover, and when to use each.
heading: "Map projections at a glance: coverage and use cases"
group: projection
order: 1
readingMinutes: 7
updated: 2026-11-09
---

The [projection converter](/en/tools/epsg-convert/) accepts over seven hundred EPSG coordinate systems, but they are not seven hundred unrelated projections. Almost all fall into five groups: unprojected longitude/latitude, Web Mercator, UTM, Gauss-Krüger (including Japan Plane Rectangular) and British National Grid.

This page covers each group: where it applies, what it suits, and where it goes wrong. The illustrations below show the shape and trade-offs of the main methods.

## Three layers behind one EPSG code

An EPSG code pins down three things at once:

| Layer | Meaning | Examples |
|---|---|---|
| Datum | Which ellipsoid, which origin | WGS84, CGCS2000, OSGB36 |
| Projection method | How the sphere is flattened | Mercator, transverse Mercator |
| Units and parameters | Metres or degrees, central meridian, false easting | 3° band at 117°E, 500 km |

So `EPSG:4548` and `EPSG:32650` both use transverse Mercator, but with different datums and band schemes. Their coordinates cannot be mixed.

## Overview

| Family | Options on this site | Coverage | Typical use |
|---|---|---|---|
| Geographic (unprojected) | WGS84 `4326`, CGCS2000 `4490`, Xian 1980 `4610`, Beijing 1954 `4214`, ETRS89 `4258`, NAD83 `4269`, NAD27 `4267`, OSGB36 `4277`, JGD2011 `6668`, JGD2000 `4612`, Tokyo `4301` | Global and continental | Storage, exchange, GPS, APIs |
| Web Mercator | `3857` | Global (about 85°S–85°N) | Web maps, tiles, visualisation |
| UTM | WGS84 `32601–32660` (north), `32701–32760` (south); JGD2011 `6688–6692` | 60 zones, 6° each | Cross-border works, remote sensing, mapping |
| Gauss-Krüger | 3° and 6° bands for CGCS2000, Xian 1980 and Beijing 1954 | China, central meridians 75°E–135°E | National mapping, planning, cadastre |
| Japan Plane Rectangular | JGD2011 `6669–6687`, JGD2000 `2443–2461`, Tokyo `30161–30179` | Japan, 19 zones | Surveying, registration, construction |
| British National Grid | `27700` | United Kingdom | Terrain, addresses, planning |

## Unprojected longitude and latitude

Coordinates such as `EPSG:4326` and `EPSG:4490` are in degrees, not metres. They are the right choice for storage and exchange: every piece of software reads them and every API can carry them. The drawback is that an angle cannot measure distance or area directly — one degree of longitude is about 111 km at the equator but only about 85 km at Beijing.

Most coordinates people encounter are of this kind. Project them only when measurement is needed.

## Web Mercator (EPSG:3857)

Almost every web map uses it for tiles (Leaflet, Mapbox, Google Maps and others). It cuts the world into square tiles that load by zoom level.

![Cylindrical projection diagram: rays from a single point at the centre of the globe onto a tangent cylinder](/images/projections/mercator-cylinder.png)

*How a cylindrical projection is built: rays from one point at the centre of the globe hit a cylinder tangent at the equator; unrolled, meridians become evenly spaced verticals and parallels horizontals. Mercator then adds a north–south stretch that grows with latitude, which is what makes it conformal. Image: Wikimedia Commons, [Projectieprincipe.PNG](https://commons.wikimedia.org/wiki/File:Projectieprincipe.PNG)*

The cost is **severe area distortion**: at 60° latitude areas are about four times too large, and Greenland looks comparable to Africa. Use it for display, never for measuring area or long distances.

![World map in the Mercator projection, with Greenland and Antarctica greatly enlarged](/images/projections/mercator.jpg)

*Mercator: meridians and parallels cross at right angles and local shape is preserved, but high-latitude areas are enlarged. Web Mercator keeps the same shape. Image: Strebe, CC BY-SA 3.0, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Mercator_projection_SW.jpg)*

## UTM

UTM is the global zoned form of transverse Mercator: 60 zones of 6° each, central-meridian scale factor 0.9996 and a false easting of 500 km.

- `EPSG:326xx` for the northern hemisphere, `327xx` for the southern, where `xx` is the zone.
- Most of China falls in zones 43–53; Beijing is zone 50, `EPSG:32650`.
- Japan uses JGD2011 zones 51–55 (`EPSG:6688–6692`).

![World map of UTM zones, each 6° wide and numbered](/images/projections/utm-zones.jpg)

*UTM divides the world into 60 zones of 6°, each projected and numbered independently. Image: public domain (US Government work), [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Utm-zones.jpg)*

The advantage is a globally consistent zone numbering, which makes cross-border data easy to assemble. The disadvantage is slightly larger distortion at zone edges, so works sitting on a zone boundary need a cross-zone check.

## Gauss-Krüger

The standard for Chinese engineering work. It is also transverse Mercator, with two important differences:

- **Narrower zones**: 3° bands dominate, with 6° bands for small-scale mapping.
- **Central-meridian scale factor of 1**, so there is no scale reduction at the central meridian.

This site covers three datums × two band widths:

| Datum | 3° band EPSG | 6° band EPSG |
|---|---|---|
| CGCS2000 | `4534–4554` | `4502–4512` |
| Xian 1980 | `2370–2390` | `2338–2348` |
| Beijing 1954 | `2422–2442` | `21453–21463` |

Central meridians run from 75°E to 135°E. When picking a band, confirm the central meridian of the data rather than the words "3-degree band".

## Japan Plane Rectangular

Japanese surveying and registration use 19 zones, each with its own origin, a scale factor of 0.9999 and zero false easting and northing.

| Datum | Zones I–XIX EPSG |
|---|---|
| JGD2011 | `6669–6687` |
| JGD2000 | `2443–2461` |
| Tokyo | `30161–30179` |

One quirk: **the axis order is X = north, Y = east**, the reverse of the usual X = east, Y = north. The converter on this site labels fields as "north (X) / east (Y)" according to the coordinate system so they are not swapped.

## British National Grid (EPSG:27700)

The transverse Mercator projection used by Ordnance Survey, on the OSGB36 datum, in metres. British terrain, address and planning data commonly use it. It is offset from ETRS89 / WGS84 by several metres, so it cannot be treated as longitude and latitude.

## Other common projection methods

The four below are not in the quick list on this site, but they come up when reading maps and choosing projections.

### Lambert conformal conic

A cone sits over the mid-latitudes: meridians become straight radiating lines and parallels become concentric arcs. It is conformal, suits mid-latitude regions that extend east–west, and is common in aviation charts and national base maps.

![World map in the Lambert conformal conic projection, with parallels as concentric arcs](/images/projections/lambert-conformal-conic.jpg)

*Image: Strebe, CC BY-SA 3.0, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Lambert_conformal_conic_projection_SW.jpg)*

### Albers equal-area conic

Also a cone, but this one preserves area. It is common for national land use, population density and agricultural statistics, where the areas of different provinces must be comparable.

![World map in the Albers equal-area conic projection](/images/projections/albers.jpg)

*Image: Strebe, CC BY-SA 3.0, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Albers_projection_SW.jpg)*

### Azimuthal equidistant

Projects outward from a centre point, keeping distances from that centre accurate. It is common for polar maps and aviation or radio coverage; centred on a city, it shows the equal-distance range in every direction.

![World map in the azimuthal equidistant projection centred on the North Pole](/images/projections/azimuthal-equidistant.jpg)

*Image: Strebe, CC BY-SA 3.0, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Azimuthal_equidistant_projection_SW.jpg)*

### Robinson

A compromise projection: neither conformal nor equal-area, but with moderate error in both area and shape. It is common for world thematic maps and textbook global views.

![World map in the Robinson projection, an oval outline](/images/projections/robinson.jpg)

*Image: Strebe, CC BY-SA 3.0, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Robinson_projection_SW.jpg)*

The rule for choosing among them is unchanged: decide first what must be preserved — angles, area, or distance from one point.

## Same projection, different datum

With identical projection parameters, different datums shift coordinates by tens to hundreds of metres:

- **CGCS2000 and WGS84**: centimetre-level in practice, effectively interchangeable.
- **Xian 1980**: no official seven-parameter transform is published, so this site will not silently treat it as WGS84; you must supply the parameters.
- **Beijing 1954**: Krassovsky ellipsoid, hundreds of metres from WGS84.
- **Tokyo (Bessel ellipsoid)**: hundreds of metres from JGD2011; Japan moved to JGD2011 after the 2011 earthquake.
- **JGD2000 and JGD2011**: the Tōhoku earthquake shifted the datum, so the two differ by tens of centimetres in eastern Japan.

This is why, when a conversion is off by tens of metres, you check the datum before the projection parameters.

## Quick selection

| What you are doing | What to choose |
|---|---|
| Storing data or passing it to another system | `EPSG:4326` or the national geographic code |
| Building a web map | `EPSG:3857` |
| Measuring distance or area in China | CGCS2000 3° band, chosen by central meridian |
| Cross-border or continental works | UTM, chosen by longitude |
| Japanese surveying or registration | JGD2011 Plane Rectangular, by prefecture zone |
| UK addresses and planning | `EPSG:27700` |
| Just seeing where a point is | Anything, but do not compute with it |

## Three things to watch

1. **Confirm the zone and central meridian together**. "3-degree band" alone is not enough; state the zone number or the central meridian.
2. **Do not force a cross-zone conversion**. Edge distortion grows noticeably when data spans two bands; split by zone or use a projection with wider coverage.
3. **Axis order and units follow the coordinate system**. Japan Plane Rectangular is X = north; projected coordinates are in metres while geographic coordinates are in degrees.

For the underlying theory and how to choose, see [map projections and EPSG](/en/guide/projections-epsg/); for actual conversion use the [projection converter](/en/tools/epsg-convert/).