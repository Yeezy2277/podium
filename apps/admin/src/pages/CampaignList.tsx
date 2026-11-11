import { Button, Chip, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { DataGrid, type GridColDef, type GridPaginationModel, type GridSortModel } from "@mui/x-data-grid";
import { CAMPAIGN_STATUSES, type CampaignRow } from "@podium/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useMe } from "../App";
import { STATUS_COLOR, formatInZone, money } from "../format";

export function CampaignListPage() {
  const me = useMe();
  const navigate = useNavigate();
  const [paging, setPaging] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });
  const [sort, setSort] = useState<GridSortModel>([{ field: "startsAt", sort: "desc" }]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  // Debounce the search box: one request per pause, not per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  // A new filter starts from the first page; staying on page 4 of a 1-page result shows nothing.
  useEffect(() => setPaging((p) => ({ ...p, page: 0 })), [status, q]);

  const params = { ...paging, sort: sort[0]?.field, dir: sort[0]?.sort ?? "desc", status, q } as const;
  const list = useQuery({ queryKey: ["campaigns", params], queryFn: () => api.campaigns(params), placeholderData: keepPreviousData });

  const columns: GridColDef<CampaignRow>[] = [
    { field: "name", headerName: "Campaign", flex: 1.4, minWidth: 200 },
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
        <Typography variant="h5" fontWeight={700} sx={{ flex: 1 }}>Campaigns</Typography>
        <TextField size="small" label="Search" value={search} onChange={(e) => setSearch(e.target.value)} id="search" />
        <TextField size="small" select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 140 }} id="status">
          <MenuItem value="">All</MenuItem>
          {CAMPAIGN_STATUSES.map((s) => (
            <MenuItem key={s} value={s}>{s.toLowerCase()}</MenuItem>
          ))}
        </TextField>
        {me.role !== "VIEWER" && (
          <Button variant="contained" component={Link} to="/campaigns/new">New campaign</Button>
        )}
      </Stack>
      <DataGrid
        autoHeight
        rows={list.data?.rows ?? []}
        rowCount={list.data?.total ?? 0}
        columns={columns}
        loading={list.isFetching}
        paginationMode="server"
        sortingMode="server"
        paginationModel={paging}
        onPaginationModelChange={setPaging}
        sortModel={sort}
        onSortModelChange={(m) => {
          setSort(m);
          setPaging((p) => ({ ...p, page: 0 }));
        }}
        pageSizeOptions={[10, 25, 50]}
        disableRowSelectionOnClick
        onRowClick={({ row }) => navigate(`/campaigns/${row.id}`)}
        sx={{ "& .MuiDataGrid-row": { cursor: "pointer" } }}
        localeText={{ noRowsLabel: q || status ? "No campaigns match these filters" : "No campaigns yet" }}
      />
    </Stack>
  );
}
