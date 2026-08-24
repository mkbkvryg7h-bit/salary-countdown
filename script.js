const defaults = { salary: 15000, workdays: 22, start: "09:00", end: "18:00" };
const ids = ["salary", "workdays", "start", "end"];
let settings = { ...defaults };
try { settings = { ...defaults, ...JSON.parse(localStorage.getItem("offwork-settings") || "{}") }; } catch {}
for (const id of ids) {
  const input = document.getElementById(id);
  input.value = settings[id];
  input.addEventListener("input", () => {
    settings[id] = id === "start" || id === "end" ? input.value : Math.max(0, Number(input.value));
    localStorage.setItem("offwork-settings", JSON.stringify(settings));
    update();
  });
}
document.getElementById("settings").addEventListener("submit", event => event.preventDefault());
const money = value => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
const pad = value => String(Math.max(0, value)).padStart(2, "0");
function timeToday(value, base) {
  const [hours, minutes] = value.split(":").map(Number);
  const result = new Date(base);
  result.setHours(hours || 0, minutes || 0, 0, 0);
  return result;
}
function update() {
  const now = new Date();
  const start = timeToday(settings.start, now);
  const end = timeToday(settings.end, now);
  const validShift = end > start;
  const shiftMs = validShift ? end - start : 1;
  const elapsedMs = Math.min(shiftMs, Math.max(0, now - start));
  const remainingMs = Math.max(0, end - now);
  const dayPay = settings.workdays > 0 ? settings.salary / settings.workdays : 0;
  const hourPay = validShift ? dayPay / (shiftMs / 3600000) : 0;
  const earned = validShift ? dayPay * (elapsedMs / shiftMs) : 0;
  const progress = validShift ? Math.min(100, Math.max(0, elapsedMs / shiftMs * 100)) : 0;
  const beforeWork = now < start;
  const afterWork = validShift && now >= end;
  const countdownMs = beforeWork ? Math.max(0, start - now) : remainingMs;
  const totalSeconds = Math.floor(countdownMs / 1000);
  document.getElementById("today").textContent = now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
  document.getElementById("status").textContent = afterWork ? "今天辛苦了，收工！" : beforeWork ? "距离上班还有" : "距离下班还有";
  document.getElementById("hours").textContent = pad(Math.floor(totalSeconds / 3600));
  document.getElementById("minutes").textContent = pad(Math.floor(totalSeconds % 3600 / 60));
  document.getElementById("seconds").textContent = pad(totalSeconds % 60);
  document.getElementById("countdown").hidden = afterWork;
  document.getElementById("done").hidden = !afterWork;
  document.getElementById("progressText").textContent = progress.toFixed(1) + "%";
  document.getElementById("progressBar").style.width = progress + "%";
  document.getElementById("pepTalk").textContent = afterWork ? "下班后的时间，才真正属于你。" : beforeWork ? "先喝杯咖啡，准备开启新的一天。" : "再坚持一下，每一秒都有回报。";
  document.getElementById("earned").textContent = money(earned);
  document.getElementById("perSecond").textContent = "+ " + money(hourPay / 3600) + " / 秒";
  document.getElementById("hourPay").textContent = money(hourPay);
  document.getElementById("dayPay").textContent = money(dayPay);
}
update();
setInterval(update, 1000);