---
title: 'Plus Codes Converter - Open Location Code | GeoToolbox'
description: 'Encode latitude and longitude as a Plus Code (Open Location Code), or decode a full code back to coordinates. Supports 10 and 11 digits, with precision notes. Runs entirely in your browser.'
updated: 2026-11-16
faq:
  - q: 'Why does the same place give me a different Plus Code from someone else?'
    a: 'Check the length first. A 10-digit and an 11-digit code describe the same area at different precision; the 11-digit code refines the 10-digit cell, so they share a prefix and differ at the end. Then check the coordinate itself: a town centre and a front door fall into different cells. For the same coordinate and the same length, the encoder is deterministic.'
  - q: 'Why is the decoded coordinate not the one I entered?'
    a: 'A Plus Code describes a rectangular area, not an infinitely precise point. Decoding returns the centre of that area, while the original coordinate can be anywhere inside it. A 10-digit cell is about 14 m across, so the centre can differ by up to roughly 7 m; an 11-digit cell is about 3 m across, keeping the difference under about 1.5 m. Keep the original latitude and longitude when you need an exact point.'
  - q: 'Why can I not enter a short code such as 9G8F+6X?'
    a: 'A short code omits the first four characters and only makes sense with a reference locality. “9G8F+6X Beijing” and “9G8F+6X Shanghai” can point to completely different places. This site has no geocoding or place-name service, so it does not guess the reference and accepts only full codes with all eight leading characters.'
  - q: 'How do Plus Codes compare with GeoHash?'
    a: 'Both turn coordinates into strings, but for different audiences. GeoHash uses a 32-character alphabet and no separator; its prefixes map cleanly to rectangles, which suits database filtering and indexing. Plus Codes use 20 characters chosen to avoid easily confused glyphs plus a “+” separator, which makes them easier to read aloud, copy by hand and print on a sign. Plus Codes can also drop the first four characters when the town is known, whereas GeoHash shortening relies on prefix queries.'
  - q: 'Do Plus Codes need an internet connection or a Google account?'
    a: 'No. Open Location Code is a public specification and the reference implementation is released under Apache-2.0. Encoding and decoding are pure algorithms. This tool computes everything in your browser, sends no coordinates to a server and keeps working offline.'
---

## What Plus Codes are

Plus Codes is the common name for Open Location Code (OLC), published by Google in 2014. It turns latitude and longitude into a short string that names a rectangular area on Earth. Unlike a street address, it does not depend on road names, postal codes or administrative boundaries, which makes it useful in places without formal addresses, at temporary locations and across languages.

A full code looks like this: `8FVC9G8F+6X`. It contains eight characters, a `+` separator and two more characters. The alphabet has only 20 characters: `23456789CFGHJMPQRVWX`. The digits 0 and 1 and the letters I, L, O and U are deliberately excluded because they are the easiest to confuse in handwriting, small print and speech. The remaining characters are more forgiving when one is misread.

OLC is an open specification, not a black box that requires a Google API. This tool implements the published algorithm and runs entirely in your browser, offline, without uploading coordinates.

## How the code is structured

Characters are grouped in pairs. Each pair narrows both latitude and longitude: the first pair divides the planet into 20° × 20° blocks, the second refines to 1°, then 0.05°, then 0.0025°, then 0.000125°. The `+` always sits after the eighth character, splitting the code into a region part and a local part.

Because the first eight characters describe a larger region, Plus Codes can drop the leading four characters when the town is known: `8FVC9G8F+6X` near Zurich can be written as `9G8F+6X`. The shortened form is only valid with a shared reference; without it, the same string could describe different places. That is why this tool accepts full codes only.

## Precision at 10 and 11 digits

| Length | Latitude span | Longitude span (equator) | Approximate size |
|---|---|---|---|
| 10 digits | 0.000125° | 0.000125° | about 13.9 m × 13.9 m |
| 11 digits | 0.000025° | 0.00003125° | about 2.8 m × 3.5 m |

The east–west size shrinks as latitude rises: multiply the longitude span by the cosine of the latitude. Near 40° north, a 10-digit cell is about 10.6 m wide and an 11-digit cell about 2.7 m wide.

**More characters do not make a coordinate exact.** A code always describes an area, and decoding can only return the centre. For a 10-digit code the centre can differ from any point inside by up to about 7 m, and for 11 digits by up to about 1.7 m. Keep the original latitude and longitude when you need an exact position; do not treat the decoded centre as a surveyed coordinate.

## Choosing between Plus Codes and GeoHash

Both solve the same broad problem, with different emphases:

- **GeoHash** uses 32 characters and no separator. Prefixes correspond cleanly to rectangles, which makes it a good fit for database filtering and indexing.
- **Plus Codes** use 20 characters with a `+` separator. The alphabet avoids easily confused glyphs, so the code is easier to read aloud, copy by hand and put on a sign.

If the goal is machine indexing and bulk queries, GeoHash is usually more convenient. If the goal is telling a person where to go, Plus Codes tend to be easier to read. Neither replaces precise coordinates, and neither is a projected coordinate system.

## Where they help

- Places without street addresses: camps, field equipment, temporary stalls, rescue meeting points
- Cross-language communication: send a string instead of translating street names
- Paper and outdoor use: short, tolerant of misreading, easy to dictate or copy
- Offline work: local computation with no network or account requirement

## Using this tool

Enter longitude first, then latitude, for example `116.3974, 39.9088`. Degrees-minutes-seconds notation is also accepted and detected automatically. Copy the resulting code directly. When decoding, paste the full code including the `+` and the two or three characters after it. If a result looks unexpected, check whether you entered a 10-digit or 11-digit code and whether the coordinate sits close to a cell boundary.

## References

- [Google Open Location Code reference implementation](https://github.com/google/open-location-code)
- [Official Plus Codes site and encoding rules](https://plus.codes/)
