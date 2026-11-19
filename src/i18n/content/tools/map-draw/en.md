---
title: 'Online Map Drawing Tool: Points, Lines, Polygons | GeoToolbox'
description: 'Draw points, lines, polygons, rectangles and circles on a map, measure length and area, edit attributes, and export GeoJSON, KML, GPX, WKT or CSV.'
updated: 2026-11-16
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