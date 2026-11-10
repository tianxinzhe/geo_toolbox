---
title: 'About | GeoToolbox'
description: 'What GeoToolbox is, who it is for and how it is maintained. Ten geospatial utilities, all computed locally in your browser, no sign-up, no upload, deployed on Cloudflare Pages.'
updated: 2026-11-07
---

## What this site is

GeoToolbox is a collection of **online geospatial utilities**. The first batch of nine tools covers four recurring needs:

- **Coordinates and conversion** — WGS84 and CGCS2000 conversion, degrees-minutes-seconds to decimal degrees, and projected coordinate conversion by EPSG code
- **Data formats** — GeoJSON / KML / KMZ / GPX / TopoJSON conversion, and WKT to GeoJSON and back
- **Spatial encoding** — compress coordinates into short GeoHash strings for indexing and sharing
- **Map and visualisation** — draw points, lines and polygons online and export them, generate radius circles and buffers, preview local vector data on a map, and export XYZ tile coordinates

Each tool is its own page with accompanying documentation explaining what problem it solves, how to read the output, and where the precision limits lie.

## Why it is built this way

Three specific, recurring situations led to this site.

**The first is a coordinate mix-up.** Feeding projected X/Y values with seven digits straight into a basemap as if they were longitude and latitude puts every point in the wrong place — sometimes in the sea. During integration testing this is hard to spot: the points are still on the map, just not in the right place. By the time you realise it is a datum or projection issue, you have usually lost half a day.

**The second is the lack of trustworthy format converters.** You have a KML file that needs to become GeoJSON, or a spreadsheet of latitude/longitude columns that needs to become vector data. The online tools that turn up in search mostly require registration, require uploading your file to their server, or have dated interfaces and unverifiable output.

**The third is data sensitivity.** Parcel boundaries, store locations and movement tracks are often commercially sensitive. Pasting them into an unknown third-party website takes a considerable amount of trust, and that trust is hard to earn.

So the three core decisions are:

| Decision | Reasoning |
|---|---|
| **Purely static, no backend** | The site has no architectural capability to receive user data. "Nothing leaves your browser" is not a promise, it is something you can verify yourself |
| **One page per tool, with documentation** | Search engines send you straight to the tool you need, rather than dropping you on a landing page where you then hunt through menus |
| **No keyed commercial map or geocoding services** | API keys cannot be kept secret in a backend-less environment; once exposed they are abused. Routing, isochrones and commercial-grade geocoding are therefore out of scope for the first release |

## How it is built

The site is compiled to static pages with [Astro](https://astro.build/) and deployed on Cloudflare Pages. Interactive parts use Vue 3 islands — only components that genuinely need interactivity ship JavaScript, everything else is plain HTML and CSS.

Computation dependencies are split per tool page. Maps use Leaflet (about 42 KB gzipped, loaded only on the eight tool pages that need one, and then lazily). The projection engine is proj4 with projections registered on demand. Vincenty geodesy comes from the geodesy library. GeoHash encoding and the WKT parser are written in-house, because those areas need full control over implementation detail.

The visual design is deliberately restrained: white background, a single accent colour, 1px borders as the only separator, tabular numerals for all values, no shadows, no decoration. This is not an aesthetic preference but the intersection of four goals — Core Web Vitals require zero blocking resources, clear boundaries between content and advertising require no shadows, crawler friendliness requires semantic HTML, and a calm page is itself a product requirement.

## How content is maintained

The calculation logic is covered by unit tests. The coordinate conversion tests use precomputed reference values as golden cases, so any change is compared against known-correct output. Documentation describing algorithms and reference numbers is updated alongside the implementation.

If a tool produces a result that disagrees with a value you know to be correct, or if the documentation contains a factual error, please tell us via the [contact page](/en/contact/). **A wrong number is the most serious class of bug on this site** and is handled first.

## What this site is not for

Stating the boundaries matters as much as stating the capabilities:

- **Legally binding survey output** — cadastral work, land registration and construction setting-out require certified tooling and a qualified workflow. Nothing here constitutes a legal-grade result. See the [disclaimer](/en/disclaimer/)
- **Large-scale server-side batch processing** — there is no backend, so processing volume is bounded by your device's memory. Tens of thousands of CSV rows work fine in a browser; tens of millions do not
- **Routing, isochrones, geocoding** — these depend on keyed commercial services and conflict with the no-backend constraint. Out of scope for the first release
- **Collaboration and version control** — with no accounts there is no multi-user work. Sharing happens through URL parameters only

## Languages

Simplified Chinese and English are available now. A Japanese version — including support for Japan's statutory JGD2011 plane-rectangular coordinate system across its 19 zones — is planned as the second release.
