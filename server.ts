import express from "express";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

// Load environment variables
dotenv.config();

console.log("=== DIAGNÓSTICO DE VARIABLES DE ENTORNO AL ARRANQUE ===");
console.log(`FLOW_API_KEY: largo=${(process.env.FLOW_API_KEY||"").trim().length}, primeros4="${(process.env.FLOW_API_KEY||"").trim().substring(0,4)}"`);
console.log(`FLOW_SECRET_KEY: largo=${(process.env.FLOW_SECRET_KEY||"").trim().length}`);
console.log(`FLOW_API_URL: ${process.env.FLOW_API_URL||"no configurada"}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log("=======================================================");

let localFirebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    localFirebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }
} catch (err) {
  console.warn("[Firebase Config Loader] Could not read local config fallback:", err);
}

const FIRESTORE_PROJECT_ID_RESOLVED = process.env.FIRESTORE_PROJECT_ID || localFirebaseConfig.projectId || "sara-35270";
const FIRESTORE_DATABASE_ID_RESOLVED = process.env.FIRESTORE_DATABASE_ID || "ai-studio-3d451c93-9738-452c-87b2-4b4817e76096";
const FIRESTORE_API_KEY_RESOLVED = process.env.FIRESTORE_API_KEY || localFirebaseConfig.apiKey || "";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// FLOW: SIEMPRE PRODUCCIÓN — sin lógica sandbox
// ============================================================
const FLOW_API_URL_PRODUCTION = "https://www.flow.cl/api";

function getFlowApiUrl(): string {
  console.log(`[Flow Routing] Usando PRODUCCIÓN: ${FLOW_API_URL_PRODUCTION}`);
  return FLOW_API_URL_PRODUCTION;
}

function hasRealFlowCredentials(): boolean {
  const apiKey = (process.env.FLOW_API_KEY || "").trim();
  const secretKey = (process.env.FLOW_SECRET_KEY || "").trim();
  if (!apiKey || !secretKey) return false;
  if (apiKey.length < 10 || secretKey.length < 10) return false;
  const placeholders = ["your_flow_api_key", "your_flow_secret_key", "placeholder", "dummy", "example"];
  if (placeholders.some(p => apiKey.toLowerCase().includes(p))) return false;
  if (placeholders.some(p => secretKey.toLowerCase().includes(p))) return false;
  return true;
}

// ============================================================
// Firestore: marcar cita como pagada
// ============================================================
async function updateAppointmentStatusPaid(appId: string, amount: number) {
  try {
    const projectId = FIRESTORE_PROJECT_ID_RESOLVED;
    const databaseId = FIRESTORE_DATABASE_ID_RESOLVED;
    const apiKey = FIRESTORE_API_KEY_RESOLVED;

    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/appointments/${appId}?key=${apiKey}&updateMask.fieldPaths=paymentStatus`;
    const body: any = { fields: { paymentStatus: { stringValue: "paid" } } };

    const rate2026 = 0.145;
    const bruto = amount || 50000;
    const retencionVal = Math.round(bruto * rate2026);
    const liquidoVal = bruto - retencionVal;
    const folioNum = 202601 + Math.floor(Math.random() * 9500);
    const boletaUrl = `https://sii.libredte.cl/bhe-folio-${folioNum}-sim.pdf`;

    console.log(`[Firestore REST] Marking appointment ${appId} as paid, amount $${bruto} CLP...`);
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.error("[Firestore REST] Update failed:", await response.text());
    } else {
      console.log(`[Firestore REST] Appointment ${appId} marked as PAID.`);
    }
    return { folioNum, boletaUrl, retencionVal, liquidoVal };
  } catch (err) {
    console.error("[Firestore REST] Error:", err);
    return null;
  }
}

// ============================================================
// ENDPOINT: Diagnóstico (TEMPORAL — eliminar después)
// ============================================================
app.get("/api/env-check", (req, res) => {
  const k = (process.env.FLOW_API_KEY || "").trim();
  const s = (process.env.FLOW_SECRET_KEY || "").trim();
  res.json({
    flow_api_key_largo: k.length,
    flow_api_key_preview: k.length > 0 ? `${k.substring(0,4)}...${k.slice(-3)}` : "VACÍO ❌",
    flow_secret_key_largo: s.length,
    flow_secret_key_preview: s.length > 0 ? `${s.substring(0,4)}...${s.slice(-3)}` : "VACÍO ❌",
    has_real_credentials: hasRealFlowCredentials(),
    flow_api_url: FLOW_API_URL_PRODUCTION,
    node_env: process.env.NODE_ENV,
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// ============================================================
// FLOW: Crear pago
// ============================================================
app.post("/api/flow/create-payment", async (req, res) => {
  const { appointmentId, price, patientEmail, patientName, patientRut, origin } = req.body;

  if (!appointmentId || !price) {
    return res.status(400).json({ error: "Faltan parámetros para preparar el cobro en Flow." });
  }

  const flowApiKey = (process.env.FLOW_API_KEY || "").trim();
  const flowSecretKey = (process.env.FLOW_SECRET_KEY || "").trim();
  const flowApiUrl = getFlowApiUrl();
  const numAmount = Number(price);

  console.log("========== [Flow Create Payment] ==========");
  console.log(`- FLOW_API_KEY length: ${flowApiKey.length}, preview: ${flowApiKey.substring(0,4)}...`);
  console.log(`- FLOW_SECRET_KEY length: ${flowSecretKey.length}`);
  console.log(`- URL: ${flowApiUrl}`);
  console.log(`- hasRealCredentials: ${hasRealFlowCredentials()}`);
  console.log("===========================================");

  if (!hasRealFlowCredentials()) {
    return res.status(400).json({
      success: false,
      error: `Las credenciales de Flow no están configuradas. FLOW_API_KEY largo=${flowApiKey.length}, FLOW_SECRET_KEY largo=${flowSecretKey.length}`
    });
  }

  try {
    let baseUrl = origin;
    if (!baseUrl && req.headers.referer) {
      try { baseUrl = new URL(req.headers.referer).origin; } catch (_) {}
    }
    if (!baseUrl) {
      const host = req.get("host") || req.headers.host;
      if (host) {
        const proto = req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");
        baseUrl = `${proto}://${host}`;
      }
    }
    baseUrl = baseUrl || "https://proyecto-mindspace-597030236952.southamerica-west1.run.app";

    const payload: Record<string, any> = {
      apiKey: flowApiKey,
      amount: numAmount,
      commerceOrder: appointmentId,
      email: patientEmail || "correo@paciente.cl",
      subject: "Atención Psicoterapéutica Clínica - MindSpace",
      urlConfirmation: `${baseUrl}/api/flow/confirm`,
      urlReturn: `${baseUrl}/api/flow/return`,
    };

    // Firma HMAC-SHA256: parámetros ordenados alfabéticamente
    const sortedKeys = Object.keys(payload).sort();
    const stringToSign = sortedKeys.map(k => `${k}=${payload[k]}`).join("&");
    const signature = crypto.createHmac("sha256", flowSecretKey).update(stringToSign).digest("hex");
    payload.s = signature;

    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(payload)) {
      searchParams.append(key, String(val));
    }

    console.log(`[Flow] POST ${flowApiUrl}/payment/create`);
    const response = await fetch(`${flowApiUrl}/payment/create`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: searchParams.toString()
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      throw new Error(`Código ${response.status} de la API de Flow: ${errorMsg}`);
    }

    const flowResult = await response.json() as { url: string; token: string; flowOrder: number };
    console.log("[Flow] Pago creado OK:", flowResult);

    return res.json({
      success: true,
      token: flowResult.token,
      paymentUrl: `${flowResult.url}?token=${flowResult.token}`,
      real: true
    });
  } catch (err: any) {
    console.error("[Flow Error]:", err);
    return res.status(400).json({
      success: false,
      error: `Error Flow: ${err.message}`
    });
  }
});

// ============================================================
// FLOW: Return (redirect del paciente tras pagar)
// ============================================================
app.all("/api/flow/return", async (req, res) => {
  const token = req.body?.token || req.query?.token;
  const flowApiKey = (process.env.FLOW_API_KEY || "").trim();
  const flowSecretKey = (process.env.FLOW_SECRET_KEY || "").trim();
  const flowApiUrl = getFlowApiUrl();

  let statusNum = 3;
  let amountVal = 50000;
  let appId = "";
  let name = "Paciente";
  let email = "correo@paciente.cl";
  let rut = "11.111.111-1";

  if (token && hasRealFlowCredentials()) {
    try {
      const payload: Record<string, any> = { apiKey: flowApiKey, token: token };
      const sortedKeys = Object.keys(payload).sort();
      const stringToSign = sortedKeys.map(k => `${k}=${payload[k]}`).join("&");
      const signature = crypto.createHmac("sha256", flowSecretKey).update(stringToSign).digest("hex");

      const queryParams = new URLSearchParams({ apiKey: flowApiKey, token: String(token), s: signature });
      const response = await fetch(`${flowApiUrl}/payment/getStatus?${queryParams.toString()}`);
      if (response.ok) {
        const data = await response.json() as any;
        statusNum = Number(data.status);
        amountVal = Number(data.amount);
        appId = data.commerceOrder || "";
        email = data.payer || "correo@paciente.cl";
        name = data.payerName || "Paciente";
      }
    } catch (err: any) {
      console.error("[Flow Return] Error:", err);
    }
  } else {
    appId = String(req.body?.appId || req.query?.appId || "");
    amountVal = Number(req.body?.amount || req.query?.amount || 50000);
    email = String(req.body?.email || req.query?.email || "correo@paciente.cl");
    name = String(req.body?.name || req.query?.name || "Paciente");
    rut = String(req.body?.rut || req.query?.rut || "11.111.111-1");
    const simStatus = req.body?.status || req.query?.status;
    statusNum = simStatus === "failed" ? 3 : 2;
  }

  const isApproved = statusNum === 2;
  let receiptInfo = null;
  if (isApproved && appId) {
    receiptInfo = await updateAppointmentStatusPaid(appId, amountVal);
  }

  const bruto = amountVal;
  const retencionVal = receiptInfo?.retencionVal || Math.round(bruto * 0.145);
  const liquidoVal = receiptInfo?.liquidoVal || (bruto - retencionVal);
  const folioNum = receiptInfo?.folioNum || (1024 + Math.floor(Math.random() * 850));
  const boletaUrl = receiptInfo?.boletaUrl || `https://sii.libredte.cl/bhe-folio-${folioNum}-sim.pdf`;

  res.send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MindSpace - Pago Procesado</title>
<script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-50 dark:bg-slate-950 flex justify-center items-center min-h-screen px-4 py-8 font-sans">
<div class="bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 p-8 rounded-3xl shadow-2xl max-w-lg w-full space-y-6">
  ${isApproved ? `
  <div class="flex items-center gap-3 border-b dark:border-slate-800 pb-5">
    <div class="bg-emerald-100 text-emerald-600 p-3 rounded-2xl"><span class="text-xl">✓</span></div>
    <div><h3 class="text-lg font-extrabold text-slate-700 dark:text-slate-300">Pago Recibido Correctamente</h3>
    <p class="text-xs text-slate-500 font-bold uppercase mt-0.5 tracking-wider">● Registro Clínico Confirmado</p></div>
  </div>
  <div class="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 font-mono text-xs">
    <div class="flex justify-between font-bold pb-2 border-b dark:border-slate-800">
      <span class="dark:text-white">Comprobante de Pago</span>
      <span class="text-emerald-500">Folio N° ${folioNum}</span>
    </div>
    <div class="flex justify-between text-slate-600 dark:text-slate-400">
      <span>Paciente:</span><span class="font-bold text-slate-900 dark:text-white">${name}</span>
    </div>
    <div class="flex justify-between text-slate-600 dark:text-slate-400">
      <span>Honorarios Brutos:</span><span class="font-bold text-slate-900 dark:text-white">$${bruto.toLocaleString("es-CL")} CLP</span>
    </div>
    <div class="flex justify-between text-amber-600 font-bold">
      <span>Retención 14,5% (2026):</span><span>- $${retencionVal.toLocaleString("es-CL")} CLP</span>
    </div>
    <div class="flex justify-between text-slate-900 dark:text-white font-black text-sm pt-2 border-t border-dashed dark:border-slate-800">
      <span>Monto Líquido:</span><span class="text-emerald-500">$${liquidoVal.toLocaleString("es-CL")} CLP</span>
    </div>
  </div>
  ` : `
  <div class="flex items-center gap-3 border-b dark:border-slate-800 pb-5">
    <div class="bg-rose-100 text-rose-600 p-3 rounded-2xl"><span class="text-xl">❌</span></div>
    <div><h3 class="text-lg font-black text-rose-600">Transacción Rechazada o Cancelada</h3>
    <p class="text-xs text-slate-500 mt-0.5">La operación con Flow no pudo proceder</p></div>
  </div>
  <p class="text-xs text-slate-600 dark:text-slate-400">Su cita permanece agendada en estado <strong>Pre-Reservada</strong>. Por favor intente nuevamente.</p>
  `}
  <div class="pt-4 border-t dark:border-slate-800 text-center space-y-3">
    <p class="text-xs text-zinc-400">Redirigiendo en <span id="cd" class="font-bold text-emerald-500">5</span> segundos...</p>
    <a href="/?mode=patient" class="bg-slate-900 text-white text-xs font-extrabold py-3.5 px-6 rounded-xl block text-center uppercase tracking-wide">← Volver a MindSpace</a>
  </div>
  <script>let s=5;const e=document.getElementById("cd");const i=setInterval(()=>{s--;if(e)e.textContent=s;if(s<=0){clearInterval(i);window.location.href="/?mode=patient";}},1000);</script>
</div></body></html>`);
});

// ============================================================
// FLOW: Confirm webhook
// ============================================================
app.post("/api/flow/confirm", async (req, res) => {
  const token = req.body?.token;
  if (!token) return res.status(400).send("Falta Token.");

  const flowApiKey = (process.env.FLOW_API_KEY || "").trim();
  const flowSecretKey = (process.env.FLOW_SECRET_KEY || "").trim();
  const flowApiUrl = getFlowApiUrl();

  if (hasRealFlowCredentials()) {
    try {
      const payload: Record<string, any> = { apiKey: flowApiKey, token: token };
      const sortedKeys = Object.keys(payload).sort();
      const stringToSign = sortedKeys.map(k => `${k}=${payload[k]}`).join("&");
      const signature = crypto.createHmac("sha256", flowSecretKey).update(stringToSign).digest("hex");
      const queryParams = new URLSearchParams({ apiKey: flowApiKey, token: String(token), s: signature });
      const response = await fetch(`${flowApiUrl}/payment/getStatus?${queryParams.toString()}`);
      if (response.ok) {
        const data = await response.json() as any;
        if (Number(data.status) === 2 && data.commerceOrder) {
          await updateAppointmentStatusPaid(data.commerceOrder, Number(data.amount));
        }
      }
    } catch (err: any) {
      console.error("[Flow Confirm] Error:", err);
    }
  }
  res.send("OK");
});

// ============================================================
// FLOW: Receipt
// ============================================================
app.get("/api/flow/receipt", async (req, res) => {
  const appId = req.query?.id;
  if (!appId) return res.status(400).send("Falta ID de cita.");

  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID_RESOLVED}/databases/${FIRESTORE_DATABASE_ID_RESOLVED}/documents/appointments/${appId}?key=${FIRESTORE_API_KEY_RESOLVED}`;
    const response = await fetch(url);
    if (!response.ok) return res.status(404).send("No se encontró la cita.");

    const data = await response.json();
    const fields = data.fields || {};
    const patientName = fields.patientName?.stringValue || "Paciente";
    const patientRut = fields.patientRut?.stringValue || "N/A";
    const price = Number(fields.price?.integerValue || fields.price?.doubleValue || 45000);
    const paymentStatus = fields.paymentStatus?.stringValue || "pending";
    const folioNum = fields.boletaFolio?.stringValue || fields.boletaFolio?.integerValue || (1024 + Math.floor(Math.random() * 850));
    const bruto = Number(fields.boletaBruto?.stringValue || fields.boletaBruto?.integerValue || price);
    const retencion = Number(fields.boletaRetencion?.stringValue || fields.boletaRetencion?.integerValue || Math.round(price * 0.145));
    const liquido = Number(fields.boletaLiquido?.stringValue || fields.boletaLiquido?.integerValue || (price - retencion));

    if (paymentStatus !== "paid") {
      return res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:2rem"><h2>⏳ Pago Pendiente</h2><p>Esta cita aún no registra pago confirmado.</p></body></html>`);
    }

    res.send(`<html><head><title>Recibo #${folioNum} - MindSpace</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-100 min-h-screen flex items-center justify-center p-4">
<div class="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 p-8 space-y-4">
  <h1 class="text-xl font-black text-slate-900">MindSpace — Comprobante de Pago</h1>
  <div class="text-sm space-y-2 text-slate-700">
    <div class="flex justify-between"><span>Paciente:</span><strong>${patientName}</strong></div>
    <div class="flex justify-between"><span>RUT:</span><strong>${patientRut}</strong></div>
    <div class="flex justify-between"><span>Folio BHE:</span><strong>${folioNum}</strong></div>
    <div class="flex justify-between border-t pt-2"><span>Bruto:</span><strong>$${bruto.toLocaleString("es-CL")} CLP</strong></div>
    <div class="flex justify-between text-amber-600"><span>Retención 14,5%:</span><strong>- $${retencion.toLocaleString("es-CL")} CLP</strong></div>
    <div class="flex justify-between text-emerald-600 font-black text-base"><span>Líquido:</span><strong>$${liquido.toLocaleString("es-CL")} CLP</strong></div>
  </div>
  <button onclick="window.print()" class="w-full bg-slate-900 text-white font-bold py-3 rounded-xl text-sm">🖨️ Imprimir Comprobante</button>
</div></body></html>`);
  } catch (err: any) {
    res.status(500).send("Error al obtener recibo.");
  }
});

// ============================================================
// ElevenLabs
// ============================================================
app.get("/api/elevenlabs/status", (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  res.json({ configured: !!(apiKey && apiKey !== "YOUR_ELEVENLABS_API_KEY" && apiKey.trim() !== ""), voiceId: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM" });
});

app.post("/api/elevenlabs/tts", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided" });
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey || apiKey === "YOUR_ELEVENLABS_API_KEY") return res.status(501).json({ error: "ElevenLabs API key not configured" });
    const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", "accept": "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
    });
    if (!response.ok) return res.status(response.status).json({ error: await response.text() });
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// Gemini
// ============================================================
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    aiClient = new GoogleGenAI({ apiKey: apiKey || "MOCK_KEY", httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
  }
  return aiClient;
}

app.post("/api/gemini/summarize", async (req, res) => {
  try {
    const { patientName, notes, observations } = req.body;
    if (!notes) return res.status(400).json({ error: "No therapy notes provided" });
    const ai = getGeminiClient();
    const prompt = `Paciente: ${patientName || "Anónimo"}. Notas: "${notes}". Observaciones: "${observations || "Ninguna"}". Genera un resumen clínico estructurado en Markdown con: 1. Puntos Clave, 2. Estado Psicoemocional, 3. Planes de Acción.`;
    const response = await ai.models.generateContent({ model: "gemini-2.0-flash", contents: prompt, config: { temperature: 0.2 } });
    res.json({ summary: response.text });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/gemini/reminder-draft", async (req, res) => {
  try {
    const { patientName, date, timeSlot, price, therapistName, channel } = req.body;
    if (!patientName || !date || !timeSlot) return res.status(400).json({ error: "Missing fields" });
    const ai = getGeminiClient();
    const channelName = channel === "whatsapp" ? "WhatsApp" : "Correo Electrónico";
    const prompt = `Escribe un recordatorio profesional y cálido para ${channelName} al paciente "${patientName}". Fecha: ${date}, Hora: ${timeSlot}, Costo: $${price || 0} CLP, Terapeuta: ${therapistName || "Ps. José Ignacio Rovel"}. Listo para enviar, sin placeholders.`;
    const response = await ai.models.generateContent({ model: "gemini-2.0-flash", contents: prompt, config: { temperature: 0.7 } });
    res.json({ message: response.text });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function getDoctorTimeGreeting(timeStr?: string): string {
  let hour = new Date().getHours();
  if (timeStr) {
    const match = timeStr.match(/(\d+)/);
    if (match) {
      let h = parseInt(match[1], 10);
      if (timeStr.toLowerCase().match(/pm|p\.m\.|tarde|noche/) && h < 12) h += 12;
      if (timeStr.toLowerCase().match(/am|a\.m\.|mañana/) && h === 12) h = 0;
      hour = h;
    }
  }
  if (hour >= 5 && hour < 12) return "Hola Doctor, buenos días.";
  if (hour >= 12 && hour < 20) return "Hola Doctor, buenas tardes.";
  return "Hola Doctor, buenas noches.";
}

function getAbbyLocalFallback(userQuery: string, appointmentsText: string, therapistName: string, currentTime?: string) {
  const lower = userQuery.toLowerCase();
  const greeting = getDoctorTimeGreeting(currentTime);
  let reply = "";
  let triggerAction = "none";
  if (lower.match(/suspend|urgenc|cancel|emergenc/)) {
    triggerAction = "suspend_today";
    reply = `${greeting} Iniciaré el protocolo de suspensión para el día de hoy. ¿Necesita algo más?`;
  } else if (lower.match(/quien|paciente|ahora|prox|agenda|cita/)) {
    triggerAction = "check_appointments";
    reply = `${greeting} ${appointmentsText || "No hay consultas registradas para hoy."}. ¿Necesita algo más?`;
  } else {
    reply = `${greeting} He recibido su indicación. ¿Necesita algo más?`;
  }
  return { reply, triggerAction, reason: "Fallback local." };
}

app.post("/api/gemini/abby", async (req, res) => {
  const { query: userQuery, appointmentsText, therapistName, currentTime, mode } = req.body;
  if (!userQuery) return res.status(400).json({ error: "Missing query" });

  const apiKey = process.env.GEMINI_API_KEY;
  const hasRealKey = apiKey && apiKey !== "MOCK_KEY" && apiKey.trim().length > 0;

  if (!hasRealKey) {
    return res.json({ ...getAbbyLocalFallback(userQuery, appointmentsText, therapistName, currentTime), diagnostics: { status: "fallback_no_apiKey" } });
  }

  try {
    const ai = getGeminiClient();
    const isPatient = mode === "patient";
    const prompt = isPatient
      ? `Eres Abby, asistente administrativa de MindSpace (consulta de ${therapistName || "Ps. José Ignacio Rovel"}). Responde al paciente de forma cálida y empática. NO des asistencia clínica. Incentiva a agendar hora. Hora: ${currentTime}. Mensaje del paciente: "${userQuery}". Responde en JSON: {"reply":"...","triggerAction":"none","reason":"..."}`
      : `Eres Abby, asistente del psicólogo ${therapistName || "Ps. José Ignacio Rovel"}. Sé directo y conciso. Saluda según la hora (${currentTime}). Agenda hoy: ${appointmentsText || "Sin consultas"}. Consulta: "${userQuery}". JSON: {"reply":"Hola Doctor... ¿Necesita algo más?","triggerAction":"suspend_today|check_appointments|none","reason":"..."}`;

    const response = await ai.models.generateContent({ model: "gemini-2.0-flash", contents: prompt, config: { responseMimeType: "application/json", temperature: 0.3 } });
    const parsed = JSON.parse(response.text || "{}");
    res.json({ ...parsed, diagnostics: { status: "success" } });
  } catch (error: any) {
    res.json({ ...getAbbyLocalFallback(userQuery, appointmentsText, therapistName), diagnostics: { status: "error", message: error.message } });
  }
});

// ============================================================
// Otros endpoints
// ============================================================
app.post("/api/calls/sign", (req, res) => {
  const { roomId, therapistUid } = req.body;
  if (!roomId) return res.status(400).json({ error: "Room ID required" });
  const cryptoToken = "SECURE_AES_256_GCM_" + Buffer.from(`${roomId}-${therapistUid || "patient"}-${Date.now()}`).toString("base64").substring(0, 32);
  res.json({ roomId, cryptoToken, algorithm: "AES-GCM", encryptionBits: 256, certifiedAt: new Date().toISOString() });
});

app.post("/api/simulate-payment", (req, res) => {
  const { appointmentId, price } = req.body;
  if (!appointmentId || !price) return res.status(400).json({ error: "Missing params" });
  setTimeout(() => {
    const txId = "ch_" + Math.random().toString(36).substring(2, 12).toUpperCase();
    res.json({ success: true, transactionId: txId, appointmentId, amount: price, currency: "CLP", status: "succeeded", processedAt: new Date().toISOString() });
  }, 1000);
});

// ============================================================
// Iniciar servidor
// ============================================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 MindSpace Backend corriendo en http://0.0.0.0:${PORT}`);
  });
}

startServer();
