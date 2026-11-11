import { Alert, Box, Card, CardActionArea, CardContent, Chip, Container, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, session } from "../api";

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
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Typography variant="h4" fontWeight={700}>Podium</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3, maxWidth: "65ch" }}>
        A back office for leaderboard promotions across a retailer's brands. Pick a demo user: each one sees a different
        slice of the data, in their own time zone.
      </Typography>
      {users.isError && <Alert severity="error">Demo sign-in isn't available right now.</Alert>}
      <Stack spacing={1.5}>
        {users.data?.map((u) => (
          <Card key={u.email} variant="outlined">
            <CardActionArea onClick={() => login.mutate(u.email)} disabled={login.isPending}>
              <CardContent sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
                <Box sx={{ flex: 1, minWidth: 220 }}>
                  <Typography fontWeight={600}>{u.name}</Typography>
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
  );
}
