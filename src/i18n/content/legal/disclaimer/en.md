---
title: 'Disclaimer | GeoToolbox'
description: 'GeoToolbox disclaimer: accuracy and fitness-for-purpose of results, why nothing here is a legally valid survey output, and attribution of third-party basemap, EPSG and algorithm sources.'
updated: 2026-11-07
---

Effective date: 7 November 2026

## Core statement

**Every result produced by this site is for reference only and does not constitute a basis for surveying, land administration, engineering, legal or any other statutory purpose.**

If you need output for cadastral surveying, land registration, construction setting-out, boundary determination, notarial documents, insurance assessment or any context carrying legal responsibility, **use certified professional tooling and a qualified workflow, and have the result issued by a licensed practitioner.** This site issues no certification, verification report or accuracy statement of any kind.

## Accuracy

The precision of each tool is bounded by the algorithm itself, the quality of the input data, and the implementation. The table below sets out the main limits so you can judge whether a result fits your use case.

| Tool | Accuracy | Main limiting factor |
|---|---|---|
| Coordinate conversion (T01) | WGS84 and CGCS2000 treated as equivalent | Ellipsoid parameters differ below a centimetre; not valid for millimetre-level surveying |
| DMS conversion (T02) | Exact, limited only by input digits | The significant figures present in your input |
| Projected CRS conversion (T03) | Depends on the datum-shift parameters used | Regional applicability of 7-parameter / 4-parameter shifts; epoch differences such as JGD2000 vs JGD2011 amount to centimetres or decimetres |

Anything marked "about", "approximate" or "reference" is labelled as such in the interface and never presented as exact. **Display precision is configurable; computation precision is not.** Changing the decimal places from 6 to 10 does not make a result more accurate.

## Notes specific to coordinate systems

**CGCS2000 treated as equivalent to WGS84.** Within practical precision this site treats CGCS2000 as equivalent to WGS84 and labels that assumption in the UI. The two ellipsoids do differ. If your work is sensitive to that difference (accuracy requirements at the centimetre level or better), apply a full datum transformation yourself.

**X/Y axis order in Japan's plane-rectangular system.** In Japan's plane-rectangular coordinate system X points north and Y points east, the opposite of the common mathematical convention. This site labels the axis meaning of every field explicitly, but **you still need to confirm axis order when reading results** — getting it wrong shifts the answer by hundreds of kilometres and produces no error message.

**Zone number and central meridian derivation.** For projections requiring a zone number (Gauss-Krüger, UTM), this site derives the zone from longitude and displays the derivation. The derivation follows standard zoning rules. If your data comes from a specific project that used non-standard zoning, the project's rules take precedence.

## Data sources and attribution

### Basemap tiles

Map features use tiles from public tile sources. Copyright is as follows:

- OpenStreetMap data © OpenStreetMap contributors, licensed under [ODbL](https://opendatacommons.org/licenses/odbl/)
- Copyright in tile rendering styles belongs to the respective rendering providers

Basemaps are for positional reference and result visualisation only. **Screenshots of maps from this site must not** be used for commercial publication, in map products, or in any context requiring an official map approval number. Map tiles do not constitute a survey product.

### EPSG parameters

Coordinate system parameters come from the EPSG dataset. Copyright in the EPSG dataset belongs to the IOGP (International Association of Oil & Gas Producers) and is used here under its licence terms. The comparison between this site's built-in Japanese plane-rectangular zone parameters and the official EPSG registry is recorded in the source code comments.

### Algorithms

The Vincenty geodesy implementation follows the 1975 paper by Thaddeus Vincenty. The GeoHash algorithm is in the public domain.

### Site content

Copyright in the documentation, interface text and in-house code belongs to the site maintainer. Documentation may be republished with attribution and a link back to the original page; see the [contact page](/en/contact/).

## Use at your own risk

By using the tools on this site you acknowledge and agree that:

1. You are responsible for judging the correctness, accuracy and fitness for purpose of any result
2. This site accepts no liability for direct or indirect loss arising from use of its results
3. You are responsible for confirming the sensitivity and compliance status of the data you process. This site does not collect data and makes no judgement about its nature
4. This is a static site whose availability depends on Cloudflare Pages and on basemap tile providers. No continuity of service is guaranteed

## Changes

When this disclaimer changes, the effective date at the top of the page will be updated.

| Date | Change |
|---|---|
| 2026-11-07 | Initial publication |
