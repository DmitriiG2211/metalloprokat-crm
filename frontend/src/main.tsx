import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { ruRU } from "@mui/material/locale";
import App from "./App";
import "./styles.css";

const queryClient = new QueryClient();

const theme = createTheme(
  {
    palette: {
      mode: "light",
      primary: { main: "#0877ee", dark: "#0057c8", light: "#e8f2ff" },
      secondary: { main: "#1f2937", dark: "#111827", light: "#f3f4f6" },
      background: { default: "#f7f8fa", paper: "#ffffff" },
      success: { main: "#16a34a", light: "#dcfce7" },
      warning: { main: "#d97706", light: "#fffbeb" },
      error: { main: "#dc2626", light: "#fee2e2" },
      text: { primary: "#1f2328", secondary: "#667085" }
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Arial, system-ui, sans-serif",
      button: { textTransform: "none", fontWeight: 700 },
      h4: { fontWeight: 850, letterSpacing: 0 },
      h5: { fontWeight: 850, letterSpacing: 0 },
      h6: { fontWeight: 850, letterSpacing: 0 }
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            background: "#f7f8fa"
          }
        }
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            minHeight: 36,
            borderRadius: 8,
            fontWeight: 800,
            letterSpacing: 0,
            transition: "background 120ms ease, border-color 120ms ease",
            "&:focus-visible": {
              outline: "3px solid rgba(8, 119, 238, 0.32)",
              outlineOffset: 3
            }
          },
          contained: {
            color: "#ffffff",
            background: "#0877ee",
            boxShadow: "0 1px 2px rgba(8, 119, 238, 0.18)",
            "&:hover": {
              background: "#0057c8",
              boxShadow: "0 2px 6px rgba(8, 119, 238, 0.20)"
            }
          },
          outlined: {
            borderColor: "#d0d5dd",
            background: "#ffffff"
          }
        }
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04)"
          }
        }
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              borderRadius: 8,
              background: "#ffffff",
              "& fieldset": { borderColor: "#d0d5dd" },
              "&:hover fieldset": { borderColor: "#98a2b3" },
              "&.Mui-focused fieldset": { borderColor: "#0877ee" }
            }
          }
        }
      },
      MuiTableCell: {
        styleOverrides: {
          root: { whiteSpace: "nowrap", borderBottom: "1px solid rgba(38, 62, 66, 0.08)" },
          head: { color: "#667085", fontSize: 11.5, fontWeight: 850, textTransform: "uppercase" }
        }
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            background: "#ffffff"
          }
        }
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            fontWeight: 800
          }
        }
      },
      MuiPaginationItem: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            "&.Mui-selected": {
              color: "#fff",
              background: "#0877ee"
            }
          }
        }
      }
    }
  },
  ruRU
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);
