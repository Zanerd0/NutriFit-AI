import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "../api/axios"; // Use the configured instance (withCredentials: true)

const Signup = () => {
    // FIX 2: Changed "fullname" to "full_name" to match backend Schema
    const [formData, setFormData] = useState({ full_name: "", email: "", password: "", role: "Consumer" });
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Use /auth/signup (baseURL already set to http://localhost:5000/api)
            const response = await axios.post("/auth/signup", formData);
            
            // Assuming your backend sends the user data back
            localStorage.setItem("user", JSON.stringify(response.data));
            
            // Redirect based on role — Admins go to /admin
            if (response.data.role === "Admin") {
                navigate("/admin");
            } else {
                navigate("/dashboard");
            }
        }
        catch (err) {
            // FIX 3: Fixed the syntax for the fallback error message
            setError(err.response?.data?.error || "Signup failed. Please try again.");
            console.error("Signup Error:", err); // Added this so you can see exact errors in the console!
        }
    };

    return (
        <div style={{ padding: "2rem", maxWidth: "400px", margin: "0 auto" }}>
            <h2>Sign Up</h2>
            {error && <p style={{ color: "red" }}>{error}</p>}
            
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <input
                    type="text" 
                    placeholder="Full Name" 
                    required
                    // FIX 2: Updated to full_name
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                />
                
                <input
                    type="email" 
                    placeholder="Email" 
                    required
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                
                <input
                    type="password" 
                    placeholder="Password" 
                    required
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                
                <select onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                    <option value="Consumer">Consumer</option>
                    <option value="Dietician">Dietician</option>
                    <option value="Instructor">Instructor</option>
                </select>
                
                <button type="submit">Sign Up</button>
            </form>
            
            <p>Already have an account? <Link to="/login">Login here</Link></p>
        </div>
    );
};

export default Signup;