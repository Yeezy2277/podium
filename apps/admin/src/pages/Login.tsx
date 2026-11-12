import { Alert, Box, Card, CardActionArea, CardContent, Chip, Container, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, session } from "../api";
import { SkipLink } from "../ui";
import { PodiumMark } from "../brand";
import { FONT_NARROW, tokens } from "../theme";

const WHAT_TO_TRY: Record<string, string> = {
  OWNER: "Sees every brand of the tenant; can create, schedule and cancel anything.",
  BRAND_MANAGER: "Manages one brand. Sees multi-brand campaigns that include it, but can't edit them.",
  VIEWER: "Read-only. Every write is refused by the API, not just hidden in the UI.",
};

export function LoginPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["demo-users"], queryFn: api.demoUsers });
  const login = useMutation({
    mutationFn: api.demoLogin,
    onSuccess: ({ token }) => {
      session.set(token);
      qc.clear();
      navigate("/");
    },
  });

  return (
    <>
    <SkipLink />
    {/* Sign-in is the one atmospheric surface: a navy stage with the podium on it. */}
    <Box
      component="header"
      sx={{
        bgcolor: tokens.navy,
        color: "#fff",
        borderBottom: `4px solid ${tokens.gold}`,
        backgroundImage: `radial-gradient(120% 140% at 85% 0%, rgba(227,179,65,0.22), transparent 55%), repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 48px)`,
      }}
    >
      <Container maxWidth="md" sx={{ py: { xs: 5, sm: 8 }, display: "flex", gap: 3, alignItems: "flex-end", flexWrap: "wrap" }}>
        <PodiumMark size={84} />
        <Box>
          <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: "3rem", sm: "4.5rem" }, lineHeight: 0.9, letterSpacing: "-0.04em" }}>
            Podium
          </Typography>
          <Typography sx={{ fontFamily: FONT_NARROW, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 500, mt: 1.5, color: "rgba(255,255,255,0.8)" }}>
            Leaderboard promotions back office
          </Typography>
        </Box>
      </Container>
    </Box>
    <Container component="main" id="main" tabIndex={-1} maxWidth="md" sx={{ py: 5, outline: "none" }}>
      <Typography color="text.secondary" sx={{ mb: 3, maxWidth: "65ch" }}>
        A back office for leaderboard promotions across a retailer's brands. Pick a demo user: each one sees a different
        slice of the data, in their own time zone.
      </Typography>
      {users.isPending && <Typography role="status" color="text.secondary">Loading demo users…</Typography>}
      {users.isError && (
        <Alert severity="error">
          Demo sign-in isn't available right now ({users.error.message}). Reload the page in a moment.
        </Alert>
      )}
      {login.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Couldn't sign in: {login.error.message}
        </Alert>
      )}
      <Typography variant="overline" component="h2" sx={{ display: "block", mb: 1, color: "text.secondary" }}>Sign in as</Typography>
      <Stack spacing={1.5}>
        {users.data?.map((u) => (
          <Card key={u.email} variant="outlined" sx={{ transition: "border-color .15s", "&:hover, &:focus-within": { borderColor: "secondary.main" } }}>
            <CardActionArea onClick={() => login.mutate(u.email)} disabled={login.isPending}>
              <CardContent sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
                <Box sx={{ flex: 1, minWidth: 220 }}>
                  <Typography component="h3" fontWeight={600}>{u.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{WHAT_TO_TRY[u.role]}</Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" label={u.tenant} />
                  <Chip size="small" label={u.role.replace("_", " ").toLowerCase()} />
                  <Chip size="small" variant="outlined" label={u.timeZone} />
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
    </Container>
    </>
  );
}
