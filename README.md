# 209-Final-Project

An explorable explanation of civilian complaints against NYPD officers (2000–2019), built with D3.

## Run it locally

The page loads data files and ES modules, so it has to be served over HTTP (opening `index.html` directly won't work):

```sh
python -m http.server
# then open http://localhost:8000
```

## Project layout

```
index.html              page markup and article text
proposal.html           project proposal page (title, dataset, team, writeup, 6 static figures)
css/style.css           all styles, including light/dark theme tokens
data/                   allegations, precinct boundaries, precinct income/population (generated)
scripts/                Python scripts that rebuild data/ from the original sources
js/
  proposal.js           draws the proposal page's static figures (reuses data.js and map-base.js)
  main.js               entry point: load data → build model → set up charts → draw
  config.js             date range, thresholds, neighborhood names, timeline events
  utils.js              formatting and math helpers
  data.js               loads data/ and computes every derived number (no DOM)
  narrative.js          fills computed numbers into the article text
  ui/tooltip.js         shared tooltip
  ui/highlight.js       linked hover highlighting across charts
  charts/
    map-base.js         shared projection, path, and label placement for both maps
    where-map.js        Act 1 map: sliding window, share / per resident, playback controls
    timeline.js         Act 1 timeline under the map
    ranking.js          Act 1 animated top-10 list
    outcomes.js         Act 2 findings by allegation type (stacked bars)
    rate-map.js         Act 2 map: substantiation rate, upheld / not upheld per resident
    side-panel.js       Act 2 precinct detail panel (also used by the Act 3 scatter)
    scatter.js          Act 3 scatter: volume / per resident / income vs. substantiation rate
    dumbbell.js         Act 3 quartile comparison (by volume or by income)
```

Each chart module exports an `init…` function that builds the chart once and returns `{ render }`.
`main.js` calls every `render` on load and again when the OS theme changes (chart colors come from CSS variables).

## Rebuilding the data

Everything in `data/` can be regenerated from the original sources (Python 3, standard library only):

```sh
python scripts/build_data.py
```

This downloads the raw files into `raw/` (git-ignored, ~10 MB) and runs each step:

| Script | Output | What it does |
|---|---|---|
| `fetch_raw.py` | `raw/` | Downloads the CCRB data, precinct boundaries, Census Gazetteer tracts, and ACS tables (release pinned to `acs2024_5yr`) |
| `prep.py` | `allegations.csv`, `precincts.geojson` | Keeps the columns the page uses; rounds boundary coordinates to 4 decimals |
| `rewind.py` | `precincts.geojson` | Fixes polygon winding order so d3-geo draws each precinct correctly |
| `income.py` | `precinct_income.csv` | Assigns each census tract to the precinct containing its center point, sums population and income-bracket counts (B01003, B19001), and estimates each precinct's median income from the combined brackets (top-coded at $200k) |

`python scripts/build_data.py some/other/dir` writes the output elsewhere, which is handy for comparing against `data/`.

## Data sources

- Complaints: [ProPublica's release of NYC CCRB records](https://projects.propublica.org/nypd-ccrb/)
- Precinct boundaries: [NYC Open Data, Police Precincts](https://data.cityofnewyork.us/d/y76i-bdw7)
- Income and population: Census ACS 2020–2024 5-year estimates ([B19001](https://censusreporter.org/tables/B19001/), [B01003](https://censusreporter.org/tables/B01003/)), aggregated from tracts to precincts using [Census Gazetteer](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html) tract centers
