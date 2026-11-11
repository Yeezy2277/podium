import { AppBar, Box, Button, Chip, CircularProgress, Container, Stack, Toolbar, Typography } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, session, type Me } from "./api";
import { CampaignDetailPage } from "./pages/CampaignDetail";
import { CampaignFormPage } from "./pages/CampaignForm";
import { CampaignListPage } from "./pages/CampaignList";
import { LoginPage } from "./pages/Login";

const MeContext = createContext<Me | null>(null);
export const useMe = () => {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe outside the signed-in shell");
  return me;
};

const ROLE_LABEL: Record<Me["role"], string> = { OWNER: "Owner", BRAND_MANAGER: "Brand manager", VIEWER: "Viewer" };

function Shell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });

  if (me.isPending) return <CircularProgress sx={{ m: 4 }} />;
  if (me.isError) return <Navigate to="/login" replace />;

  const signOut = () => {
    session.set(null);
    qc.clear();
    navigate("/login");
  };

  return (
    <MeContext.Provider value={me.data}>
      <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar sx={{ gap: 2, flexWrap: "wrap" }}>
          <Typography component={Link} to="/" variant="h6" sx={{ textDecoration: "none", color: "inherit", fontWeight: 700 }}>
            Podium
          </Typography>
          <Typography variant="body2" color="text.secondary">{me.data.tenant}</Typography>
          <Box sx={{ flex: 1 }} />
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" label={ROLE_LABEL[me.data.role]} />
            <Chip size="small" variant="outlined" label={me.data.timeZone} title="Dates are shown and entered in this time zone" />
            <Typography variant="body2">{me.data.name}</Typography>
            <Button size="small" onClick={signOut}>Switch user</Button>
          </Stack>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Routes>
          <Route path="/" element={<CampaignListPage />} />
          <Route path="/campaigns/new" element={<CampaignFormPage />} />
          <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
          <Route path="/campaigns/:id/edit" element={<CampaignFormPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Container>
    </MeContext.Provider>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={session.get() ? <Shell /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
