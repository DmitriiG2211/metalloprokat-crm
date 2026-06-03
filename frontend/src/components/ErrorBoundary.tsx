import { Alert, Button, Paper, Stack, Typography } from "@mui/material";
import { Component, ErrorInfo, ReactNode } from "react";

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error", error, info);
  }

  componentDidUpdate(prevProps: { resetKey?: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <Paper className="glass-surface" sx={{ p: 3, m: 3, borderRadius: "8px" }} elevation={0}>
        <Stack spacing={2}>
          <Typography variant="h5">Раздел не открылся</Typography>
          <Alert severity="error">{this.state.error.message || "Неизвестная ошибка интерфейса"}</Alert>
          <Button variant="contained" onClick={() => this.setState({ error: null })}>
            Попробовать еще раз
          </Button>
        </Stack>
      </Paper>
    );
  }
}
