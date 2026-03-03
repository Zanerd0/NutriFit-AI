import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const Signup = () => {
    const [formData, setFormData] = useState({fullname: "", email: "", password: "", role: "Consumer"});
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post("/auth/signup", formData);
            localStorage.setItem("user", JSON.stringify(response.data));
            navigate("/dashboard");
        }
        catch (err) {
            setError(err.response?.data?.error) || "Signup failed";
        }
    };

    return (
        <div style = {{ padding: "2rem", maxWidth:"400px", margin: "0 auto"}}>
            <h2>Sign Up</h2>
            {error && <p style={{color: "red"}}>{error}</p>}
            <form onSubmit={handleSubmit} style={{display: "flex", flexDirection: "column", gap: "1rem"}}>
                <input
                type = "text" placeholder="Full Name" required
                onChange={(e) => setFormData({...formData, fullname: e.target.value})}
                />
                
                <input 
                type="email" placeholder="Email" required
                onChange={(e) => setFormData({...formData, email: e.target.value})} 
                />
                
                <input 
                type="password" placeholder="Password" required
                onChange={(e) => setFormData({...formData, password: e.target.value})} 
                />
                <select onChange={(e) => setFormData({...formData, role:e.target.value})}>
                    <option value="Consumer">Consumer</option>
                    <option value="Dietician">Dietician</option>
                    <option value="Instructor">Instructor</option>
                </select>
                <button type ="submit">Sign Up</button>
            </form>
            <p>Already have an account? <Link to="/login">Login here</Link></p>
        </div>
    );
};

export default Signup;