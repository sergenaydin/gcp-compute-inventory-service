# GCP Compute Inventory Service

A small service + client that lists the Compute Engine VMs in a GCP project
and returns them in a provider-agnostic, normalized shape.

## Architecture

```
src/
  server.ts          Express app, endpoints, centralized error handler
  errors.ts           AppError + mapping that turns GCP errors into actionable messages
  errors.test.ts       Tests for errors.ts
  types.ts             Shared CloudInstance type (provider-agnostic)
  gcp/
    computeClient.ts   aggregatedList call via @google-cloud/compute
    normalize.ts        GCP Instance -> CloudInstance mapping
    normalize.test.ts    Tests for normalize.ts
```

This repository is the API only. The web UI is a separate project,
[`gcp-compute-inventory-ui`](https://github.com/sergenaydin/gcp-compute-inventory-ui) (React + Vite); the two
are developed, run and deployed independently and only share the HTTP contract below.

### Tests

`normalize.ts` and `errors.ts` are pure functions that never connect to GCP,
so they can be tested without requiring an actual GCP connection. They're
written with Vitest:

```bash
npm test
```

Coverage: that all of GCP's status values (`RUNNING`, `TERMINATED`, `STAGING`,
etc.) are correctly mapped to the shared `status` field, that zone/region/
machineType are correctly extracted from resource URLs, that missing fields
(IP, label, creationTimestamp) fall back to `null`/empty values, and that
every gRPC code in `errors.ts` (`UNAUTHENTICATED`, `PERMISSION_DENIED`,
`NOT_FOUND`, `RESOURCE_EXHAUSTED`) as well as network/ADC errors are
correctly translated into the right HTTP status and message.

### Endpoints

| Method | Path                | Description                                          |
| ------ | ------------------- | ------------------------------------------------------ |
| GET    | `/`                 | Service name and endpoint list                           |
| GET    | `/api/health`       | Whether the service is up                                |
| GET    | `/api/instances`    | Normalized VMs across all zones in the project            |
| GET    | `/api/instances/:id`| A single instance by its GCP instance ID, or 404          |

### Normalized shape

```ts
interface CloudInstance {
  provider: "gcp" | "aws";
  id: string;
  name: string;
  status: "running" | "stopped" | "starting" | "stopping" | "terminated" | "unknown";
  region: string;
  zone: string;
  machineType: string;
  privateIp: string | null;
  publicIp: string | null;
  createdAt: string | null;
  labels: Record<string, string>;
}
```

GCP's `RUNNING` / `TERMINATED` / `STOPPING` / `SUSPENDED` / `PROVISIONING` /
`STAGING` states are mapped to the shared `status` field
(`src/gcp/normalize.ts`). Zone and machine type are extracted from the full
resource URLs that GCP returns; the SDK's raw response shape never leaks to
the client.

## GCP-side setup

The steps below are run once via the `gcloud` CLI, with your own GCP account,
after running `gcloud auth login`.

### 1. Create the project and enable the Compute Engine API

```bash
gcloud projects create opsitex-gcp-case-sergen --name="OpsITeX GCP Case"
gcloud config set project opsitex-gcp-case-sergen

# If no billing account is listed, you first need to create one via
# Console > Billing and add a payment method (can't be done from the CLI).
gcloud billing accounts list
gcloud billing projects link opsitex-gcp-case-sergen \
  --billing-account=YOUR_BILLING_ACCOUNT_ID

gcloud services enable compute.googleapis.com billingbudgets.googleapis.com
```

### 2. Create a service account (narrow scope, NOT a user account)

The app connects using a service account created specifically for this
purpose with read-only permissions, not your own user account:

```bash
gcloud iam service-accounts create envanter-reader \
  --display-name="Compute Inventory Service (read-only)"

# Compute Viewer: list/get only, no create/delete/update permissions.
gcloud projects add-iam-policy-binding opsitex-gcp-case-sergen \
  --member="serviceAccount:envanter-reader@opsitex-gcp-case-sergen.iam.gserviceaccount.com" \
  --role="roles/compute.viewer" \
  --condition=None

# Generate a key — store it OUTSIDE the project root, somewhere that will
# never enter the repo.
mkdir -p ~/.gcp
gcloud iam service-accounts keys create ~/.gcp/opsitex-envanter-key.json \
  --iam-account=envanter-reader@opsitex-gcp-case-sergen.iam.gserviceaccount.com
```

Point `GOOGLE_APPLICATION_CREDENTIALS` in `.env` to the full path of the key
file (see "Running the app").

### 3. Create a few test VMs

```bash
gcloud compute instances create envanter-test-1 envanter-test-2 \
  --zone=europe-west1-b \
  --machine-type=e2-micro \
  --image-family=debian-12 \
  --image-project=debian-cloud
```

`e2-micro` was chosen deliberately: it falls under the Always Free tier,
keeping the cost minimal.

### 4. Set up a budget alert

First check the billing account's currency — `--budget-amount` is
interpreted in that currency, and using the wrong unit (e.g. writing `5EUR`
while the account is in TRY) silently fails with `INVALID_ARGUMENT`:

```bash
gcloud billing accounts describe YOUR_BILLING_ACCOUNT_ID \
  --format="value(currencyCode)"

PROJECT_NUMBER=$(gcloud projects describe opsitex-gcp-case-sergen \
  --format="value(projectNumber)")

gcloud billing budgets create \
  --billing-account=YOUR_BILLING_ACCOUNT_ID \
  --display-name="OpsITeX Case Budget Alert" \
  --budget-amount=200 \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0 \
  --filter-projects=projects/$PROJECT_NUMBER
```

`--filter-projects` scopes the alert to just this project (otherwise it
would cover the whole billing account). Adjust the amount to your account's
currency — 200 units was chosen here as a reasonable threshold for a
TRY-billed account. Alternative: the same thing can be done in one click via
Console > Billing > Budgets & alerts.

### 5. Cleanup once done

```bash
gcloud compute instances delete envanter-test-1 envanter-test-2 \
  --zone=europe-west1-b --quiet

gcloud iam service-accounts keys delete KEY_ID \
  --iam-account=envanter-reader@opsitex-gcp-case-sergen.iam.gserviceaccount.com

rm -f ~/.gcp/opsitex-envanter-key.json

gcloud projects delete opsitex-gcp-case-sergen --quiet
```

## Running the app

Requires Node.js >=20.13 (pinned in `.nvmrc`/`package.json#engines`; run `nvm use` if you use nvm).

```bash
npm install
cp .env.example .env
# In .env, fill in GCP_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS (the
# full path to the key file from step 2).
npm run dev
# API on http://localhost:8080  (try: curl localhost:8080/api/instances)
```

`npm run build && npm start` for a production build.

### Using it with the UI

The UI lives in its own repository and runs separately (see its README):

```bash
# terminal 1: this API
npm run dev

# terminal 2: the UI (proxies /api to http://localhost:8080)
cd ../gcp-compute-inventory-ui && npm install && npm run dev
# http://localhost:5173
```

In development the UI's dev server proxies `/api`, so no CORS configuration is
needed. If the UI is hosted on another origin (a static host, for example), set
`CORS_ORIGIN` here to that origin (comma-separated for several) and build the UI
with `VITE_API_BASE_URL` pointing at this API. Without `CORS_ORIGIN`, no CORS
headers are sent.

## Identity and security

- The app uses **Application Default Credentials**
  (the service account key pointed to by the `GOOGLE_APPLICATION_CREDENTIALS`
  env variable). It never connects with a user account (`gcloud auth login`).
- The service account's only role is `roles/compute.viewer` — no permission
  to create, delete, or update instances.
- The key file and `.env` are excluded from the repo via `.gitignore`.
- Errors are never swallowed; `src/errors.ts` translates GCP's gRPC status
  codes (`PERMISSION_DENIED`, `UNAUTHENTICATED`, `NOT_FOUND`, etc.) and
  network errors into actionable messages for the user, with technical
  detail (`cause`) written only to the server log.

## Notes / Retrospective

- **Where I got stuck (types):** `@google-cloud/compute`'s TypeScript types
  aren't in the usual `Schema$X` shape you'd expect from the product — they
  come from a protobuf-generated `protos.google.cloud.compute.v1.IInstance`
  namespace instead. I had to grep the package's own `.d.ts` files to find
  the right type. I located the namespace in
  `node_modules/@google-cloud/compute/build/protos/protos.d.ts` and imported
  that type directly in `normalize.ts`, so the `raw` parameter keeps full
  type safety (no `any`).
- **Where I got stuck (budget alert):** `gcloud billing budgets create`
  failed on the first attempt with `INVALID_ARGUMENT` using
  `--budget-amount=5EUR` — the cause was that the billing account's currency
  wasn't EUR, it was TRY (when the currency doesn't match, the API error
  message doesn't say which field is wrong, it just says "invalid
  argument"). I then removed the currency suffix entirely and tried
  `--budget-amount=5`; this time it was created, but since it used the
  billing account's default currency (TRY), it ended up as a nonsensically
  small budget (~0.15 USD). I deleted the alert, verified the currency first
  with `gcloud billing accounts describe`, and then recreated it correctly
  with `--budget-amount=200` (TRY, scoped to the project number with no other
  filter: `--filter-projects=projects/<PROJECT_NUMBER>`).
- **What I'd do differently starting over:** I'd check the currency with
  `gcloud billing accounts describe` before running the budget command,
  instead of wasting two attempts. I also stuck to a single GCP project +
  single region; in a real product scenario I'd separately test the page
  token flow of `aggregatedListAsync` for multi-region aggregation and
  pagination (>500 instances). Since I hadn't seen the existing normalize
  schema on the AWS side, I designed the `CloudInstance` type based on my
  own assumptions; in a real integration, reconciling the two sides' field
  names (e.g. `region` vs `availabilityZone`) would require a separate
  discussion.
