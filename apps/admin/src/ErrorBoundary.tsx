import { Alert, Button } from "@mui/material";
import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; area: string };
type State = { error: Error | null };

/** A page that throws while rendering shows what happened and a retry, not a blank screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => this.setState({ error: null })}>
            Retry
          </Button>
        }
      >
        The {this.props.area} failed to render: {this.state.error.message}
      </Alert>
    );
  }
}
