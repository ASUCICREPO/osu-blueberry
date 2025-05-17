import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import theme from "./theme";
import { ThemeProvider } from "@mui/material/styles";
import Grid from "@mui/material/Grid";
import AppHeader from "./Components/AppHeader";
import LeftNav from "./Components/LeftNav";
import ChatHeader from "./Components/ChatHeader";
import ChatBody from "./Components/ChatBody";
import { LanguageProvider } from "./utilities/LanguageContext";
import LandingPage from "./Components/LandingPage";
import { useCookies } from "react-cookie";
import { ALLOW_LANDING_PAGE } from "./utilities/constants";
import { TranscriptProvider } from "./utilities/TranscriptContext";
import AdminLogin from "./Components/AdminLogin";
import AdminDashboard from "./Components/AdminDashboard";
import ManageDocuments from "./Components/ManageDocuments";
import AdminApp from "./Components/AdminMain";
import AdminAnalytics from "./Components/AdminAnalytics";
import "leaflet/dist/leaflet.css";
import RequireAdminAuth from "./utilities/RequireAdminAuth";



function MainApp() {
  const [showLeftNav, setLeftNav] = useState(true);

  return (
    <Grid container direction="column" justifyContent="center" alignItems="stretch" className="appHeight100 appHideScroll">
      <Grid item>
        <AppHeader showSwitch={false} />
      </Grid>
      <Grid item container direction="row" justifyContent="flex-start" alignItems="stretch" className="appFixedHeight100">
        <Grid item xs={showLeftNav ? 3 : 0.5} sx={{ backgroundColor: (theme) => theme.palette.background.chatLeftPanel }}>
          <LeftNav showLeftNav={showLeftNav} setLeftNav={setLeftNav} />
        </Grid>
        <Grid
          container
          item
          xs={showLeftNav ? 9 : 11.5}
          direction="column"
          justifyContent="flex-start"
          alignItems="stretch"
          className="appHeight100"
          sx={{
            padding: { xs: "1.5rem", md: "1.5rem 5%", lg: "1.5rem 10%", xl: "1.5rem 10%" },
            backgroundColor: (theme) => theme.palette.background.chatBody,
          }}
        >
          <Grid item>
            <ChatHeader />
          </Grid>
          <Grid
            container
            item
            direction="row"
            justifyContent={"center"}
            alignItems="flex-end"
            sx={{
              height: { xs: "calc(100% - 2.625rem)", md: "calc(100% - 2.625rem)", lg: "calc(100% - 2.625rem)", xl: "calc(100% - 2.625rem)" },
            }}
          >
            <ChatBody />
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
}
// TitleUpdater component to handle dynamic title based on the route
function TitleUpdater() {
  const location = useLocation();

  useEffect(() => {
    let title = "Blueberry Chat Assistant"; // Default title

    // Check if the path starts with "/admin"
    if (location.pathname.startsWith("/admin")) {
      title = "Blueberry Bot Admin Portal"; // Set title for any admin page
    }

    document.title = title; // Set the document title
  }, [location.pathname]); // Re-run on path change

  return null; // This component does not render anything to the DOM
}

function App() {
  const [cookies] = useCookies(["language"]);
  const languageSet = Boolean(cookies.language);
  const [locationPermission, setLocationPermission] = useState(null); // Track permission status

  return (
    <LanguageProvider>
      <TranscriptProvider>
        <ThemeProvider theme={theme}>
          <Router>
          <TitleUpdater /> 
            <Routes>
              <Route path="/" element={<MainApp />} />
              <Route path="/admin" element={<AdminApp />} />
              <Route path="/admin-login" element={<AdminLogin />} />
              <Route
    path="/admin-dashboard"
    element={
      <RequireAdminAuth>
        <AdminDashboard />
      </RequireAdminAuth>
    }
  />
  <Route
    path="/admin-documents"
    element={
      <RequireAdminAuth>
        <ManageDocuments />
      </RequireAdminAuth>
    }
  />
  <Route
    path="/admin-analytics"
    element={
      <RequireAdminAuth>
        <AdminAnalytics />
      </RequireAdminAuth>
    }
  />
            </Routes>
          </Router>
        </ThemeProvider>
      </TranscriptProvider>
    </LanguageProvider>
  );
}

export default App;
