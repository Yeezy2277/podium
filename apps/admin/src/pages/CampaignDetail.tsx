import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import type { LeaderboardRow } from "@podium/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useMe } from "../App";
import { STATUS_COLOR, formatInZone, money } from "../format";
import { Loading } from "../ui";

const PAGE_SIZES = [10, 25, 50];

export function CampaignDetailPage() {
  const { id = "" } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  // Leaderboard paging in the URL: a reload or a shared link lands on the same page.
  const [sp, setSp] = useSearchParams();
  const size = Number(sp.get("size"));
  const paging = { page: Math.max(0, Number(sp.get("page")) || 0), pageSize: PAGE_SIZES.includes(size) ? size : 10 };
  const setPaging = (m: { page: number; pageSize: number }) => {
    const out = new URLSearchParams();
    if (m.page) out.set("page", String(m.page));
    if (m.pageSize !== 10) out.set("size", String(m.pageSize));
    setSp(out, { replace: true });
  };
  const campaign = useQuery({ queryKey: ["campaign", id], queryFn: () => api.campaign(id) });
  const board = useQuery({
    queryKey: ["leaderboard", id, paging],
    queryFn: () => api.leaderboard(id, paging.page, paging.pageSize),
    placeholderData: keepPreviousData,
  });

  const act = useMutation({
    mutationFn: (kind: "schedule" | "cancel") => api[kind](id, campaign.data!.version),
    onSuccess: (updated) => {
      qc.setQueryData(["campaign", id], updated);
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });

  if (campaign.isPending) return <Loading what="the campaign" />;
  if (campaign.isError) {
    return (
      <Stack spacing={2} alignItems="flex-start">
        <Typography variant="h5" component="h1" fontWeight={700}>Campaign unavailable</Typography>
        <Alert severity="error">
          {campaign.error instanceof ApiError && campaign.error.status === 404
            ? "This campaign doesn't exist, or it isn't on a brand you can see."
            : `Couldn't load it: ${campaign.error.message}`}
        </Alert>
        <Button component={Link} to="/">Back to campaigns</Button>
      </Stack>
    );
  }
  const c = campaign.data;

  // The UI only offers what the API would allow; the API enforces it regardless.
  const myBrands = new Set(me.brands.map((b) => b.id));
  const canEdit = me.role === "OWNER" || (me.role === "BRAND_MANAGER" && c.brands.every((b) => myBrands.has(b.id)));
  const editable = canEdit && ["DRAFT", "SCHEDULED", "LIVE"].includes(c.status);

  const columns: GridColDef<LeaderboardRow>[] = [
    { field: "rank", headerName: "#", width: 70 },
    { field: "displayName", headerName: "Customer", flex: 1, minWidth: 160 },
    {
      field: "score",
      headerName: c.metric === "ORDER_COUNT" ? "Orders counted" : "Spend",
      width: 160,
      align: "right",
      headerAlign: "right",
      valueFormatter: (v: number) => (c.metric === "ORDER_COUNT" ? String(v) : money(v, c.currency)),
    },
    { field: "orders", headerName: "Orders", width: 100, align: "right", headerAlign: "right" },
    {
      field: "prize",
      headerName: "Prize",
      width: 180,
      sortable: false,
      valueGetter: (_, r) => (r.prize ? `${money(r.prize.amountMinor, c.currency)} ${r.prize.type.toLowerCase()}` : ""),
    },
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <Button component={Link} to="/" size="small">← Campaigns</Button>
        <Typography variant="h5" component="h1" fontWeight={700} sx={{ flex: 1 }}>{c.name}</Typography>
        <Chip color={STATUS_COLOR[c.status]} label={c.status.toLowerCase()} />
        {editable && <Button component={Link} to={`/campaigns/${id}/edit`} variant="outlined">Edit</Button>}
        {canEdit && c.status === "DRAFT" && (
          <Button variant="contained" onClick={() => act.mutate("schedule")} disabled={act.isPending}>Schedule</Button>
        )}
        {canEdit && ["DRAFT", "SCHEDULED", "LIVE"].includes(c.status) && (
          <Button color="error" onClick={() => act.mutate("cancel")} disabled={act.isPending}>Cancel campaign</Button>
        )}
      </Stack>
      {act.error && (
        <Alert
          severity="error"
          action={
            act.error instanceof ApiError && act.error.status === 409 ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  act.reset();
                  void campaign.refetch();
                }}
              >
                Reload
              </Button>
            ) : undefined
          }
        >
          {act.error.message}
        </Alert>
      )}
      {!canEdit && me.role === "BRAND_MANAGER" && (
        <Alert severity="info">This campaign includes brands you don't manage, so it's read-only for you.</Alert>
      )}

      <Card variant="outlined">
        <CardContent sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(4, minmax(0, 1fr))" } }}>
          <Fact label={`Starts (${me.timeZone})`} value={formatInZone(c.startsAt, me.timeZone)} />
          <Fact label="Ends" value={formatInZone(c.endsAt, me.timeZone)} />
          <Fact label="Brands" value={c.brands.map((b) => b.name).join(", ")} />
          <Fact label="Ranks by" value={c.metric === "ORDER_COUNT" ? "Number of orders" : "Total spend"} />
          <Fact label="Minimum order" value={c.minOrderMinor ? money(c.minOrderMinor, c.currency) : "None"} />
          <Fact label="Prize pool" value={`${money(c.prizePool, c.currency)} across ${c.places} places`} />
        </CardContent>
      </Card>

      <Typography variant="h6" component="h2" id="board-h">Leaderboard</Typography>
      {board.isError && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void board.refetch()}>Retry</Button>}>
          Couldn't load the leaderboard: {board.error.message}
        </Alert>
      )}
      <Box>
        <DataGrid
          aria-labelledby="board-h"
          autoHeight
          rows={board.data?.rows ?? []}
          getRowId={(r) => r.customerId}
          rowCount={board.data?.total ?? 0}
          columns={columns}
          loading={board.isFetching}
          paginationMode="server"
          paginationModel={paging}
          onPaginationModelChange={setPaging}
          pageSizeOptions={[10, 25, 50]}
          disableColumnSorting
          disableRowSelectionOnClick
          localeText={{ noRowsLabel: c.status === "DRAFT" || c.status === "SCHEDULED" ? "The leaderboard fills once the campaign starts" : "No qualifying orders" }}
        />
      </Box>
    </Stack>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography>{value}</Typography>
    </Box>
  );
}
