import { Alert, Button, Chip, Link as MuiLink, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { CAMPAIGN_STATUSES, type CampaignRow } from "@podium/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useMe } from "../App";
import { STATUS_COLOR, formatInZone, money } from "../format";

const PAGE_SIZES = [10, 25, 50];

/** List state lives in the URL, so a filtered page survives a reload and can be shared. */
function useListParams() {
  const [sp, setSp] = useSearchParams();
  const pageSize = Number(sp.get("size"));
  const state = {
    page: Math.max(0, Number(sp.get("page")) || 0),
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : 10,
    sort: sp.get("sort") ?? "startsAt",
    dir: (sp.get("dir") === "asc" ? "asc" : "desc") as "asc" | "desc",
    status: sp.get("status") ?? "",
    q: sp.get("q") ?? "",
  };
  const update = (patch: Partial<typeof state>) => {
    const next = { ...state, ...patch };
    const out = new URLSearchParams();
    if (next.page) out.set("page", String(next.page));
    if (next.pageSize !== 10) out.set("size", String(next.pageSize));
    if (next.sort !== "startsAt") out.set("sort", next.sort);
    if (next.dir !== "desc") out.set("dir", next.dir);
    if (next.status) out.set("status", next.status);
    if (next.q) out.set("q", next.q);
    setSp(out, { replace: true });
  };
  return [state, update] as const;
}

export function CampaignListPage() {
  const me = useMe();
  const [params, update] = useListParams();
  const [search, setSearch] = useState(params.q);

  // Debounce typing into the URL: one request per pause, not per keystroke.
  // A new filter starts from the first page (page 4 of a 1-page result shows nothing).
  useEffect(() => {
    const q = search.trim();
    if (q === params.q) return;
    const t = setTimeout(() => update({ q, page: 0 }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const list = useQuery({ queryKey: ["campaigns", params], queryFn: () => api.campaigns(params), placeholderData: keepPreviousData });
  const filtered = Boolean(params.q || params.status);

  const columns: GridColDef<CampaignRow>[] = [
    {
      field: "name",
      headerName: "Campaign",
      flex: 1.4,
      minWidth: 200,
      // A real link: rows open from the keyboard and in a new tab, not only by mouse click.
      renderCell: ({ row }) => (
        <MuiLink component={Link} to={`/campaigns/${row.id}`} underline="hover" fontWeight={600}>
          {row.name}
        </MuiLink>
      ),
    },
    {
      field: "status",
      headerName: "Status",
      width: 120,
      renderCell: ({ row }) => <Chip size="small" color={STATUS_COLOR[row.status]} label={row.status.toLowerCase()} />,
    },
    { field: "brands", headerName: "Brands", flex: 1, minWidth: 160, sortable: false, valueGetter: (_, row) => row.brands.map((b) => b.name).join(", ") },
    { field: "startsAt", headerName: `Starts (${me.timeZone})`, width: 190, valueFormatter: (v: string) => formatInZone(v, me.timeZone) },
    { field: "endsAt", headerName: "Ends", width: 190, valueFormatter: (v: string) => formatInZone(v, me.timeZone) },
    {
      field: "prizePool",
      headerName: "Prize pool",
      width: 130,
      sortable: false,
      align: "right",
      headerAlign: "right",
      valueGetter: (_, row) => money(row.prizePool, row.currency),
    },
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap>
        <Typography variant="h5" component="h1" fontWeight={700} sx={{ flex: 1 }}>Campaigns</Typography>
        <TextField size="small" type="search" label="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} id="search" />
        <TextField
          size="small"
          select
          label="Status"
          value={params.status}
          onChange={(e) => update({ status: e.target.value, page: 0 })}
          sx={{ minWidth: 140 }}
          id="status"
        >
          <MenuItem value="">All</MenuItem>
          {CAMPAIGN_STATUSES.map((s) => (
            <MenuItem key={s} value={s}>{s.toLowerCase()}</MenuItem>
          ))}
        </TextField>
        {me.role !== "VIEWER" && (
          <Button variant="contained" component={Link} to="/campaigns/new">New campaign</Button>
        )}
      </Stack>

      <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">
        {list.isPending ? "Loading campaigns…" : list.data ? `${list.data.total} campaign${list.data.total === 1 ? "" : "s"}${filtered ? " match" : ""}` : ""}
      </Typography>

      {list.isError ? (
        <Alert
          severity="error"
          action={<Button color="inherit" size="small" onClick={() => void list.refetch()}>Retry</Button>}
        >
          Couldn't load campaigns: {list.error.message}
        </Alert>
      ) : (
        <DataGrid
          autoHeight
          aria-label="Campaigns"
          rows={list.data?.rows ?? []}
          rowCount={list.data?.total ?? 0}
          columns={columns}
          loading={list.isFetching}
          paginationMode="server"
          sortingMode="server"
          paginationModel={{ page: params.page, pageSize: params.pageSize }}
          onPaginationModelChange={(m) => update({ page: m.pageSize === params.pageSize ? m.page : 0, pageSize: m.pageSize })}
          sortModel={[{ field: params.sort, sort: params.dir }]}
          onSortModelChange={(m) => update({ sort: m[0]?.field ?? "startsAt", dir: m[0]?.sort ?? "desc", page: 0 })}
          pageSizeOptions={PAGE_SIZES}
          disableRowSelectionOnClick
          localeText={{ noRowsLabel: filtered ? "No campaigns match these filters" : "No campaigns yet" }}
        />
      )}
    </Stack>
  );
}
