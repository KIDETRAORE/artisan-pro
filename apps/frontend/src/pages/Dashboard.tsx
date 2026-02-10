import { useEffect, useState } from "react";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import { useAuth } from "../store/auth.store";
import { API_URL } from "../config/api";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchWithAuth(`${API_URL}/dashboard`)
      .then((r) => r.json())
      .then((d) => setMessage(d.message))
      .catch(console.error);
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <p>{message}</p>
      <p>{user?.email}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
