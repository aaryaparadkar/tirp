# data/

`au-postcodes.json` — postcode/suburb → coordinates for the "find a doctor or
clinic" flow (`src/providers/postcodes.ts`).

- `p`: `{ "<postcode>": [suburb, state, latitude, longitude] }` — one
  representative suburb per postcode (CBD postcodes map to the city name).
- `s`: `{ "<lowercase suburb>": ["<postcode>", ...] }` — suburb name index.

Built from `australian_postcodes.csv` in
https://github.com/matthewproctor/australianpostcodes (delivery areas only,
`Lat_precise`/`Long_precise` where present; 9xxx pseudo-postcodes such as
9999 "North Pole" removed). The upstream repo does not state a licence —
confirm terms before commercial use, or regenerate from ABS / Australia Post
data.
