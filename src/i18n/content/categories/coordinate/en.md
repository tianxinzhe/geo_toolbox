---
title: 'Coordinate & Conversion Tools — notations, datums and projected systems | GeoToolbox'
description: 'Three coordinate tools: WGS84 and CGCS2000 conversion, DMS to decimal degrees, and projected CRS conversion by EPSG code. How to choose between them.'
updated: 2026-11-09
---

## What this category covers

The word "coordinate" covers at least four genuinely different things in practice, and confusing them is the single most common source of error:

| Type | Example | Character |
|---|---|---|
| **Notation** | `116.3974` vs `116°23'50.64"E` | The same point written differently. Conversion is **exact**, no error |
| **Datum** | WGS84 vs CGCS2000 | The same physical position given **slightly different numbers**, centimetres apart, interchangeable in practice |
| **Projection** | Lat/lon vs UTM 50N | Mapping a sphere onto a plane; length and area distortion is unavoidable |

These three need three different treatments. The tools in this category cover notation, projection and datum.

## Choosing between the three tools

**T01 Coordinate System Converter** — handles WGS84 and CGCS2000. Both are formal, publicly defined geodetic datums whose ellipsoid parameters differ by less than a centimetre, so they are equivalent at practical precision and the tool states that explicitly. Use it to confirm which datum a dataset uses, to carry values straight across WGS84 and CGCS2000, or to validate coordinate ranges before a stricter transformation.

**T02 DMS ↔ Decimal Degrees** — converts between degrees-minutes-seconds, degrees-minutes and decimal degrees. This is purely notational and lossless. It comes up when reading paper maps, legacy spreadsheets or NMEA sentences from certain devices.

**T03 Projected CRS Converter (EPSG)** — converts between any two coordinate reference systems, including national statutory systems. Enter EPSG codes; you do not need to understand the projection parameters. Japan's 19 plane-rectangular zones and China's 3°/6° Gauss-Krüger zones are both covered. **Watch the axis order**: in Japan's plane-rectangular system X points north and Y points east, the reverse of the usual mathematical convention. Getting it wrong shifts the answer by hundreds of kilometres and raises no error.

## Where T01 and T03 differ

A common confusion: both appear to convert coordinate systems. Their scope is different.

- **T01 only handles datum equivalence.** WGS84 and CGCS2000 use nearly identical ellipsoids, so the tool validates ranges and labels the two as equivalent — no projection formulae
- **T03 is a general engine.** proj4 plus the EPSG parameter table, transforming source → WGS84 → target in two legs, including projected zones and national statutory systems

So: **if you need plane coordinates such as Gauss-Krüger or UTM, use T03. If you only need the correspondence between WGS84 and CGCS2000, use T01.**

The practical test is simple: **if your values are seven-digit X/Y numbers like `4412345.67`, use T03. If they are lat/lon, use T01 to check the datum and values.**

## Precision and statutory use

The precision ceiling of a conversion is set by the algorithm and its parameters, not by how many decimal places you display. Changing the output from 6 to 10 decimal places does not make the result more accurate — it only makes it look more accurate.

Nothing on this site constitutes a basis for surveying, land administration or engineering work. Cadastral surveying, boundary determination and construction setting-out require certified tooling and a qualified workflow. See the [disclaimer](/en/disclaimer/).

## Tools in this category
