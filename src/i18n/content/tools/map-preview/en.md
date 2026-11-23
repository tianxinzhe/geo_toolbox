---
title: 'Map Preview — View local vector data on a map | GeoToolbox'
description: 'Choose a GeoJSON, KML, GPX, Shapefile or Excel file and see it on a map instantly. Formats are detected automatically, can be picked manually, and files never leave your browser.'
updated: 2026-11-10
faq:
  - q: 'Is my data uploaded to a server?'
    a: 'No. The file is read through the browser File API and parsed and drawn inside this page. Nothing is uploaded, no calculation service is called, and the data disappears when you reload or close the tab.'
  - q: 'Which formats are supported?'
    a: 'GeoJSON / TopoJSON, KML / KMZ, GPX, CSV / TSV, Excel (xlsx / xls), Shapefile (zipped), FlatGeobuf, GeoPackage, WKT, GML, DXF, MIF / MID and GMT. Leaflet only understands GeoJSON, so every other format is converted locally to GeoJSON before it is drawn.'
  - q: 'Why is my data in the wrong place?'
    a: 'This tool reads coordinates as WGS84 longitude and latitude. If the file stores projected coordinates in metres — Web Mercator or a national grid, for example — features land in the wrong spot or raise an out-of-range warning. Convert them to longitude/latitude with the EPSG converter first.'
---

## What this tool solves

You have a GeoJSON, KML, GPX, or a spreadsheet of coordinates exported from another system, and you want to know where it actually lands on the ground. The usual route is a desktop GIS install or an online service that wants an account and an upload. This tool makes it one step: choose a file, look at the map.

The file is read once in the browser, normalised to GeoJSON, and handed to the map renderer. Nothing is registered, uploaded, or stored, so it is safe for internal or client data that should not leave your machine.

## Supported formats

| Format | Typical extensions | Notes |
| --- | --- | --- |
| GeoJSON / TopoJSON | `.geojson` `.json` `.topojson` | Drawn directly |
| KML / KMZ | `.kml` `.kmz` | Google Earth exports; KMZ is a zipped KML |
| GPX | `.gpx` | Tracks, routes and waypoints |
| CSV / TSV | `.csv` `.tsv` `.txt` | Needs longitude and latitude columns; headers are detected |
| Excel | `.xlsx` `.xls` | Reads the first worksheet |
| Shapefile | `.zip` | Pack `.shp`, `.dbf` and `.prj` into one zip |
| FlatGeobuf / GeoPackage | `.fgb` `.gpkg` | Binary vector formats, read layer by layer |
| WKT / GML | `.wkt` `.gml` | Text geometry and the OGC exchange format |
| DXF / MIF / MID / GMT | `.dxf` `.mif` `.mid` `.gmt` | Common CAD and desktop GIS exports |

Leaflet only renders GeoJSON, so everything except GeoJSON is parsed and converted to GeoJSON in the page with JavaScript before drawing. There is no need to run the format converter first.

## Detection and manual override

After you choose a file, the tool looks at the content (JSON structure, XML root element, CSV header) together with the extension. Most files are recognised immediately.

When the content is ambiguous — no extension, a renamed file, or a bare list of coordinates without headers — the page says it cannot recognise the format. Pick the right entry in the “File format” list on the left and the tool parses the same file again with that format; there is no need to choose the file twice.

Choosing the wrong format usually ends in a parse error, or in coordinates that fall outside the valid longitude/latitude range. The second case often means the file holds projected coordinates rather than degrees.

## Several files at once

You can select several files in one go or add them one by one. Each file is parsed and summarised on its own card, with its own format selector and feature count; the × button on a card removes just that file and leaves the others untouched.

The map overlays every file that parsed successfully and fits the extent of all of them. The panel header shows the number of files and the total feature count, and “Clear data” empties the whole list.

## How it is drawn

The parsed result is normalised to GeoJSON and then:

- points, lines and polygons are drawn as they are, keeping rings and holes;
- the map fits the extent of the data so the overall distribution is visible at once;
- each file reports its format, feature count, geometry types and how many issues the parser found;
- an empty file or all-invalid coordinates leave the default view in place with an explicit message instead of a blank map.

You can switch between street, satellite and terrain basemaps. Tile failures only affect the background, never your data. To keep editing or exporting, send the same data to the [map drawing tool](/en/tools/map-draw/) or save it in another format with the [vector format converter](/en/tools/format-convert/).

## Limits and precision

- One file up to 20 MB and 50,000 features. Crop the extent or simplify geometry above that.
- Coordinates are read as WGS84 longitude/latitude. A `.prj` file is not used and no datum shift is applied; convert projected data with the [EPSG converter](/en/tools/epsg-convert/) first.
- Shapefiles must be zipped, because a lone `.shp` carries no attributes or projection information.
- Excel reads only the first worksheet; split multi-sheet workbooks first.
- Everything runs in the browser. No calculation endpoint is called and nothing is written to local storage.

## Common questions

**Is my data uploaded?** No. The file is read through the File API and parsed in this page; reloading the tab clears it.

**Which formats work?** The 14 families in the table above. Everything except GeoJSON is converted locally before drawing.

**Why is my data in the wrong place?** Most often the file stores projected coordinates in metres while the tool expects WGS84 degrees. Convert it with the EPSG converter first.

## References

- [Leaflet: map rendering library documentation](https://leafletjs.com/)
- [RFC 7946: GeoJSON format specification](https://datatracker.ietf.org/doc/html/rfc7946)
