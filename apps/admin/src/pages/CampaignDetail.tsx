import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { DataGrid, type GridColDef, type GridPaginationModel } from "@mui/x-data-grid";
import type { LeaderboardRow } from "@podium/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useMe } from "../App";
import { STATUS_COLOR, formatInZone, money } from "../format";

export function CampaignDetailPage() {
  const { id = "" } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const [paging, setPaging] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });
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

  if (campaign.isPending) return <CircularProgress />;
  if (campaign.isError) return <Alert severity="error">{campaign.error.message}</Alert>;
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
        <Typography variant="h5" fontWeight={700} sx={{ flex: 1 }}>{c.name}</Typography>
        <Chip color={STATUS_COLOR[c.status]} label={c.status.toLowerCase()} />
        {editable && <Button component={Link} to={`/campaigns/${id}/edit`} variant="outlined">Edit</Button>}
        {canEdit && c.status === "DRAFT" && (
          <Button variant="contained" onClick={() => act.mutate("schedule")} disabled={act.isPending}>Schedule</Button>
        )}
        {canEdit && ["DRAFT", "SCHEDULED", "LIVE"].includes(c.status) && (
          <Button color="error" onClick={() => act.mutate("cancel")} disabled={act.isPending}>Cancel campaign</Button>
        )}
      </Stack>
      {act.error && <Alert severity="error">{act.error instanceof ApiError ? act.error.message : "Something went wrong"}</Alert>}
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

      <Typography variant="h6">Leaderboard</Typography>
      <Box>
        <DataGrid
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
