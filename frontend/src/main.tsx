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
      primary: { main: "#1267e8", dark: "#0b55c6", light: "#eaf2ff" },
      secondary: { main: "#172033", dark: "#0f172a", light: "#f4f7fb" },
      background: { default: "#f6f8fc", paper: "#ffffff" },
      success: { main: "#16a05d", light: "#e6f8ed" },
      warning: { main: "#d9821f", light: "#fff3e3" },
      error: { main: "#e22b3a", light: "#ffe8ea" },
      text: { primary: "#111827", secondary: "#667085" }
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
            background: "#f6f8fc"
          }
        }
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            minHeight: 36,
            borderRadius: 10,
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
            background: "linear-gradient(180deg, #1b74f2 0%, #0d5fdd 100%)",
            boxShadow: "0 10px 22px rgba(18, 103, 232, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.28)",
            "&:hover": {
              background: "linear-gradient(180deg, #2b82ff 0%, #0b55c6 100%)",
              boxShadow: "0 12px 26px rgba(18, 103, 232, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.34)"
            }
          },
          outlined: {
            borderColor: "#d8e0ec",
            background: "#ffffff"
          }
        }
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            border: "1px solid #dfe6f1",
            boxShadow: "0 10px 28px rgba(15, 23, 42, 0.04)"
          }
        }
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              borderRadius: 8,
              background: "#ffffff",
              "& fieldset": { borderColor: "#d8e0ec" },
              "&:hover fieldset": { borderColor: "#b8c4d8" },
              "&.Mui-focused fieldset": { borderColor: "#1267e8" }
            }
          }
        }
      },
      MuiTableCell: {
        styleOverrides: {
          root: { whiteSpace: "nowrap", borderBottom: "1px solid #edf1f7" },
          head: { color: "#667085", fontSize: 11.5, fontWeight: 850, textTransform: "none" }
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
              background: "#1267e8"
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
