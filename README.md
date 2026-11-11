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
css/style.css           all styles, including light/dark theme tokens
data/                   allegations, precinct boundaries, precinct income/population
js/
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

## Data sources

- Complaints: [ProPublica's release of NYC CCRB records](https://projects.propublica.org/nypd-ccrb/)
- Precinct boundaries: NYC Open Data
- Income and population: Census ACS 2020–2024 5-year estimates (tables B19001, B01003), aggregated from tracts to precincts
