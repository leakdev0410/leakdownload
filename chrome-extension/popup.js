// popup.js - Test connection via background service worker
document.getElementById("testBtn").addEventListener("click", () => {
  const result = document.getElementById("result");
  result.textContent = "Đang kiểm tra...";
  chrome.runtime.sendMessage({ type: "ping" }, (response) => {
    if (chrome.runtime.lastError) {
      result.textContent = "❌ Extension lỗi: " + chrome.runtime.lastError.message;
    } else if (response && response.ok) {
      result.textContent = "✅ App đang chạy! Port 19876 OK.";
    } else {
      result.textContent = "❌ Không kết nối được app. Hãy mở leakdownload.";
    }
  });
});
