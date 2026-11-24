---
title: 'How Google map tiles work: XYZ and zoom | GeoToolbox'
description: 'From Web Mercator to XYZ numbering: how zoom levels multiply tiles, how lon/lat become x/y/z, why y grows southwards, and what tile lists are for.'
heading: "How Google map tiles work: XYZ, zoom and coordinates"
group: tile
order: 18
readingMinutes: 4
updated: 2026-11-19
---

Open a web map and the browser does not download one complete world map. It assembles dozens of small images for the current view. Those images are **tiles**, each identified by `z`, `x` and `y`. Get comfortable with that identifier and you can build your own tile lists for offline caching, cache warming or data partitioning.

## Why tiles are square

It starts with the Web Mercator projection (EPSG:3857). It lays the world on a square: longitude runs from -180°–180°, and latitude is clipped at ±85.0511°. Closer to the poles the projected y tends to infinity, so the clip is unavoidable.

![World map in the Mercator projection with high latitudes enlarged](/images/projections/mercator.jpg)

*Web Mercator lays the world out as a square, which is why tiles can be cut as squares. Image: Strebe, CC BY-SA 3.0, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Mercator_projection_SW.jpg)*

Because the projection is square, subdivision is a simple bisection: each level splits every tile of the previous level into four.

## z: the zoom level

`z` is the zoom level, starting at 0:

- `z=0`: the whole world is one tile
- `z=1`: 2 × 2 = 4 tiles
- `z=2`: 4 × 4 = 16 tiles
- In general: 2^z × 2^z tiles per level

![The single world tile at z=0](/images/guide/osm-tile-z0.png)

*At `z=0` the whole world fits into one 256×256 tile. Image: Wikimedia Commons ([file page](https://commons.wikimedia.org/wiki/File:OSM,_entire_world_map_at_zoom_level_0_in_single_tile.svg)), data © OpenStreetMap contributors.*

Each additional level quadruples the tile count and doubles the ground resolution. Typical use: `z=4–8` for a whole country, `z=10–14` for a city, `z=15–18` for street level.

## x and y: where numbering starts

XYZ defines the **origin at the top-left (north-west) corner, with x increasing eastwards and y increasing southwards**. That is the opposite of the Cartesian axes taught in school, because image coordinates start at the top-left.

![Tile numbering at z=2, with 0,0 at the top left](/images/guide/tile-numbering.png)

*At `z=2` the world is divided into 4×4 tiles: `(0,0)` is top-left and `(3,3)` is bottom-right. Image: Wikimedia Commons ([file page](https://commons.wikimedia.org/wiki/File:Tiled_web_map_numbering.png)), base map © OpenStreetMap contributors.*

## Turning longitude and latitude into a tile

Let level `z` have `n = 2^z` columns (and the same number of rows), and convert latitude to radians `φ`:

```text
x = floor((longitude + 180) / 360 × n)
y = floor((1 − ln(tan φ + 1 / cos φ) / π) / 2 × n)
```

Here `ln` is the natural logarithm. Clip latitude to ±85.0511° first, then clamp `x` and `y` to `0 … n−1`. The result is a row and column, written with the level as `z/x/y`.

For Tiananmen in Beijing (116.3974°E, 39.9088°N):

| Zoom | x | y | Use |
|---|---|---|---|
| `z=10` | 843 | 388 | City level |
| `z=14` | 13489 | 6208 | Street level |

The same point has different identifiers at different levels, but they refer to the same location; each extra level roughly doubles `x` and `y`.

## The other direction: the extent of a tile

Given `z/x/y`, the tile's bounds follow:

```text
west  = x / n × 360 − 180
east  = (x + 1) / n × 360 − 180
north = atan(sinh(π × (1 − 2y / n))) × 180 / π
south = atan(sinh(π × (1 − 2(y + 1) / n))) × 180 / π
```

Selecting an area, batch-downloading a range and partitioning data by tile all rely on this reverse calculation.

## How many tiles an area covers

For a bbox and a zoom range, multiply the row and column ranges at each level and add them up. The count grows quickly: the Beijing fifth-ring area is a few hundred tiles at `z=15` but tens of thousands at `z=18`. Any tile-list tool therefore needs a cap, or the browser will freeze first.

## TMS versus XYZ

TMS (Tile Map Service) puts the y origin at the bottom-left and counts y upwards. The conversion is:

```text
y_tms = (2^z − 1) − y_xyz
```

If a tile list does not match what you see on the map, check for a flipped y axis first. Google, OpenStreetMap and most web maps use XYZ; some desktop GIS software and image pyramids use TMS.

## Common uses

- **Offline map packages**: list the area and levels, then download by tile list.
- **Cache warming**: pre-render tiles for hot areas so the first visit does not hit the origin server.
- **Data partitioning**: split large vector or raster jobs into tiles for parallel processing.
- **Capacity planning**: estimate storage and traffic before a launch.

Bulk tile fetching must respect the provider's terms of service. Google map tiles, in particular, may not be cached or redistributed outside its APIs.

## Generating your own XYZ list

Doing the formulas by hand is error-prone, especially across levels and the antimeridian. Use [Google tile coordinates](/en/tools/tile-coords/) to draw an area on the map or import GeoJSON, choose the zoom levels, and export a CSV of `x, y, z` that opens directly in Excel; you can also export the same tiles as GeoJSON polygons to check in QGIS or the map preview.

## Frequently asked

- **Why do tiles quadruple when z increases by one?** Each tile is cut horizontally and vertically, giving four.
- **Why clip latitude at 85.0511°?** Web Mercator forms a square at that latitude; closer to the poles y diverges.
- **Are tiles always 256 pixels?** Most are 256×256, but 512×512 high-resolution tiles also exist; at the same z they hold more detail.
- **Does x/y start at 0 or 1?** At 0; the largest number at level z is `2^z − 1`.

For projection families and how to choose one, see [map projections at a glance](/en/guide/projection-types/); to convert coordinates into tiles, use [Google tile coordinates](/en/tools/tile-coords/).