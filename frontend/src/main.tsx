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
      primary: { main: "#0877ee", dark: "#0055c8", light: "#ddebff" },
      secondary: { main: "#0f9cff", dark: "#0877ee", light: "#e7f4ff" },
      background: { default: "#edf5ff", paper: "rgba(255,255,255,0.72)" },
      success: { main: "#24885c", light: "#ddf6ea" },
      warning: { main: "#b47512", light: "#fff0cc" },
      error: { main: "#ba4250", light: "#ffe1e5" },
      text: { primary: "#102033", secondary: "#5b6d83" }
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
            background:
              "linear-gradient(135deg, rgba(237,245,255,0.98) 0%, rgba(249,252,255,0.98) 42%, rgba(229,241,255,0.98) 100%)"
          }
        }
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            minHeight: 42,
            borderRadius: 14,
            fontWeight: 800,
            letterSpacing: 0,
            transition: "transform 160ms ease, box-shadow 160ms ease, background 160ms ease, border-color 160ms ease",
            "&:hover": { transform: "translateY(-1px)" },
            "&:focus-visible": {
              outline: "3px solid rgba(8, 119, 238, 0.32)",
              outlineOffset: 3
            }
          },
          contained: {
            color: "#ffffff",
            background: "linear-gradient(135deg, rgba(8,119,238,0.98), rgba(15,156,255,0.94))",
            boxShadow: "0 18px 38px rgba(8, 119, 238, 0.24), inset 0 1px 0 rgba(255,255,255,0.32)",
            "&:hover": {
              boxShadow: "0 22px 48px rgba(8, 119, 238, 0.30), inset 0 1px 0 rgba(255,255,255,0.4)"
            }
          },
          outlined: {
            borderColor: "rgba(255,255,255,0.74)",
            background: "linear-gradient(145deg, rgba(255,255,255,0.76), rgba(255,255,255,0.46))",
            backdropFilter: "blur(20px) saturate(1.2)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.90), 0 12px 30px rgba(30, 57, 63, 0.10)"
          }
        }
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            border: "1px solid rgba(255,255,255,0.66)",
            boxShadow: "0 24px 70px rgba(13, 67, 142, 0.12)",
            backdropFilter: "blur(26px) saturate(1.16)"
          }
        }
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              borderRadius: 14,
              background: "rgba(255,255,255,0.72)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
              "& fieldset": { borderColor: "rgba(22, 61, 66, 0.14)" },
              "&:hover fieldset": { borderColor: "rgba(8, 119, 238, 0.38)" },
              "&.Mui-focused fieldset": { borderColor: "rgba(8, 119, 238, 0.64)" }
            }
          }
        }
      },
      MuiTableCell: {
        styleOverrides: {
          root: { whiteSpace: "nowrap", borderBottom: "1px solid rgba(38, 62, 66, 0.08)" },
          head: { color: "#53676a", fontSize: 11.5, fontWeight: 850, textTransform: "uppercase" }
        }
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            background: "rgba(255,255,255,0.52)",
            backdropFilter: "blur(30px) saturate(1.18)"
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
            borderRadius: 12,
            "&.Mui-selected": {
              color: "#fff",
              background: "linear-gradient(135deg, #0877ee, #0f9cff)"
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
