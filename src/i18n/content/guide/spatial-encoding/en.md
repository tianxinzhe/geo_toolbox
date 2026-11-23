---
title: "Spatial encoding explained: GeoHash vs Plus Codes | GeoToolbox"
description: "GeoHash prefix grids and precision levels, Plus Codes character structure and short codes, how they differ for indexing, sharing, dictation and privacy, and when to use each."
heading: "Spatial encoding explained: GeoHash vs Plus Codes"
group: projection
order: 3
readingMinutes: 8
updated: 2026-11-23
---

Coordinates are two floating-point numbers, which is more than a URL, a log line or a cache key usually wants. Compressing a location into a short string shortens parameters, makes logs searchable, keeps cache keys stable and lets a share deliberately lose precision. GeoHash and Plus Codes are the two common families: GeoHash comes from spatial indexing, Plus Codes from human-readable addressing.

Both are computed offline, need no database and make no network calls. Navigation, delivery, log analysis and emergency dispatch all use them: some treat the code as an index key, others print it on a doorplate or a rescue card. The choice depends on whether the job needs prefix search, spoken sharing or privacy levels.

## Minimal example

Take Tiananmen at 39.9088, 116.3974. A seven-character GeoHash is `wx4g09n`; five characters give `wx4g0`, a much larger cell. Plus Codes produce `8PFRW95W+GX`, ten digits plus a separator, a cell roughly ten to fifteen metres across.

```text
lat 39.9088, lng 116.3974
GeoHash, 7 chars: wx4g09n
GeoHash, 5 chars: wx4g0
Plus Code:        8PFRW95W+GX
```

GeoHash has no separator, and the caller chooses the length, commonly five to nine characters. A full Plus Code is always eight characters, a plus sign and two more characters, optionally with an eleventh digit, for example `8FVC9G8F+6W`.

## Structure and fields

### GeoHash

GeoHash uses 32 characters: `0123456789bcdefghjkmnpqrstuvwxyz`. Letters are lowercase, and `a`, `i`, `l` and `o` are removed to avoid confusion with digits.

Encoding bisects longitude and latitude in turn: first the longitude half is chosen, then the latitude half, alternating, with every five bits mapped through the alphabet to one character. More characters mean a smaller cell. Because each level subdivides the previous one, a short prefix is always the prefix of a longer code, which is what makes string range queries possible.

| Characters | Cell size, roughly | Typical use |
|---|---|---|
| 1 | 5000 km | Continent-level sharding |
| 3 | 156 km | Province or region grouping |
| 4 | 39 km by 20 km | City-level cache keys |
| 5 | 4.9 km | District, delivery zone |
| 6 | 1.2 km by 0.6 km | Neighbourhood, nearby search |
| 7 | 153 m | Building, intersection |
| 8 | 38 m by 19 m | Store, station |
| 9 | 4.8 m | Street address level |

Each extra character divides area by about 32 and side length by about 5.7. For a nearby search, the usual pattern is to take the seven-character code of the target, compute the eight neighbours, and query the nine cells together. Querying only the centre cell misses points just across a boundary.

GeoHash cells follow the latitude/longitude grid, not administrative or street boundaries. Two points tens of metres apart can have completely different seven-character codes if they straddle a cell edge, sharing only a shorter prefix. That is why the neighbour step is not optional.

Privacy often relies on truncating the suffix: five characters cover about 4.9 km, six about 1.2 km. The result is still a rectangle, not a circle, and truncation is not anonymity. In dense areas, a coarse location combined with time and device data can still identify a person, so sensitive data needs stronger measures.

### Plus Codes

Plus Codes, also called Open Location Code, use 20 characters: `23456789CFGHJMPQRVWX`. Letters are uppercase, and vowels plus `0`, `1`, `I`, `L`, `O` and `U` are removed to reduce misreading and accidental words.

Characters are organised in pairs, each pair encoding latitude and longitude. The first five pairs form the ten-digit full code, with resolutions of 20°, 1°, 0.05°, 0.0025° and 0.000125°. The first four characters define a 1° by 1° area code, roughly 100 km across; a ten-digit cell is about 14 m in latitude and narrower in longitude away from the equator. An eleventh character splits the cell into a 4 by 5 grid, reaching about 3 m.

A full code is globally unique and needs no reference. A short code drops the first four characters and must be paired with a nearby place to recover them. Tiananmen's full code is `8PFRW95W+GX`; within Beijing it can be written `W95W+GX`. The same short code used in another city may recover into the wrong one-degree cell.

A short code removes leading characters, not a suffix. It has no prefix-containment relationship like GeoHash and cannot be used directly for string range queries. Plus Codes are designed for speaking and writing: few characters, a plus sign as a visual anchor, printable on a doorplate. That makes them useful where formal street addresses are missing or unreliable. The code depends only on the coordinate and can be computed offline, with no address database or geocoding service.

### S2 and H3

S2 and H3 are two other spatial index families. S2 projects the sphere onto a cube and subdivides it, with 64-bit cell IDs ordered along a Hilbert curve. H3 uses a hexagonal grid on an icosahedron, with integer IDs and a resolution parameter.

Both are not meant to be read aloud. They need a library to compute cells, boundaries and neighbours, and they excel at hierarchical indexing, database sharding and aggregation. When the output has to be dictated or printed, GeoHash and Plus Codes fit better.

## Common mistakes and pitfalls

**Treating a GeoHash prefix as an exact radius.** Queries miss objects just across a boundary, or the code is assumed to describe a 150 m circle. The cause is that a prefix is a rectangle, neighbouring points outside it carry different codes, and cells narrow with latitude. The consequence is missed results in nearby search, worse as distance grows. Query the nine-cell neighbourhood and filter by real distance.

**Using truncation as anonymisation.** A published six-character code still pinpoints a neighbourhood. The cause is that six characters cover about 1.2 km, and time, device identifiers and business records narrow it further. The consequence is a privacy leak that cannot be recalled. Choose precision by scenario, add random offset when needed, or omit precise timestamps.

**Using a short Plus Code without its reference.** `W95W+GX` may decode to a completely wrong place in another city. The cause is that a short code omits the leading area code and needs a sufficiently close reference point. The consequence is an error of tens or hundreds of kilometres, with no failure signal. Share the city name alongside the short code, or use the full ten-digit code.

**Treating a Plus Code as a postal address.** Delivery forms and courier systems reject it and still ask for a street and number. The cause is that Plus Codes encode coordinates, with no administrative or house-number semantics and no guarantee of integration. The consequence is an address that needs manual conversion. Use it alongside a conventional address, not instead of one.

**Mixing up the two alphabets.** A lowercase `o` in GeoHash is read as zero, or `O`, `I` or `L` appears in a Plus Code. The cause is that both alphabets remove easily confused characters, but not the same ones. The consequence is a decode failure or a cell next door. Validate against the correct alphabet and normalise case before decoding.

**Computing neighbours near the poles or the antimeridian.** Longitude jumps from 179.9 to -179.9 and the neighbour appears on the far side of the planet. The cause is that longitude needs wrapping while latitude must be clamped at the poles. The consequence is missed points or invalid cells. Normalise longitude to ±180 first, and handle polar cells separately.

## Comparison with neighbouring encodings

| Dimension | GeoHash | Plus Codes | S2 / H3 |
|---|---|---|---|
| Readability | Lowercase alphanumeric, no separator | Uppercase alphanumeric with a plus sign, address-like | 64-bit integer or hex, not readable |
| Precision levels | Each character shrinks a side by about 5.7 | Each pair divides latitude and longitude into 20; final digit uses 4 by 5 | Levels defined by the library |
| Reference point needed | No | No for a full code, yes for a short code | No |
| Index friendliness | High, string prefixes work with range scans | Medium, full codes are hierarchical, short codes are not | High, integer IDs suit databases |
| Privacy | Truncate the suffix to reduce precision | Drop the prefix for a short code, or round coordinates | Aggregate by level with explicit granularity |
| Typical use | Cache keys, nearby search, log grouping | Spoken addresses, areas without house numbers, emergency location | Large-scale spatial indexes, hexagonal analysis |
| Text form | Five to nine characters | Ten or eleven digits with one plus sign | Not text |

If the requirement is a location in a URL or cache key with prefix queries by area, GeoHash is the direct choice. If someone has to say it, write it down or print it where street addresses are weak, Plus Codes fit better. If the job is hierarchical aggregation of millions of points in a database, S2 or H3 integers save space.

## Conversion and tools

Two tools on this site cover the encodings: [GeoHash encode and decode](/en/tools/geohash/) converts coordinates both ways, lets you choose the length and supports batches; [Plus Codes](/en/tools/plus-codes/) converts between coordinates and full codes, and rejects short codes, which need a reference place the tool does not accept.

Both run locally in the browser and do not upload coordinates, which suits data that should not leave the machine. Mind the precision loss: decoding a GeoHash returns the centre of a cell, and encoding that centre as a Plus Code describes the centre, not the original coordinate. A round trip stays inside the same cell rather than restoring the original numbers.

A GeoHash already stored in a log can be decoded to a centre and converted to a Plus Code for sharing, and the reverse also works. For batch checks, normalise the character length in the GeoHash tool first, so a dataset does not mix five- and seven-character codes.

## Sample data and parser

These coordinates and their two encodings can be used to check an implementation:

| Place | Latitude | Longitude | GeoHash, 7 chars | Plus Code |
|---|---|---|---|---|
| Tiananmen | 39.9088 | 116.3974 | `wx4g09n` | `8PFRW95W+GX` |
| Times Square | 40.7580 | -73.9855 | `dr5ru7v` | `87G8Q257+6Q` |
| Sydney Opera House | -33.8568 | 151.2153 | `r3gx2ux` | `4RRH46V8+74` |
| Equator and prime meridian | 0 | 0 | `s000000` | `6FG22222+22` |

A GeoHash encoder fits in a few lines of standard-library Python:

```python
ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz"

def geohash(lat, lng, length=7):
    lat_range, lng_range = [-90.0, 90.0], [-180.0, 180.0]
    bits, even = [], True
    while len(bits) < length * 5:
        rng = lng_range if even else lat_range
        value = lng if even else lat
        mid = (rng[0] + rng[1]) / 2
        upper = value >= mid
        bits.append(int(upper))
        rng[0 if upper else 1] = mid
        even = not even
    return "".join(
        ALPHABET[sum(bit << (4 - i) for i, bit in enumerate(bits[j:j + 5]))]
        for j in range(0, len(bits), 5)
    )

print(geohash(39.9088, 116.3974, 7))
```

The output is `wx4g09n`. The code only encodes; decoding maps each character back to five bits, narrows the latitude and longitude ranges in the same order, and returns the midpoint of the final cell.

The first four Plus Code characters follow the same alternating bisection: add 90 to latitude and 180 to longitude, take integer divisions by 20° and then 1°, and look up the 20-character alphabet. The remaining three pairs refine by 0.05°, 0.0025° and 0.000125°, and the eleventh digit splits the cell into four columns and five rows. The reference implementation and full specification live at [google/open-location-code](https://github.com/google/open-location-code), with versions in many languages.

Validate the alphabet before decoding. `a`, `i`, `l` or `o` in a GeoHash is always wrong; `0`, `1`, `I`, `L`, `O` or `U` in a Plus Code means the wrong alphabet. When recovering a short code, the closer the reference the safer; if it falls outside the same area code, reject the input instead of returning a plausible-looking point.

## References

- [Geohash](https://en.wikipedia.org/wiki/Geohash): bisection process, 32-character alphabet, precision table and neighbour calculation.
- [plus.codes](https://plus.codes/): the official Plus Codes site, covering area codes, short codes and usage.
- [google/open-location-code](https://github.com/google/open-location-code): the Open Location Code specification and reference implementations.

Related reading: [Map projection types](/en/guide/projection-types/), [Google map tiles explained](/en/guide/google-tiles/).