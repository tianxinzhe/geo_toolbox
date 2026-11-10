---
title: "GPX explained: waypoints, tracks and routes | GeoToolbox"
description: GPX's wpt, trk and rte elements, the lat/lon attribute convention, elevation and time fields, and its inability to store polygons or rich attributes.
heading: "GPX explained: waypoints, tracks and routes"
group: vector
order: 7
readingMinutes: 6
updated: 2026-11-09
---

GPX is the de facto standard for GPS devices, sports watches and tracking apps. It records waypoints, tracks and routes in XML, and almost every outdoor application can import it.

## Three core elements

- `<wpt>`: a waypoint, one coordinate.
- `<trk>`: a track made of `<trkseg>` segments, each with `<trkpt>` points.
- `<rte>`: a route made of `<rtept>` points, usually a planned path rather than a recording.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GeoToolbox"
     xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="39.9088" lon="116.3974">
    <name>Tiananmen</name>
    <ele>44.0</ele>
  </wpt>
  <trk>
    <name>Morning run</name>
    <trkseg>
      <trkpt lat="39.9088" lon="116.3974"><time>2026-11-09T06:00:00Z</time></trkpt>
      <trkpt lat="39.9095" lon="116.3981"><time>2026-11-09T06:00:30Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>
```

## Coordinates and fields

- **Latitude and longitude live in `lat` / `lon` attributes**, the reverse order of KML's `<coordinates>`.
- **Always WGS84**.
- **Common child elements**: `<ele>` elevation, `<time>`, `<name>`, `<desc>`, `<sym>`.
- **Times are UTC** with a `Z` suffix; local time must be converted.

## Limits

- **No polygons**: parcels, boundaries and administrative areas cannot be represented; forcing them in produces a closed line.
- **Fixed attributes**: beyond name, description, time and elevation there is no general slot for business fields.
- **Poor extension compatibility**: vendor-specific namespaces are often ignored elsewhere.
- **Not for large data**: per-point XML is bulky; a hundred thousand points becomes very heavy.

## Conversion notes

GPX to GeoJSON turns tracks into LineStrings and waypoints into Points, usually carrying time and elevation as properties. The reverse cannot store polygons; at best it takes a boundary or degrades to a line. Use the [vector format converter](/en/tools/format-convert/).