// const fetch = require('node-fetch');
import fetch from "node-fetch";

// 🟢 1. PASTE YOUR TOKEN HERE
const YOUR_TOKEN = "ExponentPushToken[wn_oQXN1pPcJvu-d9oltsn]";

async function sendTestNotification() {
  console.log("🔔 Attempting to send test notification to Expo servers...");

  const message = {
    to: YOUR_TOKEN,
    sound: 'default',
    title: 'Test Notification 🚀',
    body: 'If you see this, your development build is working!',
    data: { 
      screen: "complaint-details", 
      complaintId: "test-123" 
    },
  };

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log("✅ Expo Response:", JSON.stringify(result, null, 2));

    if (result.data && result.data.status === 'ok') {
      console.log("\n🚀 SUCCESS! Check your Realme mobile now.");
    } else {
      console.log("\n❌ FAILED: Check the error in the response above.");
    }
  } catch (error) {
    console.error("❌ Network Error:", error);
  }
}

sendTestNotification();