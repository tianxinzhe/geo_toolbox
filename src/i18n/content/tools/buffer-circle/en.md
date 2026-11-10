---
title: 'Equidistant Circles & Buffers | GeoToolbox'
description: 'Create geodesic circles around any point, with multiple radii, or buffer existing features. See the result on a map and export GeoJSON, KML or WKT.'
updated: 2026-11-09
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

“What falls within three kilometres of this point?” It is one of the most common questions in site selection, delivery coverage, emergency planning, radio coverage and retail catchment analysis. The answer has to be visible on a map, and it has to export to a standard format before it can enter the next step of the workflow.

There are two modes:

- **Equidistant circle**: given a centre and a radius, generate a surface circle that respects the Earth’s curvature. Multiple radii produce concentric rings distinguished by colour.
- **Buffer**: expand existing points, lines or polygons by a given distance. Useful for “500 metres either side of this road” or “100 metres around this parcel”.

## Inputs and outputs

The centre can be typed as longitude and latitude, or picked from the map after enabling “Pick centre from map”. Radii support metres, kilometres, miles and nautical miles; separate multiple values with commas, spaces or semicolons, for example `1, 3, 5`. Advanced options control the number of boundary segments, 128 by default.

The result panel lists radius, area, perimeter and boundary point count for each ring, and the map draws each ring in a different colour. Export supports GeoJSON, KML and WKT, with the original radius and unit preserved in the feature properties.

## Accuracy and limits

Circle area uses an authalic sphere and perimeter uses geodesic distances on the WGS 84 ellipsoid. Larger radii and fewer segments increase the polygonal approximation error. When the total point count becomes too large, the tool automatically reduces the segment count and says so instead of freezing the page.

A single radius cannot exceed 20,000 km: beyond that the circle approaches a hemisphere and the concept stops being meaningful. The tool rejects such values and explains why. Radii less than or equal to zero are also rejected.

Buffer mode uses a planar approximation through turf, which is different from the geodesic semantics of circle mode. The former is good for quick illustration, the latter for coverage analysis where real distance matters. For strict accuracy, prefer circle mode or treat the buffer as a first-pass extent for a professional GIS.

## Map behaviour and fallback

The map uses keyless OpenStreetMap street tiles by default, with a top-right switch to Esri satellite imagery or the Esri topographic map. It is lazily initialised by an IntersectionObserver, so no tiles are requested while it is outside the viewport. If tiles fail to load, circle calculations, metrics and export remain fully available, and the page states that clearly.

On touch devices the map does not capture one-finger dragging by default, so vertical page scrolling is not hijacked. A visible “tap to enable map dragging” button switches the behaviour; pinch zoom always works.