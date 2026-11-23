---
title: 'Coordinate Conversion Tools — datums and projections | GeoToolbox'
description: 'Two coordinate tools: DMS to decimal degrees, and projected CRS conversion by EPSG code. How to choose between them.'
updated: 2026-11-23
---

## What this category covers

The word "coordinate" covers at least three genuinely different things in practice, and confusing them is the single most common source of error:

| Type | Example | Character |
|---|---|---|
| **Notation** | `116.3974` vs `116°23'50.64"E` | The same point written differently. Conversion is **exact**, no error |
| **Datum** | WGS84 vs CGCS2000 | The same physical position given **slightly different numbers**, centimetres apart, interchangeable in practice |
| **Projection** | Lat/lon vs UTM 50N | Mapping a sphere onto a plane; length and area distortion is unavoidable |

These need different treatments. The two tools here cover notation and projection. The datum difference between WGS84 and CGCS2000 is below a centimetre in practice, so values carry straight across; use the projected converter when you need a strict check.

## Choosing between the two tools

**DMS ↔ Decimal Degrees** — converts between degrees-minutes-seconds, degrees-minutes and decimal degrees. This is purely notational and lossless. It comes up when reading paper maps, legacy spreadsheets or NMEA sentences from certain devices.

**Projected CRS Converter (EPSG)** — converts between any two coordinate reference systems, including national statutory systems. Enter EPSG codes; you do not need to understand the projection parameters. Japan's 19 plane-rectangular zones and China's 3°/6° Gauss-Krüger zones are both covered. **Watch the axis order**: in Japan's plane-rectangular system X points north and Y points east, the reverse of the usual mathematical convention. Getting it wrong shifts the answer by hundreds of kilometres and raises no error.

## Where the two tools differ

A common confusion: both appear to process coordinates. Their scope is different.

- **The notation converter only rewrites the format.** Decimal degrees and DMS are two spellings of the same point; the result is exact and no CRS or projection formula is involved
- **The projected CRS converter is a general engine.** proj4 plus the EPSG parameter table, transforming source → WGS84 → target in two legs, including projected zones and national statutory systems

So: **if you need plane coordinates such as Gauss-Krüger or UTM, use the projected CRS converter.**

The practical test is simple: **if your values are seven-digit X/Y numbers like `4412345.67`, use the projected CRS converter. If they are lat/lon that differ only in notation (`116.3974` vs `116°23'50.64"E`), use the notation converter.**

## Precision and statutory use

The precision ceiling of a conversion is set by the algorithm and its parameters, not by how many decimal places you display. Changing the output from 6 to 10 decimal places does not make the result more accurate — it only makes it look more accurate.

Nothing on this site constitutes a basis for surveying, land administration or engineering work. Cadastral surveying, boundary determination and construction setting-out require certified tooling and a qualified workflow. See the [disclaimer](/en/disclaimer/).

## Tools in this category
