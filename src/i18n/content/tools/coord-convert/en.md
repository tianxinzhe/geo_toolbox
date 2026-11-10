---
title: 'WGS84 to CGCS2000 Converter — Equivalent Datums Online | GeoToolbox'
description: 'Check WGS84 and CGCS2000 coordinates free online. The two datums differ by less than a centimetre in practice. Everything runs locally in your browser; no coordinate is uploaded.'
updated: 2026-11-09
faq:
  - q: 'Can WGS84 and CGCS2000 be used interchangeably?'
    a: 'Yes. They use nearly identical ellipsoid parameters and share the same origin, orientation and scale, so at practical precision (below a centimetre) they can be treated as the same system. This tool treats them as equivalent and returns the input values without any artificial offset.'
  - q: 'Why are the coordinates identical before and after conversion?'
    a: 'That is not a skipped conversion — the two systems are simply that close. Representing the same point in WGS84 and CGCS2000 differs by centimetres, far below typical coordinate entry and GPS positioning errors. The result panel says “treated as equivalent” so you can see the step was applied rather than ignored.'
  - q: 'Does CGCS2000 require any offset treatment?'
    a: 'No. CGCS2000 is a formal national geodetic datum with an open, stable ellipsoid definition. There is no confidential offset between it and WGS84. This tool applies no artificial shift; the output is always the true geographic position.'
  - q: 'When is a strict datum transformation required?'
    a: 'When results must be accurate to the millimetre, for example precision engineering surveys, cadastral work or large control networks. Those jobs need dedicated surveying software with full seven-parameter or grid corrections and a qualified operator. Results here are not a statutory survey product.'
---

## What the two systems are

**WGS84** is the World Geodetic System used by GPS. Chipsets, phone positioning, international datasets and most online basemaps all report longitude and latitude in it. Its ellipsoid parameters are public and stable, and it is the common reference for positioning worldwide.

**CGCS2000** is China's national geodetic coordinate system, adopted in 2000. It is also geocentric: its origin is at the Earth's centre of mass and its Z axis points to the conventional pole, so its definition is very close to WGS84. Chinese surveying results, fundamental geographic data and official maps are increasingly unified on this system.

| System | Typical use | Relationship |
|---|---|---|
| **WGS84** | GPS devices, international data, general basemaps | Reference |
| **CGCS2000** | Chinese survey results, national geographic data | Ellipsoid differs below a centimetre |

## How large the difference is

The semi-major axis and flattening of the two ellipsoids differ only marginally, which puts point differences at **centimetre level**. In practice that means:

- For map display, point marking and route planning, the two are fully interchangeable.
- Even on a 1:10,000 map the difference is usually smaller than the map's own accuracy.
- A strict transformation is only needed for millimetre-level results over large areas.

This tool therefore treats them as equivalent and shows a permanent note in the result panel. **That is not an omitted step — it is an explicit statement of the magnitude**, so you do not mistake the unchanged values for a calculation that failed.

## Why no artificial offset is applied

Tools built for Chinese web maps often had to handle encrypted coordinate systems, where conversion introduces a systematic shift of several hundred metres and needs dedicated algorithms. Nothing of the kind applies between CGCS2000 and WGS84:

1. Both are publicly defined formal geodetic datums.
2. The difference comes from slightly different ellipsoid parameters, not from a confidentiality treatment.
3. The conversion is deterministic — no iteration, and no lossy round trip.

The output therefore always equals the input, with the equivalence stated in the interface. If your goal is simply to place standard longitude and latitude on a basemap, that is all you need.

## When to use it

**Confirming which datum a dataset uses.** Check the source. GPS devices and international projects are usually WGS84; survey products from Chinese agencies are usually CGCS2000. Because the two agree to centimetres you can mix them freely, but state the datum in your report.

**Handing data to another system.** Some Chinese platforms ask for CGCS2000 while your source is WGS84. No numerical transformation is required — keep the original values and record the equivalence in the metadata.

**Deciding whether a stricter transformation is needed.** For high-precision control networks, long linear engineering or statutory survey products, do not rely on the equivalence assumption. Commission a qualified organisation and use the full transformation parameters.

## Accuracy and applicability

The tool does exactly two things: it validates that longitude and latitude are within legal ranges, and it echoes the equivalent result. It never alters your numbers and introduces no rounding decision.

Be clear that equivalence only holds at practical precision. At millimetre level the difference between WGS84 and CGCS2000, though small, must be handled according to the project specification. The note in the interface exists to flag this, not to claim the two are mathematically identical.

## Related concepts

- **Geodetic datum**: the parameters describing the Earth's shape, size and placement. WGS84 and CGCS2000 are both geocentric datums.
- **Ellipsoid parameters**: semi-major axis and flattening. Their near-identical values are why the difference is only centimetres.
- **Equivalence assumption**: treating two systems as identical at a stated precision — a declared approximation, not a silent omission.

All calculations run locally in your browser. Your coordinates never leave your device.