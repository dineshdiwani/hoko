const otpMap = new Map();

function setOtp(mobile, otp) {
  otpMap.set(mobile, otp);
}

function getOtp(mobile) {
  return otpMap.get(mobile);
}

function clearOtp(mobile) {
  otpMap.delete(mobile);
}

module.exports = {
  setOtp,
  getOtp,
  clearOtp
};
