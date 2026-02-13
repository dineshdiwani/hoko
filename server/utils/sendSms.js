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

module.exports = { sendOtpSms };
