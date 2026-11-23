---
title: 'Projected CRS Converter (EPSG) | GeoToolbox'
description: 'Convert coordinates between WGS 84, UTM, Web Mercator, China’s Gauss-Krüger bands and Japan’s 19 plane rectangular zones. Enter any EPSG code, all in your browser.'
updated: 2026-11-23
faq:
  - q: 'Why is X northing and Y easting in Japan’s plane rectangular system?'
    a: 'Japanese survey regulations define X as northing and Y as easting, the opposite of the GIS convention used by most software. If you enter easting in the first field, nothing errors — the point simply lands hundreds of kilometres away. This tool changes the field labels with the selected CRS: a geographic CRS shows “X (longitude)” and “Y (latitude)”, Japan’s plane rectangular system shows “X (northing)” and “Y (easting)”, and UTM or Gauss-Krüger shows “X (easting)” and “Y (northing)”.'
  - q: 'Why does JGD2000 to JGD2011 report that no transformation parameters are available?'
    a: 'JGD2000 and JGD2011 are different geodetic datums. The 2011 Tōhoku earthquake moved eastern Japan by metres, and an official conversion needs the Geospatial Information Authority of Japan’s semi-dynamic correction or its official transformation tools. This site does not ship that data, so it refuses to treat the two datums as identical. You can enter custom 7-parameter values under advanced options, or explicitly continue without a datum transformation.'
  - q: 'How do I choose a Gauss-Krüger band?'
    a: 'The 3° bands run from 75°E to 135°E with central meridians at 75, 78, 81 and so on; the 6° bands use 75, 81, 87 and so on. A common rule is zone = round(longitude / 3) for 3° bands and zone = floor(longitude / 6) + 1 for 6° bands. The “central meridian from longitude” option does this automatically when you convert from longitude and latitude, and the result states which meridian was used.'
  - q: 'Can I use the result for legal surveying or a permit application?'
    a: 'No. Datum transformations here use simplified 7-parameter (Bursa-Wolf) models with an accuracy of roughly 1–5 m, and no epoch correction (Japan’s semi-dynamic correction or plate motion) or grid interpolation is applied. The output is suitable for data checks, development, teaching and rough measurement, but it is not a legal survey reference. Use official software and approved parameters for precision work.'
---

## What this tool does

You have a coordinate and are not sure which system it belongs to, or you have WGS 84 longitude and latitude and need them on a project grid. A projected CRS converter bridges two kinds of coordinates:

- **Geographic coordinates**: longitude and latitude, in degrees.
- **Projected coordinates**: X and Y on a flat grid, usually in metres.

The conversion is not a single multiplication. It runs from the source projection to geodetic coordinates, through the Earth-centred frame, into the target datum and finally the target projection. The tool hides that chain behind two selectors and two input fields.

## Common coordinate systems

**WGS 84 (EPSG:4326)** is the latitude/longitude basis used by GPS and most web maps. **Web Mercator (EPSG:3857)** is the projection behind web map tiles; it uses metres but stretches distances noticeably at high latitudes. **UTM** divides the world into 60 six-degree zones, each using a transverse Mercator projection, which makes it convenient for regional measurement.

**China’s Gauss-Krüger** grids come in 3° and 6° bands. The 3° bands run from 75°E to 135°E in 21 bands; the 6° bands cover the same span in 11 bands. The tool includes the CGCS2000, Xian 1980 and Beijing 1954 datums, with full 3° and 6° entries for CGCS2000.

**Japan’s plane rectangular system** has 19 zones (I to XIX), each with its own origin latitude and central meridian. It is not UTM, and it has no zone prefix; negative coordinates near the origin are normal. JGD2011, JGD2000 and the older Tokyo datum are all supported.

For coverage, use cases and illustrations of each projection family, see [map projections at a glance](/en/guide/projection-types/).

## Axis order: where most mistakes happen

Japan’s plane rectangular system officially uses **X for northing and Y for easting**, the reverse of the GIS convention. The tool relabels the input fields for the selected CRS and shows a persistent note when a Japanese plane rectangular zone is active. Reading the label before typing is cheaper than debugging a point hundreds of kilometres away afterwards.

If you enter longitude/latitude-sized values into a UTM or Gauss-Krüger CRS, or swap X and Y, the tool warns you but never changes your input silently. The swap button does exactly one thing: it exchanges the two fields.

## Datum transformations and accuracy

The same projection formula applied to different geodetic datums can differ by hundreds of metres on the ground. The tool handles this as follows:

- **Same datum**: direct conversion, no extra error.
- **Public 7 parameters available**: a simplified Bursa-Wolf model is used. Tokyo, Beijing 1954, OSGB36 and NAD27 fall into this group, with an accuracy of about 1–5 m.
- **No usable parameters**: for example JGD2000 ↔ JGD2011, or Xian 1980 against other datums. Results stay hidden until you explicitly continue without a datum transformation, or supply custom 7-parameter values.

In every case the tool applies no epoch correction and loads no grid files such as NTv2 or TKY2JGD. That is a deliberate scope decision: grids are large, licensing is complex, and this project is built for verification and teaching rather than legal surveying.

## A practical check

Validate with a known point first. For example, Tokyo Station’s longitude and latitude converted to JGD2011 zone IX should give roughly −35,000 m northing and −6,000 m easting. Then paste your own data. If the result is off by a whole zone, check the central meridian first; if it is off by a fixed few hundred metres, check the datum; if the X and Y magnitudes are exchanged, check the axis order.

## US State Plane and the British National Grid

State Plane codes are not in the shortlist, so picking one triggers the full EPSG table (about seven thousand definitions, loaded on demand). Many zones are defined in US survey feet: EPSG:2225 is California zone 1 in feet, and a northing of 2,000,000 there is roughly 609,600 m. The tool keeps the unit declared by the EPSG definition and shows it with the result, so read the unit before pasting values from a plat or a surveyor’s report. NAD83 State Plane is tied to NAD83, and NAD83 differs from WGS 84 by a metre or two; the tool treats them as aligned and applies no transformation — fine for display, not for a boundary survey. Metric State Plane entries exist as well, so the same place may have several plausible codes; use the code printed on the source data rather than the first search result that looks local.

For Great Britain, EPSG:27700 is the British National Grid, in metres, on OSGB36. The 7-parameter shift used here brings it to WGS 84 within a few metres, while the OSGB36 offset itself is around 100 m, so a file mistaken for WGS 84 is visibly displaced. Northern Ireland is not covered by EPSG:27700; it uses the Irish Grid (EPSG:29903) on the TM75 datum.

## References

- [EPSG Registry: authoritative coordinate system codes](https://epsg.org/)
- [PROJ: projection and datum transformation documentation](https://proj.org/)
