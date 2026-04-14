const axios = require("axios");

async function sendOtpSms({ mobile, otp }) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    throw new Error("FAST2SMS_API_KEY not set");
  }

  const payload = {
    variables_values: String(otp),
    route: "otp",
    numbers: String(mobile)
  };

  const res = await axios.post(
    "https://www.fast2sms.com/dev/bulkV2",
    payload,
    {
      headers: {
        authorization: apiKey
      },
      timeout: 10000
    }
  );

  if (!res.data || res.data.return !== true) {
    const msg =
      (res.data && res.data.message && res.data.message[0]) ||
      "Fast2SMS send failed";
    throw new Error(msg);
  }

  return true;
}

async function sendBulkSms({ numbers, message }) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    throw new Error("FAST2SMS_API_KEY not set");
  }

  if (!Array.isArray(numbers) || numbers.length === 0) {
    throw new Error("At least one mobile number required");
  }

  if (!message || typeof message !== "string" || !message.trim()) {
    throw new Error("Message is required");
  }

  const results = {
    total: numbers.length,
    sent: 0,
    failed: 0,
    failures: []
  };

  const validNumbers = numbers
    .map((n) => {
      const cleaned = String(n || "").replace(/[^\d+]/g, "");
      if (cleaned.length >= 10) {
        if (cleaned.startsWith("+")) {
          return cleaned;
        }
        if (cleaned.startsWith("91") && cleaned.length > 10) {
          return "+" + cleaned;
        }
        if (cleaned.length === 10) {
          return "+91" + cleaned;
        }
        return "+91" + cleaned;
      }
      return null;
    })
    .filter(Boolean);

  const uniqueNumbers = [...new Set(validNumbers)];

  for (const mobile of uniqueNumbers) {
    try {
      const mobileDigits = mobile.replace(/^\+/, "");
      const senderId = process.env.FAST2SMS_SENDER_ID;
      const payload = {
        message: message.trim(),
        route: "quick",
        numbers: mobileDigits,
        ...(senderId && { sender_id: senderId })
      };

      const res = await axios.post(
        "https://www.fast2sms.com/dev/bulkV2",
        payload,
        {
          headers: {
            authorization: apiKey
          },
          timeout: 15000
        }
      );

      console.log("[Fast2SMS] Response:", JSON.stringify(res.data));

      if (res.data && res.data.return === true) {
        results.sent++;
      } else {
        results.failed++;
        results.failures.push({
          mobile,
          reason: res.data?.message?.[0] || JSON.stringify(res.data)
        });
      }
    } catch (err) {
      const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.log("[Fast2SMS] Error:", errMsg);
      results.failed++;
      results.failures.push({
        mobile,
        reason: errMsg
      });
    }
  }

  return results;
}

module.exports = { sendOtpSms, sendBulkSms };