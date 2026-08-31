const defaults = {
  salary: 15000, workdays: 22, start: "09:00", end: "18:00",
  breakStart: "12:00", breakEnd: "13:00", weekdays: [1, 2, 3, 4, 5],
  payday: 10, overtimeRate: 0, itemName: "奶茶", itemPrice: 18, theme: "default"
};
const inputIds = ["salary", "workdays", "start", "end", "breakStart", "breakEnd", "payday", "overtimeRate", "itemName", "itemPrice"];
let settings = { ...defaults };
let slack = { date: "", accumulatedMs: 0, startedAt: null };
let latestReport = null;
const themes = ["default", "gold", "berry", "sky"];
const themeNames = { default: "牛马绿", gold: "发财金", berry: "周五粉", sky: "摸鱼蓝" };
const dailyPhrases = [
  "今天的努力，正在悄悄变成明天的底气。", "别急着否定自己，你已经比昨天更靠近目标。", "认真生活的人，连时间都会偷偷奖励他。",
  "每完成一件小事，都是在给未来的自己存钱。", "下班会到，周末会来，好运也正在路上。", "把今天过好，就是对未来最稳的投资。",
  "允许自己慢一点，但别忘了继续向前。", "你的价值，不只写在工资条上。", "再普通的一天，也值得认真收尾。", "先完成，再完美；先下班，再伟大。",
  "今天流过的汗，都会变成账户里的数字。", "忙碌不是生活的全部，记得给自己留一点光。", "你正在做的每一件小事，都算数。", "生活不会辜负每一个认真赶路的人。",
  "把难熬的时刻，换算成看得见的收获。", "累了就歇一会儿，不必一直证明自己。", "今天也在稳定升级，哪怕进度只有一点点。", "工资在涨，经验在长，你也在变得更强。",
  "保持期待，下一件好事也许正在加载。", "愿你认真工作，也认真享受下班后的生活。", "今天不必满分，完成就已经很棒。", "再坚持一小会儿，自由时间正在靠近。"
];
function dailyPhrase(date) {
  const seed = Number(`${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`);
  return dailyPhrases[seed % dailyPhrases.length];
}

try { settings = { ...defaults, ...JSON.parse(localStorage.getItem("offwork-settings") || "{}") }; } catch {}
try { slack = { ...slack, ...JSON.parse(localStorage.getItem("offwork-slack") || "{}") }; } catch {}

const todayKey = date => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
if (slack.date !== todayKey(new Date())) slack = { date: todayKey(new Date()), accumulatedMs: 0, startedAt: null };

for (const id of inputIds) {
  const input = document.getElementById(id);
  input.value = settings[id];
  input.addEventListener("input", () => {
    settings[id] = ["start", "end", "breakStart", "breakEnd", "itemName"].includes(id) ? input.value : Math.max(0, Number(input.value));
    saveSettings();
    update();
  });
}

document.querySelectorAll("#weekdayOptions input").forEach(input => {
  input.checked = settings.weekdays.includes(Number(input.value));
  input.addEventListener("change", () => {
    settings.weekdays = [...document.querySelectorAll("#weekdayOptions input:checked")].map(item => Number(item.value));
    saveSettings();
    update();
  });
});
document.getElementById("settings").addEventListener("submit", event => event.preventDefault());
document.getElementById("slackToggle").addEventListener("click", toggleSlack);
document.getElementById("slackReset").addEventListener("click", () => {
  slack = { date: todayKey(new Date()), accumulatedMs: 0, startedAt: null };
  saveSlack();
  update();
});
document.getElementById("themeToggle").addEventListener("click", () => {
  settings.theme = themes[(themes.indexOf(settings.theme) + 1) % themes.length];
  applyTheme(); saveSettings();
});
document.getElementById("shareImage").addEventListener("click", saveReportImage);
document.getElementById("copyReport").addEventListener("click", copyReport);

function saveSettings() { localStorage.setItem("offwork-settings", JSON.stringify(settings)); }
function saveSlack() { localStorage.setItem("offwork-slack", JSON.stringify(slack)); }
function applyTheme() {
  if (settings.theme === "default") delete document.body.dataset.theme;
  else document.body.dataset.theme = settings.theme;
  document.getElementById("themeToggle").textContent = `主题：${themeNames[settings.theme] || themeNames.default}`;
}
const money = value => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
const pad = value => String(Math.max(0, Math.floor(value))).padStart(2, "0");
const formatDuration = milliseconds => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${pad(seconds / 3600)}:${pad(seconds % 3600 / 60)}:${pad(seconds % 60)}`;
};

function timeToday(value, base) {
  const [hours, minutes] = value.split(":").map(Number);
  const result = new Date(base);
  result.setHours(hours || 0, minutes || 0, 0, 0);
  return result;
}

function overlapMs(rangeStart, rangeEnd, pauseStart, pauseEnd) {
  return Math.max(0, Math.min(rangeEnd, pauseEnd) - Math.max(rangeStart, pauseStart));
}

function nextPayday(now) {
  const build = (year, month) => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(Math.max(1, settings.payday), lastDay));
  };
  let target = build(now.getFullYear(), now.getMonth());
  target.setHours(23, 59, 59, 999);
  if (target < now) target = build(now.getFullYear(), now.getMonth() + 1);
  return Math.max(0, Math.ceil((target - now) / 86400000));
}

function completedWorkdays(now) {
  let count = 0;
  for (let day = 1; day < now.getDate(); day += 1) {
    if (settings.weekdays.includes(new Date(now.getFullYear(), now.getMonth(), day).getDay())) count += 1;
  }
  return count;
}

function toggleSlack() {
  const now = Date.now();
  if (slack.startedAt) {
    slack.accumulatedMs += Math.max(0, now - slack.startedAt);
    slack.startedAt = null;
  } else {
    slack.date = todayKey(new Date());
    slack.startedAt = now;
  }
  saveSlack();
  update();
}

function celebrateMilestone(amount) {
  const key = `offwork-milestone-${todayKey(new Date())}`;
  if (!amount || Number(localStorage.getItem(key) || 0) >= amount) return;
  localStorage.setItem(key, String(amount));
  const layer = document.createElement("div");
  layer.className = "celebration";
  layer.innerHTML = `<div class="celebration-card">今日解锁赚钱里程碑<strong>${money(amount)}</strong></div>`;
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3000);
}

function reportText() {
  if (!latestReport) return "";
  return `【薪动时刻】今天已工作 ${latestReport.progress.toFixed(1)}%，赚到 ${money(latestReport.earned)}，相当于 ${latestReport.items.toFixed(1)} 个${settings.itemName || "小目标"}。距离下班还有 ${duration(latestReport.remainingMs)}。`;
}

async function copyReport() {
  const text = reportText();
  try { await navigator.clipboard.writeText(text); }
  catch {
    const area = document.createElement("textarea"); area.value = text; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
  }
  const button = document.getElementById("copyReport"); button.textContent = "已复制"; setTimeout(() => button.textContent = "复制文字", 1500);
}

function saveReportImage() {
  if (!latestReport) return;
  const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#171913"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#d9ff43"; ctx.fillRect(70, 80, 940, 1190);
  ctx.fillStyle = "#ff6e9d"; ctx.fillRect(70, 80, 940, 32);
  ctx.fillStyle = "#171913"; ctx.font = "900 52px Microsoft YaHei"; ctx.fillText("薪动时刻 · 今日上班战报", 130, 220);
  ctx.font = "700 28px Microsoft YaHei"; ctx.fillText(new Date().toLocaleDateString("zh-CN", { year:"numeric", month:"long", day:"numeric", weekday:"long" }), 130, 280);
  ctx.font = "800 34px Microsoft YaHei"; ctx.fillText("今天已经赚到", 130, 430);
  ctx.font = "900 112px Arial"; ctx.fillText(money(latestReport.earned), 130, 565);
  ctx.fillStyle = "#ff6e9d"; ctx.fillRect(130, 640, Math.max(8, 820 * latestReport.progress / 100), 34);
  ctx.strokeStyle = "#171913"; ctx.lineWidth = 4; ctx.strokeRect(130, 640, 820, 34);
  ctx.fillStyle = "#171913"; ctx.font = "800 32px Microsoft YaHei"; ctx.fillText(`今日工作进度 ${latestReport.progress.toFixed(1)}%`, 130, 740);
  ctx.fillText(`≈ ${latestReport.items.toFixed(1)} 个${settings.itemName || "小目标"}`, 130, 815);
  ctx.fillText(`摸鱼收入 ${money(latestReport.slackPay)}`, 130, 890);
  ctx.font = "700 28px Microsoft YaHei"; ctx.fillText(dailyPhrase(new Date()), 130, 1060);
  ctx.font = "700 24px Arial"; ctx.fillText("salary-countdown · 数据仅保存在本机", 130, 1180);
  const link = document.createElement("a"); link.download = `薪动时刻-${todayKey(new Date())}.png`; link.href = canvas.toDataURL("image/png"); link.click();
}

function update() {
  const now = new Date();
  if (slack.date !== todayKey(now)) slack = { date: todayKey(now), accumulatedMs: 0, startedAt: null };
  const start = timeToday(settings.start, now);
  const end = timeToday(settings.end, now);
  const breakStart = timeToday(settings.breakStart, now);
  const breakEnd = timeToday(settings.breakEnd, now);
  const validShift = end > start;
  const validBreak = validShift && breakEnd > breakStart && breakStart < end && breakEnd > start;
  const shiftMs = validShift ? end - start : 0;
  const breakMs = validBreak ? overlapMs(start, end, breakStart, breakEnd) : 0;
  const paidShiftMs = Math.max(1, shiftMs - breakMs);
  const isWorkday = settings.weekdays.includes(now.getDay());
  const rawElapsedMs = validShift ? Math.min(shiftMs, Math.max(0, now - start)) : 0;
  const elapsedBreakMs = validBreak ? overlapMs(start, new Date(Math.min(now, end)), breakStart, breakEnd) : 0;
  const paidElapsedMs = isWorkday ? Math.max(0, rawElapsedMs - elapsedBreakMs) : 0;
  const dayPay = settings.workdays > 0 ? settings.salary / settings.workdays : 0;
  const hourPay = validShift ? dayPay / (paidShiftMs / 3600000) : 0;
  const overtimeMs = isWorkday && validShift && now > end && settings.overtimeRate > 0 ? now - end : 0;
  const overtimePay = hourPay * settings.overtimeRate * overtimeMs / 3600000;
  const earnedBase = validShift ? dayPay * Math.min(1, paidElapsedMs / paidShiftMs) : 0;
  const earned = earnedBase + overtimePay;
  const progress = validShift && isWorkday ? Math.min(100, paidElapsedMs / paidShiftMs * 100) : 0;
  const beforeWork = isWorkday && now < start;
  const afterWork = isWorkday && validShift && now >= end;
  const inBreak = isWorkday && validBreak && now >= breakStart && now < breakEnd;
  const countdownMs = beforeWork ? start - now : Math.max(0, end - now);
  const totalSeconds = Math.floor(countdownMs / 1000);
  const resting = !isWorkday;

  document.getElementById("today").textContent = now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
  document.getElementById("status").textContent = resting ? "今天不用上班" : afterWork ? (settings.overtimeRate > 0 ? "下班啦，加班正在计费" : "今天辛苦了，收工！") : beforeWork ? "距离上班还有" : inBreak ? "午休中，距离下班还有" : "距离下班还有";
  document.getElementById("hours").textContent = pad(totalSeconds / 3600);
  document.getElementById("minutes").textContent = pad(totalSeconds % 3600 / 60);
  document.getElementById("seconds").textContent = pad(totalSeconds % 60);
  document.getElementById("countdown").hidden = resting || (afterWork && settings.overtimeRate === 0);
  document.getElementById("done").hidden = !(resting || (afterWork && settings.overtimeRate === 0));
  document.getElementById("done").innerHTML = resting ? "DAY<br>OFF" : "OFF<br>WORK!";
  document.getElementById("progressText").textContent = progress.toFixed(1) + "%";
  document.getElementById("progressBar").style.width = progress + "%";
  document.getElementById("pepTalk").textContent = `每日一句 · ${dailyPhrase(now)}`;
  document.getElementById("earned").textContent = money(earned);
  document.getElementById("perSecond").textContent = inBreak || resting ? "当前暂停计薪" : "+ " + money((afterWork && settings.overtimeRate > 0 ? hourPay * settings.overtimeRate : hourPay) / 3600) + " / 秒";
  document.getElementById("hourPay").textContent = money(hourPay);
  document.getElementById("dayPay").textContent = money(dayPay);
  document.getElementById("overtimePay").textContent = money(overtimePay);

  const pastDays = completedWorkdays(now);
  const monthEarned = pastDays * dayPay + (isWorkday ? earned : 0);
  const monthProgress = settings.salary > 0 ? Math.min(100, monthEarned / settings.salary * 100) : 0;
  document.getElementById("monthName").textContent = `${now.getMonth() + 1} 月已经赚到`;
  document.getElementById("monthEarned").textContent = money(monthEarned);
  document.getElementById("monthProgressText").textContent = monthProgress.toFixed(1) + "%";
  document.getElementById("monthProgressBar").style.width = monthProgress + "%";
  document.getElementById("workedDays").textContent = `${pastDays + (isWorkday && progress >= 100 ? 1 : 0)} / ${settings.workdays} 天`;
  const daysToPayday = nextPayday(now);
  document.getElementById("paydayCountdown").textContent = daysToPayday === 0 ? "就是今天！" : `${daysToPayday} 天`;
  document.getElementById("monthForecast").textContent = money(settings.salary + overtimePay);

  document.getElementById("overtimeTime").textContent = formatDuration(overtimeMs);
  document.getElementById("overtimeRateText").textContent = settings.overtimeRate > 0 ? `${settings.overtimeRate} 倍` : "未开启";
  document.getElementById("overtimeHint").textContent = settings.overtimeRate > 0 ? (afterWork ? `正在以 ${money(hourPay * settings.overtimeRate)} / 小时累计` : "下班时间之后会自动开始计算。") : "在下方选择加班倍率，即可开启自动计算。";

  const slackMs = slack.accumulatedMs + (slack.startedAt ? Math.max(0, Date.now() - slack.startedAt) : 0);
  document.getElementById("slackTime").textContent = formatDuration(slackMs);
  document.getElementById("slackPay").textContent = money(hourPay * slackMs / 3600000);
  document.getElementById("slackToggle").textContent = slack.startedAt ? "暂停摸鱼" : slackMs > 0 ? "继续摸鱼" : "开始摸鱼";

  const itemPrice = Math.max(0.01, Number(settings.itemPrice) || 0.01);
  const items = earned / itemPrice;
  document.getElementById("buyingPower").textContent = `${items.toFixed(1)} 个${settings.itemName || "小目标"}`;
  const itemRemainder = earned % itemPrice === 0 ? itemPrice : itemPrice - earned % itemPrice;
  document.getElementById("nextItemTime").textContent = hourPay > 0 ? duration(itemRemainder / hourPay * 3600000) : "—";
  document.getElementById("buyingHint").textContent = `按每个 ${money(itemPrice)} 计算，把抽象的工资换成看得见的收获。`;
  const milestones = [50, 100, 200, 500, 1000, 2000, 5000];
  const nextMilestone = milestones.find(value => value > earned) || Math.ceil(earned / 5000 + 1) * 5000;
  const previousMilestone = [...milestones].reverse().find(value => value <= earned) || 0;
  const milestoneProgress = Math.min(100, (earned - previousMilestone) / Math.max(1, nextMilestone - previousMilestone) * 100);
  document.getElementById("nextMilestone").textContent = money(nextMilestone);
  document.getElementById("milestoneBar").style.width = milestoneProgress + "%";
  document.getElementById("milestoneHint").textContent = `距离目标还差 ${money(nextMilestone - earned)}`;
  celebrateMilestone(previousMilestone);
  latestReport = { earned, progress, items, slackPay: hourPay * slackMs / 3600000, remainingMs: Math.max(0, end - now) };
  document.getElementById("sharePreview").textContent = reportText();
}

applyTheme();
update();
setInterval(update, 1000);

