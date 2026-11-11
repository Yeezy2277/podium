import { Alert, Box, Button, Card, CardContent, Checkbox, FormControl, FormControlLabel, FormGroup, FormHelperText, FormLabel, IconButton, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { CampaignInput, METRICS, PRIZE_TYPES, minorDigits, parseMoney } from "@podium/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type CampaignDetail } from "../api";
import { useMe } from "../App";
import { toLocalInput } from "../format";
import { Loading } from "../ui";
import type { Me } from "../api";

/** `key` is a client-side id: rows can be removed, so the index can't identify them. */
type PrizeDraft = { key: string; type: (typeof PRIZE_TYPES)[number]; amount: string };

let nextKey = 0;
const prizeKey = () => `prize-${++nextKey}`;
type Draft = {
  name: string;
  brandIds: string[];
  metric: (typeof METRICS)[number];
  startsAtLocal: string;
  endsAtLocal: string;
  minOrder: string;
  prizes: PrizeDraft[];
};

const majorString = (minor: number, currency: string) => (minor / 10 ** minorDigits(currency)).toFixed(minorDigits(currency));

function fromCampaign(c: CampaignDetail, zone: string): Draft {
  return {
    name: c.name,
    brandIds: c.brands.map((b) => b.id),
    metric: c.metric,
    startsAtLocal: toLocalInput(c.startsAt, zone),
    endsAtLocal: toLocalInput(c.endsAt, zone),
    minOrder: c.minOrderMinor ? majorString(c.minOrderMinor, c.currency) : "",
    prizes: c.prizes.map((p) => ({ key: prizeKey(), type: p.type, amount: majorString(p.amountMinor, c.currency) })),
  };
}

function emptyDraft(me: Me): Draft {
  return {
    name: "",
    brandIds: me.brands.length === 1 ? [me.brands[0]!.id] : [],
    metric: "TOTAL_SPEND",
    startsAtLocal: "",
    endsAtLocal: "",
    minOrder: "",
    prizes: [{ key: prizeKey(), type: "COUPON", amount: "" }],
  };
}

/** Loads the campaign (when editing), then mounts the editor once with it. */
export function CampaignFormPage() {
  const { id } = useParams();
  const existing = useQuery({ queryKey: ["campaign", id], queryFn: () => api.campaign(id!), enabled: !!id });

  if (!id) return <CampaignEditor key="new" />;
  if (existing.isPending) return <Loading what="the campaign" />;
  if (existing.isError) {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void existing.refetch()}>Retry</Button>}>
        Couldn't load the campaign to edit: {existing.error.message}
      </Alert>
    );
  }
  // Keyed by id + version: the draft is initialised from this snapshot and a
  // background refetch never overwrites what the user is typing.
  return <CampaignEditor key={`${id}:${existing.data.version}`} existing={existing.data} />;
}

export function CampaignEditor({ existing }: { existing?: CampaignDetail }) {
  const id = existing?.id;
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => (existing ? fromCampaign(existing, me.timeZone) : emptyDraft(me)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The version this edit started from: saving sends it, so a concurrent save is a 409, not a silent overwrite.
  const [baseVersion] = useState(existing?.version);

  // Brands decide the currency; mixing currencies is refused by the API and flagged here first.
  const currencies = useMemo(
    () => [...new Set(me.brands.filter((b) => draft.brandIds.includes(b.id)).map((b) => b.currency))],
    [me.brands, draft.brandIds],
  );
  const currency = currencies.length === 1 ? currencies[0]! : "USD";
  const live = existing?.status === "LIVE";

  const save = useMutation({
    mutationFn: (input: CampaignInput) => (id ? api.update(id, input, baseVersion!) : api.create(input)),
    onSuccess: (c) => {
      qc.setQueryData(["campaign", c.id], c);
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      navigate(`/campaigns/${c.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields.length) setErrors(Object.fromEntries(e.fields.map((f) => [f.path, f.message])));
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors: Record<string, string> = {};
    const toMinor = (s: string, path: string) => {
      try {
        return parseMoney(s || "0", currency);
      } catch (err) {
        fieldErrors[path] = (err as Error).message;
        return 0;
      }
    };
    const input = {
      name: draft.name,
      brandIds: draft.brandIds,
      metric: draft.metric,
      startsAtLocal: draft.startsAtLocal,
      endsAtLocal: draft.endsAtLocal,
      // The admin typed these on their own clock; the API converts to UTC once.
      timeZone: me.timeZone,
      minOrderMinor: toMinor(draft.minOrder, "minOrderMinor"),
      prizes: draft.prizes.map((p, i) => ({ place: i + 1, type: p.type, amountMinor: toMinor(p.amount, `prizes.${i}.amountMinor`) })),
    };
    // Same Zod schema as the API: the user sees the same messages before and after the round trip.
    const parsed = CampaignInput.safeParse(input);
    if (!parsed.success) for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
    if (currencies.length > 1) fieldErrors.brandIds = `These brands sell in different currencies (${currencies.join(", ")})`;
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length === 0 && parsed.success) save.mutate(parsed.data);
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <Stack spacing={2} sx={{ maxWidth: 760 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Button component={Link} to={id ? `/campaigns/${id}` : "/"} size="small">← Back</Button>
          <Typography variant="h5" component="h1" fontWeight={700}>{id ? "Edit campaign" : "New campaign"}</Typography>
        </Stack>
        {live && <Alert severity="info">This campaign is live: you can rename it or move its end. Brands, prizes and the minimum order are locked.</Alert>}
        {save.error && (
          <Alert
            severity="error"
            action={
              save.error instanceof ApiError && save.error.status === 409 ? (
                <Button color="inherit" size="small" onClick={() => void qc.invalidateQueries({ queryKey: ["campaign", id] })}>
                  Reload
                </Button>
              ) : undefined
            }
          >
            {save.error.message}
            {save.error instanceof ApiError && save.error.status === 409 && " Reloading discards your edits here."}
          </Alert>
        )}

        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <TextField id="name" label="Name" value={draft.name} onChange={(e) => set("name", e.target.value)} error={!!errors.name} helperText={errors.name} required />
              <FormControl component="fieldset" error={!!errors.brandIds} disabled={live}>
                <FormLabel component="legend">Brands</FormLabel>
                <FormGroup row aria-describedby={errors.brandIds ? "brands-error" : undefined}>
                  {me.brands.map((b) => (
                    <FormControlLabel
                      key={b.id}
                      control={
                        <Checkbox
                          id={`brand-${b.id}`}
                          checked={draft.brandIds.includes(b.id)}
                          inputProps={{ "aria-invalid": !!errors.brandIds }}
                          onChange={(e) => set("brandIds", e.target.checked ? [...draft.brandIds, b.id] : draft.brandIds.filter((x) => x !== b.id))}
                        />
                      }
                      label={`${b.name} (${b.currency})`}
                    />
                  ))}
                </FormGroup>
                {errors.brandIds && <FormHelperText id="brands-error" role="alert">{errors.brandIds}</FormHelperText>}
              </FormControl>
              <TextField id="metric" select label="Rank customers by" value={draft.metric} onChange={(e) => set("metric", e.target.value as Draft["metric"])} disabled={live}>
                <MenuItem value="TOTAL_SPEND">Total spend</MenuItem>
                <MenuItem value="ORDER_COUNT">Number of orders</MenuItem>
              </TextField>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  id="startsAt" type="datetime-local" label={`Starts (${me.timeZone})`} value={draft.startsAtLocal}
                  onChange={(e) => set("startsAtLocal", e.target.value)} InputLabelProps={{ shrink: true }} fullWidth disabled={live}
                  error={!!errors.startsAtLocal} helperText={errors.startsAtLocal}
                />
                <TextField
                  id="endsAt" type="datetime-local" label={`Ends (${me.timeZone})`} value={draft.endsAtLocal}
                  onChange={(e) => set("endsAtLocal", e.target.value)} InputLabelProps={{ shrink: true }} fullWidth
                  error={!!errors.endsAtLocal} helperText={errors.endsAtLocal}
                />
              </Stack>
              <TextField
                id="minOrder" label={`Minimum order (${currency})`} value={draft.minOrder} onChange={(e) => set("minOrder", e.target.value)}
                placeholder="0" inputMode="decimal" disabled={live} error={!!errors.minOrderMinor} helperText={errors.minOrderMinor ?? "Smaller orders don't count toward the leaderboard"}
              />
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" component="h2" fontWeight={600} gutterBottom id="prizes-h">Prizes</Typography>
            <Stack spacing={1.5} role="group" aria-labelledby="prizes-h" aria-describedby={errors.prizes ? "prizes-error" : undefined}>
              {draft.prizes.map((p, i) => (
                <Stack key={p.key} direction="row" spacing={1.5} alignItems="flex-start" flexWrap="wrap" useFlexGap>
                  <Typography sx={{ width: 48, pt: 1 }} color="text.secondary" aria-hidden="true">#{i + 1}</Typography>
                  <TextField
                    id={`${p.key}-type`} select size="small" label={`Place ${i + 1} type`} value={p.type} disabled={live} sx={{ width: 150 }}
                    onChange={(e) => set("prizes", draft.prizes.map((x) => (x.key === p.key ? { ...x, type: e.target.value as PrizeDraft["type"] } : x)))}
                  >
                    {PRIZE_TYPES.map((t) => <MenuItem key={t} value={t}>{t.toLowerCase()}</MenuItem>)}
                  </TextField>
                  <TextField
                    id={`${p.key}-amount`} size="small" label={`Place ${i + 1} amount (${currency})`} value={p.amount} inputMode="decimal" disabled={live}
                    onChange={(e) => set("prizes", draft.prizes.map((x) => (x.key === p.key ? { ...x, amount: e.target.value } : x)))}
                    error={!!errors[`prizes.${i}.amountMinor`]} helperText={errors[`prizes.${i}.amountMinor`]}
                  />
                  <IconButton aria-label={`Remove prize ${i + 1}`} disabled={live || draft.prizes.length === 1} onClick={() => set("prizes", draft.prizes.filter((x) => x.key !== p.key))}>
                    <span aria-hidden="true">×</span>
                  </IconButton>
                </Stack>
              ))}
              {errors.prizes && <FormHelperText error id="prizes-error" role="alert">{errors.prizes}</FormHelperText>}
              <Box>
                <Button size="small" disabled={live} onClick={() => set("prizes", [...draft.prizes, { key: prizeKey(), type: draft.prizes.at(-1)?.type ?? "COUPON", amount: "" }])}>
                  Add place
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Stack direction="row" spacing={1}>
          <Button type="submit" variant="contained" disabled={save.isPending}>{id ? "Save changes" : "Create draft"}</Button>
          <Button component={Link} to={id ? `/campaigns/${id}` : "/"}>Cancel</Button>
        </Stack>
      </Stack>
    </Box>
  );
}
