const mqtt = require("mqtt");
const crypto = require("crypto");
const fs = require("fs");

const BROKER_URL = "mqtt://broker.hivemq.com";
const TOPIC = "jaliko/smart-air/air/data";

const DB_FILE = "air-quality-data.jsonl";   

const client = mqtt.connect(BROKER_URL, {
  connectTimeout: 10_000,
  reconnectPeriod: 2_000,
});

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function validate(d) {
  const errors = [];

  if (typeof d.deviceId !== "string" || d.deviceId.trim() === "") {
    errors.push("deviceId tidak valid");
  }

  if (!Number.isInteger(d.gasRaw) || d.gasRaw < 0 || d.gasRaw > 4095) {
    errors.push("gasRaw di luar rentang 0..4095");
  }
  if (!isNum(d.gasPpm) || d.gasPpm < 0 || d.gasPpm > 5000) {
    errors.push("gasPpm di luar rentang 0..5000");
  }
  
  if (!isNum(d.temperature) || d.temperature < -40 || d.temperature > 80) {
    errors.push("temperature di luar rentang -40..80 °C");
  }
  if (!isNum(d.humidity) || d.humidity < 0 || d.humidity > 100) {
    errors.push("humidity di luar rentang 0..100 %");
  }
  if (typeof d.timestamp !== "string" || Number.isNaN(Date.parse(d.timestamp))) {
    errors.push("timestamp tidak valid");
  }

  return errors;
}

function classifyAirQuality(gasPpm) {
  if (gasPpm <= 300) return "Baik";
  if (gasPpm <= 600) return "Sedang";
  if (gasPpm <= 1000) return "Buruk";
  return "Berbahaya";
}

function hashReading(d) {
  const canonical = JSON.stringify([
    d.deviceId,
    d.gasRaw,
    d.gasPpm,
    d.temperature,
    d.humidity,
    d.timestamp,
  ]);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function saveToDatabase(record) {
  fs.appendFile(DB_FILE, JSON.stringify(record) + "\n", (err) => {
    if (err) console.error("❌ Save error:", err.message);
  });
}

function sendToBlockchain(record) {
  console.log("⛓️  [TODO] Catat ke blockchain, hash:", record.hash);
}

client.on("connect", () => {
  console.log("✅ Subscriber connected:", BROKER_URL);

  client.subscribe(TOPIC, (err) => {
    if (err) {
      console.error("❌ Subscribe error:", err.message);
    } else {
      console.log("👂 Listening on topic:", TOPIC);
    }
  });
});

client.on("message", (topic, message) => {
  console.log("📥 Received:", message.toString());

  let data;
  try {
    data = JSON.parse(message.toString());
  } catch (err) {
    console.warn("⚠️  Data ditolak: bukan JSON valid");
    return;
  }

  const errors = validate(data);
  if (errors.length > 0) {
    console.warn("⚠️  Data ditolak:", errors.join("; "));
    return;
  }

  const record = {
    ...data,
    airQuality: classifyAirQuality(data.gasPpm),
    hash: hashReading(data),
    receivedAt: new Date().toISOString(),
  };

  saveToDatabase(record);
  console.log(
    `✅ Valid | ${record.airQuality} | gas=${record.gasPpm} ppm | ` +
      `suhu=${record.temperature}°C | lembap=${record.humidity}%`
  );

  if (record.airQuality === "Buruk" || record.airQuality === "Berbahaya") {
    console.log("🚨 Udara buruk terdeteksi!");
    sendToBlockchain(record);
  }
});

client.on("error", (err) => console.error("❌ MQTT error:", err.message));