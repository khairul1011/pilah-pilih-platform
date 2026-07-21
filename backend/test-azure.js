const run = async () => {
    try {
        // Register a temporary user
        const rand = Math.floor(Math.random() * 100000);
        const email = `testuser${rand}@example.com`;
        const regRes = await fetch('https://backend-production-f1e1.up.railway.app/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Test User', email, password: 'password123', phone: '08123456789' })
        });
        const regData = await regRes.json();
        
        if (!regData.success) {
            console.log("Register failed:", regData);
            process.exit();
        }
        
        // Login
        const loginRes = await fetch('https://backend-production-f1e1.up.railway.app/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: 'password123' })
        });
        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log("Logged in!");

        // Try to send a message
        const response = await fetch('https://backend-production-f1e1.up.railway.app/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ pickup_id: null, receiver_id: 7, message: "hai dari test" })
        });
        const data = await response.json();
        console.log("Message send Status:", response.status);
        console.log("Message send Data:", data);
    } catch(err) {
        console.log("Fetch Error:", err);
    }
    process.exit();
};
run();
