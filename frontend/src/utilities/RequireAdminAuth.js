// src/utilities/RequireAdminAuth.js
import React from "react";
import { Navigate, useLocation } from "react-router-dom";

export default function RequireAdminAuth({ children }) {
  const token = localStorage.getItem("accessToken");
  const location = useLocation();

  // If no token found, redirect to login, preserving where we came from
  if (!token) {
    return <Navigate to="/admin-login" state={{ from: location }} replace />;
  }

  // Otherwise render the protected page
  return children;
}
