---
title: 'Google Tile Coordinates — Export an XYZ tile list | GeoToolbox'
description: 'Draw a rectangle on the map or import GeoJSON, compute Google / XYZ tile numbers for the zoom levels you choose and export x/y/z CSV files per zoom level.'
updated: 2026-11-09
faq:
  - q: 'What is the difference between XYZ and TMS tiles?'
    a: 'The x index is the same, but y is flipped. XYZ (used by Google Maps and OpenStreetMap) has its origin at the top-left and y increases southwards; TMS has its origin at the bottom-left and y increases northwards. For the same location and zoom, TMS y equals 2^z − 1 − XYZ y. This tool exports the XYZ scheme.'
  - q: 'Why does latitude stop at ±85.05112878°?'
    a: 'Web Mercator projects the globe onto a square, and the projected y tends to infinity as latitude approaches 90°. The value ±85.05112878° is exactly the top and bottom edge of that square, and it is the range Google Maps can actually display. Inputs beyond it are clamped to the edge instead of producing negative or out-of-range tile rows.'
  - q: 'How many tiles can I export at once?'
    a: 'There is no hard upper limit. Above 1,000,000 tiles the page shows a red warning that generation and download will be very slow and that the browser may stutter or run out of memory, but you can still generate. Each extra zoom level multiplies the count for the same extent by about four, so 12–14 works well for city-scale areas.'
  - q: 'Which column names does the import accept?'
    a: 'Two columns, longitude and latitude. Common headers such as lng, lon, longitude and lat, latitude are recognised automatically. If no coordinate columns can be identified the tool says so explicitly instead of guessing which column might be longitude.'
---

## What this tool solves

It turns an area on the map into the XYZ numbers that a tile service understands. Typical uses:

- build a tile list before downloading a region for offline use;
- define the pre-render extent for a self-hosted tile server without missing edge tiles;
- check which tile contains a particular point when debugging blank or misplaced tiles;
- convert the bounding box of a business dataset into tile indices for a spatial index.

Three integers look simple, but the origin, the direction of y, the latitude limit and the zoom range all have to be right. Get one wrong and the download succeeds while the imagery lands somewhere else. This tool fixes the formulas and edge handling in code, so the output can be dropped straight into an XYZ template such as `https://tile.example.com/{z}/{x}/{y}.png`.

## How Google / XYZ tile coordinates are calculated

For a zoom level `z`, each side of the grid has `n = 2^z` tiles. Longitude `lng` and latitude `lat` map to:

```text
x = floor((lng + 180) / 360 × n)
y = floor((1 − ln(tan(lat) + 1 / cos(lat)) / π) / 2 × n)
```

Latitude is in radians. x increases west to east, y increases north to south, and the origin is the top-left corner. Before calculating, latitude is clamped to ±85.05112878° and both indices are clamped to `0 … n−1`.

For example, Beijing at `116.3974, 39.9088` with `z = 10` gives `n = 1024`:

- `x = floor((116.3974 + 180) / 360 × 1024) = 843`
- `y = floor((1 − ln(tan(39.9088°) + sec(39.9088°)) / π) / 2 × 1024) = 388`

The point therefore belongs to tile `10/843/388`. Going the other way, `tileBounds(z, x, y)` reconstructs the longitude/latitude rectangle covered by a tile: the west edge is `x / n × 360 − 180`, the east edge adds one tile width, and the north/south edges come from the inverse hyperbolic sine.

## Zoom levels and tile counts

Tile counts grow exponentially. The whole world is one tile at z=0, four tiles at z=1 and about 1.05 million at z=10. For a fixed rectangle, every extra level multiplies the count by roughly four (rounding at the edges can make it slightly different).

The defaults are 12–14: 12 for a metropolitan area, 13 for a city district, 14 for a neighbourhood. Above 1,000,000 tiles the page shows a red warning that generation and download will be very slow and that the browser may stutter or run out of memory, but generation is still allowed; judge the memory yourself for very large counts. Results are sorted by `z → y → x`, which makes it easy to download in level-by-level batches.

## Drawing and importing

**Map selection.** Click “Draw extent” first — map panning pauses while you draw. Hold the left mouse button and drag a rectangle, or click two opposite corners in turn; the second method suits touch screens and precise placement. Drawing stops automatically when the rectangle is complete and panning resumes. The extent takes effect immediately and the panel shows the west, south, east and north bounds. When the extent and zoom levels look right, click “Generate tile coordinates” to run the calculation; the page shows only the total and a download button, with no tile list. A progress bar appears while generating and while preparing the CSV, and you can cancel at any time. Changing either requires generating again. Use “Clear selection” to start over.

**Importing data.** Click the upload icon in the map bar to import GeoJSON (`.geojson` / `.json`); points, lines and polygons are all supported. It is an either/or choice with drawing: importing replaces a manually drawn extent. For other formats, convert them first with the [format converter](/en/tools/format-convert/). After importing, the original boundary is drawn on the map and the feature count is shown. Tile generation keeps only tiles that intersect that boundary, so empty space inside the bounding box is not included. Coordinates are treated as WGS84 longitude/latitude — projected coordinates are not read. After importing, click “Generate tile coordinates” as well.

If the data crosses the 180° meridian, the tool picks the shorter side and says so explicitly. It never mistakes “170° west and 170° east” for a trip around the whole planet.

## Limits and precision

- Longitude must be within −180…180 and latitude within −90…90. Out-of-range coordinates raise an error instead of being silently dropped or truncated.
- There is no hard tile limit. Above 1,000,000 tiles a red warning explains the performance risk, but generation can continue.
- The download is split by zoom level: one CSV per level with the header `x, y, z`; multiple levels are packed into a ZIP so a single huge table does not have to be opened.
- Everything runs in the browser. Imported files are never uploaded, and the page calls no calculation service.

## Common questions

**Why does the count exceed my hand calculation?** A tile that the rectangle only touches is still included. The tool counts tiles that intersect the extent, not only those fully inside it, so the download list has no gaps.

**Can I export a single level?** Set the minimum and maximum Z to the same value. Multiple levels are enumerated separately and then merged into the sorted list.

**Can I use the list with a TMS template?** Not directly. For TMS, convert y to `2^z − 1 − y`; this tool exports the Google / XYZ scheme.