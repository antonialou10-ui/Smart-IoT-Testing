const mqtt = require("mqtt");
const BROKER_URL = "mqtt://broker.hivemq.com";

// Use a specific topic to avoid conflicts with other users
const TOPIC = "jaliko/smart-air/air/data";

const DEVICE_ID = "esp32-air-001";
const PUBLISH_INTERVAL_MS = 5000;

const FAULT_RATE = 0.05;

const client = mqtt.connect(BROKER_URL, {
  connectTimeout: 10_000,
  reconnectPeriod: 2_000,
});

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round = (v, digits = 1) => Number(v.toFixed(digits));
const noise = (step) => (Math.random() * 2 - 1) * step;

let temperature = 30; 
let humidity = 65; 
let gasRaw = 800;

const GAS_BASELINE = 800; 

function readSensors() {
  temperature = clamp(temperature + noise(0.4), 24, 38);
  humidity = clamp(humidity + noise(1.5), 40, 95);

  gasRaw += (GAS_BASELINE - gasRaw) * 0.15 + noise(120);
  if (Math.random() < 0.08) gasRaw += 1500 + Math.random() * 800;
  gasRaw = clamp(Math.round(gasRaw), 0, 4095);

  const gasPpm = Math.round((gasRaw / 4095) * 1000);

  const dhtFailed = Math.random() < FAULT_RATE;

  return {
    gasRaw,
    gasPpm,
    temperature: dhtFailed ? NaN : round(temperature, 1),
    humidity: dhtFailed ? NaN : round(humidity, 1),
  };
}

client.on("connect", () => {
  console.log("✅ Sensor connected to MQTT broker:", BROKER_URL);

  setInterval(() => {
    const payload = {
      deviceId: DEVICE_ID,
      ...readSensors(),
      timestamp: new Date().toISOString(),
    };

    const message = JSON.stringify(payload);

    client.publish(TOPIC, message, { qos: 0 }, (err) => {
      if (err) {
        console.error("❌ Publish error:", err.message);
      } else {
        console.log("📤 Published:", message);
      }
    });
  }, PUBLISH_INTERVAL_MS);
});

client.on("reconnect", () => console.log("🔄 Reconnecting..."));
client.on("error", (err) => console.error("❌ MQTT error:", err.message));
client.on("close", () => console.log("🔌 Connection closed"));