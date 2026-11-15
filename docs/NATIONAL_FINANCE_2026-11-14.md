# National finance and finite meals

The engine retains one resident registry, clock, bank and currency. Existing identities,
brains, wallets, deeds and grandfathered inventories are preserved. National treasuries
are accounts within the existing money supply; North City cannot print Hansdrex money.

Public job salaries use the country containing the workplace. Private enterprise
operating charges and payroll tax use its workplace country too. A resident's citizenship,
home or travel position does not change the employer's payroll jurisdiction. Public
salary payments are limited by that country's cash, with tax calculated on the amount
actually paid and unpaid gross wages recorded as arrears. Farm payroll already spends
the cooperative's own cash and pays North tax.
Industrial companies and clothing shops receive the same country-account hook: licence
fees, payroll tax, public leases and unclaimed balances follow their physical premises.

Household rent, new house title proceeds and house upgrades belong to the country
containing the home. Newborn support follows the parent's durable household home:
North pays 1,600 H$, Hansdrex 1,000 H$, Hawaii 800 H$. The durable child receipt prevents
a second grant after restore. North's unpaid grants leave its money supply untouched.
Hansdrex retains the existing explicit emergency issuance policy and issuance counters.

The first new house purchase can receive funded housing help (North 900 H$, Hansdrex
450 H$, Hawaii 300 H$). A foreign citizen who physically arrives at their durable home
can receive one immigration payment per destination (North 300 H$, Hansdrex 150 H$,
Hawaii 100 H$). These settlement payments require available national cash. The initial
country migration does not itself award benefits: existing residents are assigned their
initial home country's citizenship. Existing owned homes do not trigger purchase help.

Meals consume one actual unit of the serving market's inventory. The inherited public
pantry can distribute finite stock to Hansdrex food businesses; moving a unit out of
the pantry and eating it never subtracts it twice. Empty inventories cannot refill from
population counts, minimum-stock assignments or a negative reserve. North and Hawaii
use their own vendors. A national meal subsidy transfers treasury cash to the vendor;
if North cannot fund a subsidy, a resident with 4 H$ can still buy a meal at full price.
No stock means no meal, irrespective of money.

North rice and vegetables enter the same buyer inventories that actual meals consume.
The farm's shipment contract reserves finite crop stock, takes payment into escrow,
uses a real employed driver and road route, and settles only after delivery. Unarrived
orders cannot feed residents. Existing Hansdrex farm production remains work-driven.
Farm drivers walk to a refreshed boarding position, and dispatch chooses the closest idle
truck. Cancelled contracts preserve an emergency passenger's position and itinerary.
Industrial and regional freight also pass the shared border admission check. Resident
drivers present their real identities; the regional transport fleet presents its funded
operator and cargo manifest. The latter does not create a resident or immigration wallet.
In national mode, North forwarding warehouse jobs are purchases by funded warehouses,
including converted pending legacy consignments. They no longer book off-world cash.

Validation: `node --test tests-city/national-finance-engine.test.mjs
tests-city/country-economy.test.mjs tests-city/international-life.test.mjs` exercises
the actual engine's grants, salary scarcity, cross-border rent, finite pantry, cash
meals, settlement benefits, house purchase and enterprise payroll, together with
physical farm cargo and national migration/service fixtures.
The industrial and regional freight tests additionally verify real driver visas,
workplace taxes, emergency cargo refunds, finite warehouse inventory and restart-safe
escrow conversion with conserved money.

## Worker deployment investigation (read-only)

`.github/workflows/deploy-cloudflare-civilization.yml` runs on main-branch pushes
changing `worker/**`, `cloudflare/**`, or that workflow, and on manual dispatch.
The recent water commits `4e7df4e` and `e4c4a31` change only `src/city-water.ts` and/or
`tests-unit/city-water.test.ts`; individually they do not match these filters.
The subsequent `041581a` changes `cloudflare/src/index.mjs` and therefore does match.
A single push containing several commits can include qualifying backend changes even
when its newest commit is a frontend change. GitHub Pages and generic CI run for every
main push, but neither workflow calls the civilization deployment script.

If Cloudflare still reports deployments for pushes containing only frontend paths,
inspect the deployed version's source metadata and Cloudflare Workers Builds' own
Git integration/build command. A separate Cloudflare build trigger or manual Wrangler
deployment is outside GitHub's workflow path filters. Compare push contents and
deployment source before changing CI. A workflow concurrency group would prevent
overlapping worker deploys; a narrower `cloudflare/**` filter would avoid documentation
or generated files in that directory triggering a release. No CI settings were changed.
Actual GitHub run history was not inspected because the local `gh` command is unavailable.
