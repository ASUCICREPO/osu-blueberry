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
import Logo from "../Assets/logo.svg";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { ANALYTICS_API } from "../utilities/constants"; // Adjust path as needed
import axios from "axios";
import AdminAppHeader from "./AdminAppHeader";

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

// Location coordinates fallback (you can improve accuracy later)
const locationCoordinates = {
  Texas: [31.9686, -99.9018],
  Tempe: [33.4255, -111.9400],
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

function AdminAnalytics() {
  const [timeframe, setTimeframe] = useState("today");
  const [categoryCounts, setCategoryCounts] = useState({});
  const [locations, setLocations] = useState([]);
  const [userCount, setUserCount] = useState(0);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        console.log("Sending request with parameter ->", timeframe);
        const response = await axios.get(ANALYTICS_API, {
          params: {
            timeframe: timeframe,
          },
        });
        console.log(`Raw Response: ${response}`);
        const { categories = {}, locations = [], user_count = 0 } = response.data;
  
        const counts = {};
        defaultCategories.forEach((cat) => {
          counts[cat] = categories[cat] || 0;
        });
  
        setCategoryCounts(counts);
        setLocations(locations);
        setUserCount(user_count);
      } catch (error) {
        console.error("Failed to fetch analytics data:", error);
      }
    };
  
    fetchAnalytics();
  }, [timeframe]); // 👈 Add timeframe here
  

  return (
    <Box sx={{ minHeight: "100vh" }}>
      {/* Fixed App Header */}
      <Box sx={{ position: "fixed", width: "100%", zIndex: 1200 }}>
        <AdminAppHeader showSwitch={false} />
      </Box>

      {/* Main Content */}
      <Grid
      container
      sx={{
        flex: 1,
        paddingTop: "6rem", // push content below the fixed header
        paddingX: "2rem",
      }}
    >        {/* Left Side Content */}
        <Grid item xs={6} sx={{ padding: "2rem" }}>
          {/* Timeframe Selector */}
          <Typography variant="body2" sx={{ marginBottom: "0.5rem" }}>
            Choose Timeframe:
          </Typography>
          <FormControl fullWidth sx={{ marginBottom: "1.5rem" }}>
            <InputLabel> </InputLabel>
            <Select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
            >
              <MenuItem value="today">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="yearly">Yearly</MenuItem>
            </Select>
          </FormControl>

          {/* Category Data Blocks */}
          <Grid container spacing={2}>
            {Object.entries(categoryCounts).map(([text, count], index) => (
              <Grid item xs={6} key={index}>
                <Card
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0.5rem",
                    backgroundColor: "#D3D3D3",
                    boxShadow: "none",
                  }}
                >
                  <Box
                    sx={{
                      width: "60%",
                      height: "50px",
                      backgroundColor: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Typography variant="body2" align="center">{text}</Typography>
                  </Box>
                  <Box sx={{ paddingLeft: "1rem", flex: 1 }}>
                    <Typography variant="caption">Questions Asked</Typography>
                    <Typography variant="h5">{count}</Typography>
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>

        {/* Divider */}
        <Divider
          orientation="vertical"
          flexItem
          sx={{ borderColor: "#D3D3D3", marginLeft: "5rem" }}
        />

        {/* Right Side Content */}
        <Grid item xs={5} sx={{ padding: "2rem" }}>
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
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {locations.map((loc, i) => {
              const position = locationCoordinates[loc];
              return (
                position && (
                  <Marker position={position} icon={redPin} key={i}>
                    <Popup>{loc}</Popup>
                  </Marker>
                )
              );
            })}
          </MapContainer>

          {/* User Count */}
          <Box sx={{ textAlign: "center", marginTop: "1.5rem" }}>
            <Typography variant="h6">User Count</Typography>
            <Typography variant="h4">{userCount}</Typography>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}

export default AdminAnalytics;