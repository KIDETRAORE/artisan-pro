// apps/frontend/src/pages/Invoices.tsx
import React from "react";
import { Navigate } from "react-router-dom";

export default function Invoices() {
  return <Navigate to="/sales-invoices" replace />;
}