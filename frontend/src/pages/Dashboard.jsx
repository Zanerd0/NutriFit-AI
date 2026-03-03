import { useNavigate } from "react-router-dom";
import axios from "../api/axios";

const Dashboard = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));

  const handleLogout = async () => {
    try {
      await axios.post("/auth/logout");
      localStorage.removeItem("user");
      navigate("/login");
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h1>Dashboard</h1>
      <p>Hello, <strong>{user?.full_name}</strong>!</p>
      <p>You are logged in as a: <strong>{user?.role}</strong></p>
      
      <button onClick={handleLogout} style={{ marginTop: "2rem", padding: "0.5rem 1rem", background: "#ff4d4f", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
        Logout
      </button>
    </div>
  );
};

export default Dashboard;