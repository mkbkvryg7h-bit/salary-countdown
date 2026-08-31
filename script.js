const defaults = {
  salary: 15000, workdays: 22, start: "09:00", end: "18:00",
  breakStart: "12:00", breakEnd: "13:00", weekdays: [1, 2, 3, 4, 5],
  payday: 10, overtimeRate: 0
};
const inputIds = ["salary", "workdays", "start", "end", "breakStart", "breakEnd", "payday", "overtimeRate"];
let settings = { ...defaults };
let slack = { date: "", accumulatedMs: 0, startedAt: null };

try { settings = { ...defaults, ...JSON.parse(localStorage.getItem("offwork-settings") || "{}") }; } catch {}
try { slack = { ...slack, ...JSON.parse(localStorage.getItem("offwork-slack") || "{}") }; } catch {}

const todayKey = date => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
if (slack.date !== todayKey(new Date())) slack = { date: todayKey(new Date()), accumulatedMs: 0, startedAt: null };

for (const id of inputIds) {
  const input = document.getElementById(id);
  input.value = settings[id];
  input.addEventListener("input", () => {
    settings[id] = ["start", "end", "breakStart", "breakEnd"].includes(id) ? input.value : Math.max(0, Number(input.value));
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

function saveSettings() { localStorage.setItem("offwork-settings", JSON.stringify(settings)); }
function saveSlack() { localStorage.setItem("offwork-slack", JSON.stringify(slack)); }
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
  document.getElementById("pepTalk").textContent = resting ? "今天是休息日，好好享受自己的时间。" : afterWork ? (settings.overtimeRate > 0 ? `加班每小时 ${money(hourPay * settings.overtimeRate)}，记得早点回家。` : "下班后的时间，才真正属于你。") : beforeWork ? "先喝杯咖啡，准备开启新的一天。" : inBreak ? "午休不扣工资进度，先安心吃饭。" : "再坚持一下，每一秒都有回报。";
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
}

update();
setInterval(update, 1000);

