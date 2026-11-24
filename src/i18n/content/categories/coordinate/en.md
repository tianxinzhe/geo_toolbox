---
title: 'Coordinate Conversion: datums and projections | GeoToolbox'
description: 'Two coordinate tools: DMS to decimal degrees, and projected CRS conversion by EPSG code. How to choose between them.'
updated: 2026-11-23
---

## What this category covers

"Coordinate" covers at least three different things in practice, and mixing them up is the most common source of error:

| Type | Example | Character |
|---|---|---|
| **Notation** | `116.3974` vs `116°23'50.64"E` | The same point written differently. Conversion is **exact**, no error |
| **Datum** | WGS84 vs CGCS2000 | The same physical position given **slightly different numbers**, centimetres apart, interchangeable in practice |
| **Projection** | Lat/lon vs UTM 50N | Mapping a sphere onto a plane; length and area distortion is unavoidable |

Each one needs different treatment. The two tools here cover notation and projection. In practice the datum difference between WGS84 and CGCS2000 is below a centimetre, so values carry straight across; reach for the projected converter when you want a strict check.

## Choosing between the two tools

**DMS ↔ Decimal Degrees** — converts between degrees-minutes-seconds, degrees-minutes and decimal degrees. Notational only, and lossless. It comes up when reading paper maps, legacy spreadsheets or NMEA sentences from certain devices.

**Projected CRS Converter (EPSG)** — converts between any two coordinate reference systems, including national statutory systems. You enter EPSG codes and do not need to understand the projection parameters. China's 3°/6° Gauss-Krüger bands, UTM and Web Mercator are all covered. **Watch the axis order and units**: projected coordinates are X = easting, Y = northing, in metres; geographic coordinates are longitude and latitude in degrees. Swap them and the answer moves hundreds of kilometres, with no error raised.

## Where the two tools differ

Both tools look like they process coordinates. They work at different levels.

- **The notation converter only rewrites the format.** Decimal degrees and DMS are two spellings of the same point, so the result is exact; no CRS or projection formula is involved
- **The projected CRS converter is a general engine.** proj4 plus the EPSG parameter table, transforming source → WGS84 → target in two legs, projected zones and national statutory systems included

So: **if you need plane coordinates such as Gauss-Krüger or UTM, use the projected CRS converter.**

The quick test: **seven-digit X/Y values like `4412345.67` belong in the projected CRS converter. Lat/lon that differ only in notation (`116.3974` vs `116°23'50.64"E`) belong in the notation converter.**

## Precision and statutory use

A conversion's precision ceiling comes from the algorithm and its parameters, not from how many decimal places you display. Going from 6 to 10 decimal places does not make the result more accurate. It only makes it look that way.

Nothing on this site constitutes a basis for surveying, land administration or engineering work. Cadastral surveying, boundary determination and construction setting-out require certified tooling and a qualified workflow. See the [disclaimer](/en/disclaimer/).

## Tools in this category
