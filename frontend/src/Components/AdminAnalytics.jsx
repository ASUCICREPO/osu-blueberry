import React, { useState, useEffect } from "react";
import {
  Box,
  Grid,
  Typography,
  Divider,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Card,
} from "@mui/material";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import axios from "axios";

import AdminAppHeader from "./AdminAppHeader";
import { DOCUMENTS_API } from "../utilities/constants";     // base URL for both APIs
import { getIdToken } from "../utilities/auth";             // helper you already use elsewhere

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const ANALYTICS_API = `${DOCUMENTS_API}session-logs`;       // …/prod/session-logs

const defaultCategories = [
  "Chemical Registrations and MRL's",
  "Disease",
  "Economics",
  "Field Establishment",
  "Harvest",
  "Insects",
  "Irrigation",
  "Nutrition",
  "Pest Management Guide",
  "Pollination",
  "Post Harvest Handling, Cold Chain",
  "Production",
  "Pruning",
  "Sanitation",
  "Varietal Information",
  "Weeds",
  "Unknown",
];

const locationCoordinates = {
  Texas: [31.9686, -99.9018],
  Tempe: [33.4255, -111.94],
  Seattle: [47.6062, -122.3321],
  "New York": [40.7128, -74.006],
  California: [36.7783, -119.4179],
};

const redPin = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [0, -41],
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  shadowSize: [41, 41],
});

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function AdminAnalytics() {
  const [timeframe, setTimeframe]     = useState("today");
  const [categoryCounts, setCounts]   = useState({});
  const [locations, setLocations]     = useState([]);
  const [userCount, setUserCount]     = useState(0);

  /* --------------------------- data fetch -------------------------- */
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const token = await getIdToken();

        const { data } = await axios.get(ANALYTICS_API, {
          params : { timeframe },
          headers: { Authorization: `Bearer ${token}` },
        });

        /* normalise categories so every default shows up */
        const counts = {};
        defaultCategories.forEach((c) => (counts[c] = data.categories?.[c] || 0));

        setCounts(counts);
        setLocations(data.locations || []);
        setUserCount(data.user_count || 0);
      } catch (err) {
        console.error("Analytics fetch failed:", err);
      }
    };

    fetchAnalytics();
  }, [timeframe]);

  /* ------------------------------ UI ------------------------------- */
  return (
    <Box sx={{ minHeight: "100vh" }}>
      {/* Fixed header */}
      <Box sx={{ position: "fixed", width: "100%", zIndex: 1200 }}>
        <AdminAppHeader showSwitch={false} />
      </Box>

      <Grid
        container
        sx={{
          flex: 1,
          paddingTop: "6rem", // below header
          paddingX:  "2rem",
        }}
      >
        {/* ───────────────── Left column ───────────────── */}
        <Grid item xs={6} sx={{ padding: "2rem" }}>
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            Choose Timeframe:
          </Typography>

          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel />
            <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              <MenuItem value="today">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="yearly">Yearly</MenuItem>
            </Select>
          </FormControl>

          {/* Category cards */}
          <Grid container spacing={2}>
            {Object.entries(categoryCounts).map(([text, count]) => (
              <Grid item xs={6} key={text}>
                <Card
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    p: 1,
                    backgroundColor: "#D3D3D3",
                    boxShadow: "none",
                  }}
                >
                  <Box
                    sx={{
                      width:  "60%",
                      height: "50px",
                      backgroundColor: "#FFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Typography variant="body2" align="center">
                      {text}
                    </Typography>
                  </Box>
                  <Box sx={{ pl: 2 }}>
                    <Typography variant="caption">Questions Asked</Typography>
                    <Typography variant="h5">{count}</Typography>
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>

        {/* Divider */}
        <Divider orientation="vertical" flexItem sx={{ borderColor: "#D3D3D3", ml: 5 }} />

        {/* ───────────────── Right column ───────────────── */}
        <Grid item xs={5} sx={{ p: "2rem" }}>
          <Typography variant="h6" gutterBottom>
            Grower Location:
          </Typography>

          {/* Map */}
          <MapContainer
            center={[39.8283, -98.5795]}
            zoom={4}
            style={{ height: "600px", width: "100%" }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {locations.map((loc) => {
              const pos = locationCoordinates[loc];
              return (
                pos && (
                  <Marker position={pos} icon={redPin} key={loc}>
                    <Popup>{loc}</Popup>
                  </Marker>
                )
              );
            })}
          </MapContainer>

          {/* User count */}
          <Box sx={{ textAlign: "center", mt: 3 }}>
            <Typography variant="h6">User Count</Typography>
            <Typography variant="h4">{userCount}</Typography>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}