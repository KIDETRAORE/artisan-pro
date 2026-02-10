import { useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth.store";

export default function Login() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);

  const handleLogin = async () => {
    try {
      await login("new@test.com", "password123");
      navigate("/dashboard");
    } catch {
      alert("Erreur de connexion");
    }
  };

  return (
    <div>
      <h1>Login</h1>
      <button onClick={handleLogin}>Se connecter</button>
    </div>
  );
}



