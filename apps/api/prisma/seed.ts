/**
 * Demo data: two tenants (so isolation is visible), brands in two currencies,
 * users in different time zones and roles, customers with a month of orders,
 * and campaigns in every lifecycle state. Deterministic: same data every run.
 *
 *   npm run db:seed -w @podium/api
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Small deterministic PRNG so the demo leaderboard looks the same on every reseed.
let state = 42;
const rand = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;

const DAY = 86_400_000;
const now = Date.now();
const at = (days: number, hour = 12) => {
  const d = new Date(now + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

const FIRST = ["Ana", "Bruno", "Carla", "Diego", "Elena", "Felipe", "Gabi", "Hugo", "Iris", "João", "Kai", "Lena", "Marco", "Nina", "Otto", "Paula", "Rafa", "Sofia", "Tom", "Vera"];
const LAST = ["S.", "M.", "K.", "R.", "L.", "P.", "D.", "C."];

async function main() {
  await prisma.tenant.deleteMany(); // cascades to everything

  const acme = await prisma.tenant.create({ data: { name: "Acme Outfitters", slug: "acme" } });
  const north = await prisma.tenant.create({ data: { name: "Northwind Market", slug: "northwind" } });

  const [acmeUS, acmeOutlet, acmeJP] = await Promise.all([
    prisma.brand.create({ data: { tenantId: acme.id, name: "Acme US", currency: "USD" } }),
    prisma.brand.create({ data: { tenantId: acme.id, name: "Acme Outlet", currency: "USD" } }),
    prisma.brand.create({ data: { tenantId: acme.id, name: "Acme Japan", currency: "JPY" } }),
  ]);
  const northBrand = await prisma.brand.create({ data: { tenantId: north.id, name: "Northwind", currency: "USD" } });

  const owner = await prisma.user.create({
    data: { tenantId: acme.id, email: "owner@acme.test", name: "Olivia Owner", role: "OWNER", timeZone: "America/New_York" },
  });
  await prisma.user.create({
    data: {
      tenantId: acme.id, email: "manager@acme.test", name: "Mateus Manager", role: "BRAND_MANAGER", timeZone: "America/Sao_Paulo",
      brands: { create: [{ brandId: acmeUS.id }] },
    },
  });
  await prisma.user.create({
    data: {
      tenantId: acme.id, email: "viewer@acme.test", name: "Vik Viewer", role: "VIEWER", timeZone: "Europe/Sofia",
      brands: { create: [{ brandId: acmeUS.id }, { brandId: acmeOutlet.id }] },
    },
  });
  const northOwner = await prisma.user.create({
    data: { tenantId: north.id, email: "owner@northwind.test", name: "Noah Northwind", role: "OWNER", timeZone: "America/Chicago" },
  });

  // Customers and a month of orders (plus a few days ahead for the scheduled campaign window).
  const customers = await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      prisma.customer.create({ data: { tenantId: acme.id, externalRef: `acme-${i}`, displayName: `${pick(FIRST)} ${pick(LAST)}` } }),
    ),
  );
  const northCustomers = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      prisma.customer.create({ data: { tenantId: north.id, externalRef: `nw-${i}`, displayName: `${pick(FIRST)} ${pick(LAST)}` } }),
    ),
  );

  const orders = [];
  for (let i = 0; i < 900; i++) {
    const brand = pick([acmeUS, acmeUS, acmeOutlet, acmeJP]);
    const minor = brand.currency === "JPY" ? Math.round(2000 + rand() * 30000) : Math.round(1500 + rand() * 25000);
    // Skewed: a few heavy buyers make a more interesting leaderboard.
    const customer = customers[Math.floor(rand() ** 2 * customers.length)]!;
    orders.push({ brandId: brand.id, customerId: customer.id, amountMinor: minor, placedAt: new Date(now - rand() * 30 * DAY) });
  }
  for (let i = 0; i < 120; i++) {
    orders.push({ brandId: northBrand.id, customerId: pick(northCustomers).id, amountMinor: Math.round(1000 + rand() * 9000), placedAt: new Date(now - rand() * 14 * DAY) });
  }
  await prisma.order.createMany({ data: orders });

  const prizes = (amounts: number[], type: "COUPON" | "CASHBACK" | "GIFT" = "COUPON") =>
    amounts.map((amountMinor, i) => ({ place: i + 1, type, amountMinor }));

  const campaigns: Parameters<typeof prisma.campaign.create>[0]["data"][] = [
    {
      tenantId: acme.id, createdById: owner.id, name: "November Top Spenders", status: "LIVE", metric: "TOTAL_SPEND",
      startsAt: at(-10, 3), endsAt: at(4, 3), currency: "USD", scheduleVersion: 2,
      brands: { create: [{ brandId: acmeUS.id }] },
      prizes: { create: prizes([25000, 15000, 10000, 5000, 5000]) },
    },
    {
      tenantId: acme.id, createdById: owner.id, name: "Outlet + US Loyalty Race", status: "LIVE", metric: "ORDER_COUNT",
      startsAt: at(-20, 3), endsAt: at(2, 3), currency: "USD", minOrderMinor: 3000, scheduleVersion: 2,
      brands: { create: [{ brandId: acmeUS.id }, { brandId: acmeOutlet.id }] },
      prizes: { create: prizes([10000, 5000, 2500], "CASHBACK") },
    },
    {
      tenantId: acme.id, createdById: owner.id, name: "Black Friday Weekend", status: "SCHEDULED", metric: "TOTAL_SPEND",
      startsAt: at(9, 3), endsAt: at(12, 5), currency: "USD", scheduleVersion: 1,
      brands: { create: [{ brandId: acmeUS.id }, { brandId: acmeOutlet.id }] },
      prizes: { create: prizes([50000, 30000, 20000, 10000, 10000, 5000, 5000, 5000, 5000, 5000]) },
    },
    {
      tenantId: acme.id, createdById: owner.id, name: "Tokyo Winter Sale", status: "DRAFT", metric: "TOTAL_SPEND",
      startsAt: at(20, 0), endsAt: at(27, 0), currency: "JPY",
      brands: { create: [{ brandId: acmeJP.id }] },
      prizes: { create: prizes([30000, 15000, 5000], "GIFT") },
    },
    {
      tenantId: acme.id, createdById: owner.id, name: "October Kickoff", status: "ENDED", metric: "TOTAL_SPEND",
      startsAt: at(-29, 3), endsAt: at(-22, 3), currency: "USD", scheduleVersion: 2,
      brands: { create: [{ brandId: acmeUS.id }] },
      prizes: { create: prizes([20000, 10000, 5000]) },
    },
    {
      tenantId: north.id, createdById: northOwner.id, name: "Northwind Regulars", status: "LIVE", metric: "ORDER_COUNT",
      startsAt: at(-7, 6), endsAt: at(7, 6), currency: "USD", scheduleVersion: 2,
      brands: { create: [{ brandId: northBrand.id }] },
      prizes: { create: prizes([5000, 2500]) },
    },
  ];
  for (const data of campaigns) await prisma.campaign.create({ data });

  console.log(`Seeded 2 tenants, 4 brands, 4 users, ${customers.length + northCustomers.length} customers, ${orders.length} orders, ${campaigns.length} campaigns.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
