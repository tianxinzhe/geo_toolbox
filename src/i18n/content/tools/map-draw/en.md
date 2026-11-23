---
title: 'Online Map Drawing Tool: Points, Lines, Polygons | GeoToolbox'
description: 'Draw points, lines, polygons, rectangles and circles on a map, measure length and area, edit attributes, and export GeoJSON, KML, GPX, WKT or CSV.'
updated: 2026-11-23
readingMinutes: 6
faq:
  - q: 'Is my drawing uploaded to a server?'
    a: 'No. Drawing, measuring, attribute editing and export all run in the browser, with no upload request. To recover your work after an accidental page close, this tool writes features to the browser’s localStorage. It is the only tool on this site that persists user content, and the privacy policy says so explicitly. You can clear it at any time with “Clear local save”.'
  - q: 'Which coordinate system do exports use?'
    a: 'Everything is exported as WGS 84 longitude and latitude. GeoJSON, KML, GPX, WKT and CSV all follow WGS 84 semantics, and the Shapefile .prj declares WGS 84 as well. If a receiving system needs another coordinate system, convert it separately with the projected CRS converter.'
  - q: 'Why does deleting a feature require confirmation?'
    a: 'Deletion is irreversible, and losing a polygon you spent time on is frustrating. Single deletes and “clear all” both use an inline confirmation that states how many features are affected. After deleting, you can still undo with Ctrl+Z or the undo button; the history holds 50 steps.'
  - q: 'Does it work on a phone?'
    a: 'Basic point, line, polygon, rectangle and circle drawing works, the undo button is always visible and at least 44 px, and the map does not hijack one-finger page scrolling by default. Precise vertex dragging and complex polygons are still easier on a desktop; when the selected feature has more than 30 vertices, the tool says so explicitly.'
---

## What this tool does

Some data is not worth writing code for, and opening a desktop GIS is overkill: mark a parcel, pin a few locations, sketch a route, circle a service area. This tool lets you draw directly on the map and immediately get standard vector data back.

There are five drawing modes:

- **Point**: click the map to add a point. Consecutive clicks add independent points.
- **Line**: click to add vertices, then double-click or press Enter to finish. The running length is shown while drawing.
- **Polygon**: click to add vertices, then double-click or press Enter to close. Fewer than three points cannot form a polygon.
- **Rectangle**: press at one corner and drag to the opposite corner.
- **Circle**: press at the centre and drag to set the radius. The circle is converted to a polygon along geodesic distances, using 64 segments by default.

## Editing, measuring and attributes

In select mode, click a feature to select it. The side panel lists every property as a key/value row, so you can rename, edit, delete or add fields directly. Property names cannot be empty or duplicated, and reserved names such as `type` and `coordinates` are rejected.

Line vertices can be dragged to reshape the line. For polygons you can drag vertices and click an edge midpoint to insert a new vertex. The feature list shows live measurements: coordinates for points, length for lines, area and perimeter for polygons. The statistics bar summarises feature count, type counts, total length and total area.

Undo and redo cover adding, deleting, vertex editing and property changes, with a 50-step history. Shortcuts: `Ctrl+Z` undo, `Ctrl+Y` redo, `Delete` delete the selected feature, `Esc` cancel the current drawing and `Enter` finish a line or polygon.

## Import, export and coordinate systems

You can paste or choose a file to append GeoJSON, KML, GPX, CSV, TopoJSON or WKT features. Imported features are added to the current canvas; nothing is cleared. Export supports GeoJSON, KML, GPX, WKT and CSV. GPX cannot store polygons, so the tool reports how many features will be skipped.

The coordinate system is fixed to WGS 84. Every export format writes the original longitude and latitude without any datum transformation.

## Autosave and fallback

One second after each change, the features are written to browser local storage. Reopening the page restores them and reports how many were recovered. If storage is full, autosave stops and the tool asks you to export promptly rather than overwriting existing data.

The basemap defaults to keyless OpenStreetMap streets, with a top-right switch to Esri satellite imagery or the Esri topographic map. If tiles fail, drawing, measurement and export remain fully usable, only without a visual reference. Above 2,000 features the tool warns about performance but does not block further work.

## Inputs and outputs

Imports arrive by paste or file in GeoJSON, KML, GPX, CSV, TopoJSON or WKT. New features are appended; the current canvas is never cleared. A GeoJSON FeatureCollection is expanded as-is, CSV produces points from its coordinate columns with the other columns as properties, KML geometry becomes points, lines and polygons, and GPX waypoints, routes and tracks become points and lines. Property names and values keep their original spelling and case. Nested objects and arrays appear in the property panel as JSON text; editing that text turns the value into a string, so restructure nested data before import if the structure matters.

Export covers GeoJSON, KML, GPX, WKT, CSV and a zipped Shapefile. GeoJSON is written as a FeatureCollection with eight decimal places and empty properties removed. CSV writes `lng`, `lat` and the property columns when every feature is a point; as soon as a line or polygon is present it switches to a `wkt` column plus properties, because one table cannot hold both shapes. GPX cannot carry polygons, so those features are skipped and counted in a warning. The Shapefile archive contains `.shp`, `.shx`, `.dbf`, `.prj` and `.cpg`, with the projection declared as WGS 84. Circles and rectangles are stored as polygons; a circle is a 64-segment approximation, and its radius is not added to the properties automatically, so add a field if the radius must survive.

## Boundaries and limits

Coordinates are treated as WGS 84 longitude and latitude, with no reprojection. Projected coordinates in metres therefore land in the wrong place and need conversion first.

Drawing does not validate geometry. A self-intersecting polygon can be drawn and exported, and its area is still computed on the sphere, but downstream overlay, buffer or database tools may reject the ring or return something hard to explain. Ring winding is not normalised either: GeoJSON specifies counterclockwise exterior rings, while this tool writes points in the order they were clicked. Most readers tolerate either direction, but a strict checker may ask for repair. See [GeoJSON explained](/en/guide/geojson/) for coordinate order and ring structure.

Repeated points are not merged. Clicking the same spot twice creates a zero-length edge; length totals ignore it, yet the exported file carries a duplicate coordinate. Removing duplicates is data repair, so it is not done silently while drawing.

Undo covers deletes, clears and property changes, but the history holds 50 steps. Autosave depends on the browser quota; when storage is full, saving pauses and the page asks for an export. A missing basemap does not affect the data.

## Precision and performance

Drawing accuracy is bounded by screen pixels. At low zoom a pixel can represent hundreds of metres, and that error goes straight into the coordinate; zoom to street level before clicking, or import known coordinates instead. Circle radius comes from the geodesic distance between the centre and the pressed point, not from a pixel radius, so changing zoom does not alter a finished circle.

Length is summed edge by edge along geodesics and area uses spherical excess on the authalic sphere, so neither depends on a projected plane and high latitudes do not stretch the area. The cost is per-edge geodesic work: a single polygon with tens of thousands of vertices makes selection and statistics noticeably slower. Above 2,000 features the page already warns about smoothness, and at that size editing, redrawing and export previews all feel sluggish.

Local browser computation suits manual drawing and light cleanup from a handful to a few hundred features. Batch editing, topology checks and layer overlays at thousands of features belong in a desktop GIS or a command-line tool; bring the result back here for inspection.

## Compared with alternatives

| Aspect | This tool | Desktop GIS | Command line |
| --- | --- | --- | --- |
| Setup | Open a page and draw | Install and learn | Write commands |
| Typical size | Tens to hundreds of features | Tens of thousands, complex topology | Large batches and repeatable runs |
| Editing | Drag vertices, edit properties live | Full editing and snapping | None |
| Where data lives | In the browser | Local project files | Local scripts and files |
| Automation | None | Models and scripts, partly | Best suited |

For a quick extent or a few pins this tool is fastest. Precise snapping, topology rules and attribute joins fit a desktop GIS. A fixed daily pipeline is better served by a command-line script.

## A worked example

Suppose three sampling points must be marked in a campus and a 500-metre reference area drawn around its centre.

1. Zoom until campus roads are legible, pick point mode and click the three sampling locations. Each click adds a row with its longitude and latitude.
2. Switch to circle mode, press at the campus centre and drag outward to roughly 500 metres. On release the canvas shows a 64-segment polygon, and the list reports an area close to the spherical area for that radius.
3. Select the circle, add a `purpose` key with the value `survey-area`, and give each point a `sample_id`.
4. Export GeoJSON: the result is a FeatureCollection with three Point features and one Polygon, carrying the properties just entered. Exporting CSV instead produces a `wkt` column, not `lng` and `lat`, because the collection mixes points and a polygon.

If only the points are needed downstream, delete the circle before export. If the exact radius matters, store it as a property, since the polygon no longer carries the centre-and-radius meaning.

## References

- [Leaflet: map rendering library documentation](https://leafletjs.com/)
- [Leaflet-Geoman: drawing and editing plugin](https://github.com/geoman-io/leaflet-geoman)
- [RFC 7946: GeoJSON export format](https://datatracker.ietf.org/doc/html/rfc7946)
