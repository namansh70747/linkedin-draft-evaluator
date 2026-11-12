# Local draft evaluator

A TypeScript command-line tool that estimates an authored draft's engagement from historical text references. It explains its evidence and evaluates predictions against separately supplied outcomes. All scoring is local; no external AI, runtime service calls, database, or credentials are used.

## Setup

Requires Node.js 24.6 or later in the Node 24 series and npm.

```sh
npm ci
npm run typecheck
npm test
```

Dependency installation may require the network. Once installed, commands below use the local runner and need no network access. No build or hosting is required.

## Run

Supply your own private files using explicit paths:

```sh
npx --no-install tsx eval.ts /path/to/draft.md --posts /path/to/posts.json
npx --no-install tsx evaluate.ts --posts /path/to/posts.json --drafts /path/to/drafts --outcomes /path/to/outcomes.json
```

Commands print JSON to stdout. Invalid arguments/files produce an actionable stderr message and exit code 1, with no success JSON. Input files are never modified. Save results only in a private local location if needed; terminal output contains source-derived information. Results are not retained by the application.

### Input formats

All examples below are synthetic.

Historical JSON:

```json
{"posts":[{"id":"example-1","author":"Example Author","text":"An example post.","likes":10,"comments":2,"shares":1}]}
```

Draft Markdown:

```text
Author: Example Author

A new draft to evaluate.
```

Outcome JSON:

```json
{"outcomes":[{"draft":"01.md","author":"Example Author","likes":12,"comments":1,"shares":0}]}
```

Counts must be nonnegative safe integers, and their sum must also be safe. History IDs and outcome filenames must be unique. Outcome filenames must be simple Markdown basenames, and their authors must match the draft. Names are matched after trimming and lowercasing. Other metadata is ignored. Empty history/outcomes, empty drafts, invalid fields and unreadable files fail explicitly.

## Method: lexical-author-lift-v1

- Engagement is likes + comments + shares; calculations use `log(1 + engagement)`.
- An author's typical result is the median historical log engagement.
- Only authors with at least three posts supply reference targets. Each target is a post's log engagement minus its author's median **other-post** log engagement.
- Text is lowercased, HTTP(S) URLs removed, and ASCII alphanumeric tokens of at least two characters extracted. No stemming or stop-word filtering is applied.
- TF–IDF uses `tf = 1 + log(count)` and `idf = log((N+1)/(df+1)) + 1`, followed by unit normalization. Vocabulary is fitted only on eligible history.
- Select up to five positive-cosine references, sorting tied similarities by ID. Lift is `sum(similarity * reference lift) / (sum(similarity) + 1)`.
- Score is the midrank percentile of predicted lift among **all eligible** historical reference lifts. It is not a probability or a writing-quality grade. Zero lift need not have score 50.
- Bands are below/typical/above, using lift boundaries `-log(1.25)` and `log(1.25)`; exact boundaries are typical.
- Count estimate is `max(0, exp(baseline + lift) - 1)`. With one or two author posts it uses a labelled sparse baseline; with none it uses the pooled historical median. Neither fallback establishes reliable author-relative performance.
- No overlapping vocabulary means zero lift and low confidence. No eligible references means a provisional sentinel score of 50.
- Confidence is at most moderate: author history >=3, contributing references >=3, strongest similarity >=0.20. Otherwise it is low. Confidence is a heuristic evidence flag, not calibrated certainty.
- Similar-reference contributions sum to predicted lift. Reasons explain those inputs rather than making causal claims about readers.

The constants are fixed defaults, not business-validated weights or settings selected to optimize outcome answers. Service cost is zero, excluding local computing and initial setup costs.

## Evaluation and trust

The scorer never receives outcomes. The evaluator prepares predictions from drafts/history before comparing outcome counts. It reports:

1. Every supplied outcome, including sparse/pooled fallback rows.
2. Count mean absolute log error and the same-baseline zero-lift predictor.
3. Relative-lift error and descriptive Spearman correlation for eligible authors only, with coverage shown explicitly.
4. An overlap sensitivity pass: remove historical posts with per-draft token-set Jaccard >=0.70, then rebuild baselines and indexes. Baseline comparisons use the same reduced history.
5. A one-sentence trust judgement. An improvement in both passes is still preliminary evidence, not permission to automate publishing.

Rank ties use average ranks. Correlation is unavailable for fewer than two eligible rows or a constant vector. An invalid/missing outcome draft fails the whole report. If overlap removal leaves no history, evaluation fails rather than fabricating a result.

Small samples cannot establish general prediction reliability. Missing followers, impressions and dates prevent reach/rate/time adjustments. Lexical similarity misses meaning, and a shared topic may not imply shared performance. Known outcomes must not be used to tune the estimator; disclose any prior inspection and never call such a test blind. Overlap checks do not establish publication chronology or independence.

## Architecture and review

- `src/data.ts`: input types, validation and read-only loading.
- `src/scoring.ts`: statistics, text vectors, prediction and evidence.
- `src/evaluation.ts`: predictions, sensitivity pass and outcome reporting.
- `src/metrics.ts`: error and rank calculations.
- `src/cli.ts`: arguments and error boundary; root entrypoints invoke these modules.

Tests use synthetic data and real temporary files/processes. They check numerical answers, fallback behavior, input failures, outcome-independent predictions, source preservation and actual commands. Tests establish software behavior, not future predictive success.

For independent review, run type checking and tests, inspect reference arithmetic and outcome isolation, then rerun both evaluation passes using private local inputs. No UI, publishing integration, rewrite feature or cloud deployment is included.

## Privacy

Keep inputs and reports outside version control. The repository excludes local assessment documents, data, outputs, work folders, environment secrets and dependencies. Never commit private supplied text or source-derived reports. Inspect staged files before any upload. Private repository visibility alone is not authorization to upload confidential data.
