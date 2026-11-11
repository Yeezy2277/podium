import { AppBar, Box, Button, Chip, Container, Link as MuiLink, Stack, Toolbar, Typography } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, lazy, Suspense, useContext } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, session, type Me } from "./api";
import { ErrorBoundary } from "./ErrorBoundary";
import { Loading, SkipLink } from "./ui";
import { LoginPage } from "./pages/Login";

// Route-level splitting: the form and detail pages (and the grid inside them) load on demand.
const CampaignListPage = lazy(() => import("./pages/CampaignList").then((m) => ({ default: m.CampaignListPage })));
const CampaignDetailPage = lazy(() => import("./pages/CampaignDetail").then((m) => ({ default: m.CampaignDetailPage })));
const CampaignFormPage = lazy(() => import("./pages/CampaignForm").then((m) => ({ default: m.CampaignFormPage })));

export const MeContext = createContext<Me | null>(null);
export const useMe = () => {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe outside the signed-in shell");
  return me;
};

const ROLE_LABEL: Record<Me["role"], string> = { OWNER: "Owner", BRAND_MANAGER: "Brand manager", VIEWER: "Viewer" };

function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });

  if (me.isPending) return <Loading what="your account" />;
  if (me.isError) return <Navigate to="/login" replace />;

  const signOut = () => {
    session.set(null);
    qc.clear();
    navigate("/login");
  };

  return (
    <MeContext.Provider value={me.data}>
      <SkipLink />
      <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar sx={{ gap: 2, flexWrap: "wrap" }}>
          <Box component="nav" aria-label="Main" sx={{ display: "flex", alignItems: "baseline", gap: 2 }}>
            <Typography component={Link} to="/" sx={{ textDecoration: "none", color: "inherit", fontWeight: 800, fontSize: "1.25rem" }}>
              Podium
            </Typography>
            <Typography variant="body2" color="text.secondary">{me.data.tenant}</Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap aria-label="Signed in as">
            <Chip size="small" label={ROLE_LABEL[me.data.role]} />
            <Chip size="small" variant="outlined" label={`Time zone: ${me.data.timeZone}`} />
            <Typography variant="body2">{me.data.name}</Typography>
            <Button size="small" onClick={signOut}>Switch user</Button>
          </Stack>
        </Toolbar>
      </AppBar>
      <Container component="main" id="main" tabIndex={-1} maxWidth="lg" sx={{ py: 3, outline: "none" }}>
        {/* Keyed by path: navigating away from a crashed page clears the error. */}
        <ErrorBoundary key={location.pathname} area="page">
          <Suspense fallback={<Loading what="the page" />}>
            <Routes>
              <Route path="/" element={<CampaignListPage />} />
              <Route path="/campaigns/new" element={<CampaignFormPage />} />
              <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
              <Route path="/campaigns/:id/edit" element={<CampaignFormPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Container>
      <Container component="footer" maxWidth="lg" sx={{ pb: 4, color: "text.secondary", fontSize: 13 }}>
        Demo data · times shown in {me.data.timeZone} ·{" "}
        <MuiLink href="https://github.com/Yeezy2277/podium">source</MuiLink>
      </Container>
    </MeContext.Provider>
  );
}

/** Reads the session at render time of the route, not once when App first rendered. */
function RequireSession() {
  return session.get() ? <Shell /> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<RequireSession />} />
    </Routes>
  );
}
