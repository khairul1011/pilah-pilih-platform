const run = async () => {
    try {
        const rand = Math.floor(Math.random() * 100000);
        const email = `testuser${rand}@example.com`;
        
        const regRes = await fetch('http://localhost:5001/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Test User', email, password: 'password123', phone: '08123456789', role: 'user' })
        });
        
        const loginRes = await fetch('http://localhost:5001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: 'password123' })
        });
        const loginData = await loginRes.json();
        const token = loginData.token;

        const response = await fetch('http://localhost:5001/api/pickups/estimate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ 
                latitude: 0.5424, 
                longitude: 101.46731925, 
                waste_type: 'Besi', 
                estimated_weight: 10 
            })
        });
        const data = await response.json();
        console.log("Estimate Status:", response.status);
        console.log("Estimate Data:", data);
        
        if (data.success && data.distance_km) {
            const expectedFee = Math.round(data.distance_km * 1500);
            console.log(`Expected Fee: ${expectedFee}`);
            console.log(`Actual Fee: ${data.pickup_fee}`);
            if (expectedFee === data.pickup_fee) {
                console.log("✅ SUCCESS: Formula 1500/km works correctly.");
            } else {
                console.log("❌ FAILED: Formula 1500/km mismatch!");
            }
        }
    } catch(err) {
        console.log("Fetch Error:", err);
    }
    process.exit();
};
run();
