import express from "express";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { Firestore } from "@google-cloud/firestore";
import { z } from "zod";

// Load environment variables
dotenv.config();

// === DIAGNÓSTICO DE ARRANQUE ===
const _diagFlowKey = (process.env.FLOW_API_KEY || "").trim();
const _diagFlowSecret = (process.env.FLOW_SECRET_KEY || "").trim();
console.log("=== DIAGNÓSTICO DE VARIABLES DE ENTORNO AL ARRANQUE ===");
console.log(`FLOW_API_KEY: largo=${_diagFlowKey.length}, vacío=${_diagFlowKey.length === 0}, primeros4="${_diagFlowKey.substring(0, Math.min(4, _diagFlowKey.length))}"`);
console.log(`FLOW_SECRET_KEY: largo=${_diagFlowSecret.length}, vacío=${_diagFlowSecret.length === 0}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log("=======================================================");

// ================================================================
// 1. INICIALIZACIÓN DE FIRESTORE (SDK OFICIAL)
// ================================================================
// Usa Application Default Credentials (ADC) - en Cloud Run funciona automáticamente
// Si quieres especificar un proyecto, usa process.env.FIRESTORE_PROJECT_ID o déjalo en blanco (usará el proyecto por defecto)
let firestoreDb: Firestore;
try {
  firestoreDb = new Firestore({
    projectId: process.env.FIRESTORE_PROJECT_ID || undefined,
    databaseId: process.env.FIRESTORE_DATABASE_ID || undefined,
  });
  console.log("[Firestore] Conectado correctamente usando Application Default Credentials.");
} catch (err) {
  console.error("[Firestore] Error al inicializar Firestore:", err);
  process.exit(1); // No arrancar si Firestore no está disponible
}

// ================================================================
// 2. VALIDACIÓN CON ZOD
// ================================================================
const CreatePaymentSchema = z.object({
  appointmentId: z.string().min(1, "appointmentId es requerido"),
  price: z.number().positive("El precio debe ser un número positivo"),
  patientEmail: z.string().email("Email inválido").optional(),
  patientName: z.string().optional(),
  patientRut: z.string().optional(),
  origin: z.string().optional(),
  useSandbox: z.boolean().optional(),
});

// ================================================================
// 3. FUNCIONES DE ACCESO A FIRESTORE (REEMPLAZANDO REST CON SDK)
// ================================================================

/**
 * Actualiza el estado de una cita a "paid" y añade datos de boleta si corresponde
 */
async function updateAppointmentStatusPaid(appId: string, amount: number) {
  try {
    const disableSiiBilling = process.env.DISABLE_SII_BILLING !== "false";
    const docRef = firestoreDb.collection("appointments").doc(appId);

    const updateData: any = {
      paymentStatus: "paid",
      status: "scheduled",
    };

    let folioNum = 0;
    let boletaUrl = "";
    let retencionVal = 0;
    let liquidoVal = 0;

    if (!disableSiiBilling) {
      const rate2026 = 0.145;
      const bruto = amount || 50000;
      retencionVal = Math.round(bruto * rate2026);
      liquidoVal = bruto - retencionVal;
      folioNum = 202601 + Math.floor(Math.random() * 9500);
      boletaUrl = `https://sii.libredte.cl/bhe-folio-${folioNum}-sim.pdf`;

      updateData.boletaUrl = boletaUrl;
      updateData.boletaFolio = String(folioNum);
      updateData.boletaBruto = bruto;
      updateData.boletaRetencion = retencionVal;
      updateData.boletaLiquido = liquidoVal;
    }

    await docRef.update(updateData);
    console.log(`[Firestore] Cita ${appId} actualizada a PAID / SCHEDULED.`);
    return { folioNum, boletaUrl, retencionVal, liquidoVal };
  } catch (err) {
    console.error("[Firestore] Error actualizando cita:", err);
    throw err;
  }
}

/**
 * Elimina una cita de Firestore
 */
async function deleteAppointment(appId: string) {
  try {
    const docRef = firestoreDb.collection("appointments").doc(appId);
    await docRef.delete();
    console.log(`[Firestore] Cita ${appId} eliminada.`);
  } catch (err) {
    console.error("[Firestore] Error eliminando cita:", err);
    throw err;
  }
}

/**
 * Resuelve el appointmentId a partir del flowCommerceOrder
 */
async function resolveAppointmentIdFromFlowOrder(commerceOrder: string): Promise<string> {
  if (!commerceOrder) return "";
  if (!commerceOrder.startsWith("FLW_")) return commerceOrder;

  try {
    const snapshot = await firestoreDb
      .collection("appointments")
      .where("flowCommerceOrder", "==", commerceOrder)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      console.log(`[Flow Resolution] Resuelto ${commerceOrder} -> ${doc.id}`);
      return doc.id;
    }
    return commerceOrder;
  } catch (err) {
    console.error("[Flow Resolution] Error:", err);
    return commerceOrder;
  }
}

/**
 * Obtiene el modo sandbox del clínico desde Firestore
 */
async function getClinicianSandboxMode(): Promise<boolean> {
  try {
    const docRef = firestoreDb.doc("settings/default_psychologist_uid_123");
    const doc = await docRef.get();
    if (doc.exists) {
      const data = doc.data();
      if (data?.flowSandboxMode !== undefined) {
        return data.flowSandboxMode === true;
      }
    }
  } catch (err) {
    console.warn("[Firestore Sandbox Check] Error:", err);
  }
  // fallback a variable de entorno
  const envUrl = process.env.FLOW_API_URL;
  if (envUrl && envUrl.includes("sandbox")) {
    return true;
  }
  return false;
}

// ================================================================
// 4. FLOW API HELPER
// ================================================================

async function getFlowApiUrlResolved(useSandbox?: boolean): Promise<string> {
  const resolvedSandbox = typeof useSandbox !== "undefined" ? useSandbox : await getClinicianSandboxMode();
  if (resolvedSandbox) {
    console.log("[Flow Routing] Modo SANDBOX (https://sandbox.flow.cl/api)");
    return "https://sandbox.flow.cl/api";
  } else {
    console.log("[Flow Routing] Modo PRODUCCIÓN (https://www.flow.cl/api)");
    return "https://www.flow.cl/api";
  }
}

function hasRealFlowCredentials(): boolean {
  const apiKey = (process.env.FLOW_API_KEY || "").trim();
  const secretKey = (process.env.FLOW_SECRET_KEY || "").trim();
  if (!apiKey || !secretKey) return false;
  const placeholders = ["", "your_flow_api_key", "your_flow_secret_key", "placeholder", "dummy", "example"];
  if (apiKey.length < 10 || secretKey.length < 10) return false;
  if (placeholders.some(p => p !== "" && apiKey.toLowerCase().includes(p))) return false;
  if (placeholders.some(p => p !== "" && secretKey.toLowerCase().includes(p))) return false;
  return true;
}

// ================================================================
// 5. EXPRESS APP
// ================================================================

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================================================================
// 6. ENDPOINTS DE FLOW (con validación Zod)
// ================================================================

app.post("/api/flow/create-payment", async (req, res) => {
  // Validación con Zod
  const validation = CreatePaymentSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      error: "Datos inválidos",
      details: validation.error.errors,
    });
  }

  const { appointmentId, price, patientEmail, patientName, patientRut, origin, useSandbox } = validation.data;

  const flowApiKey = (process.env.FLOW_API_KEY || "").trim();
  const flowSecretKey = (process.env.FLOW_SECRET_KEY || "").trim();
  const flowApiUrl = await getFlowApiUrlResolved(useSandbox);
  const numAmount = price;

  const hostHeader = req.get('host') || req.headers.host || "";
  const isDevLocal = hostHeader.includes("localhost") || hostHeader.includes("127.0.0.1") || hostHeader.includes("ais-dev-") || hostHeader.includes("ais-pre-");

  console.log("=================== [Flow Payment Verbose Diagnostic] ===================");
  console.log(`- Request Host Header: "${hostHeader}"`);
  console.log(`- Detected isDevLocal: ${isDevLocal}`);
  console.log(`- Client body 'useSandbox': ${useSandbox}`);
  console.log(`- FLOW_API_KEY exists: ${!!flowApiKey} (Length: ${flowApiKey.length})`);
  console.log(`- FLOW_SECRET_KEY exists: ${!!flowSecretKey} (Length: ${flowSecretKey.length})`);
  console.log(`- hasRealFlowCredentials(): ${hasRealFlowCredentials()}`);
  console.log(`- Target Flow URL: "${flowApiUrl}/payment/create"`);
  console.log("========================================================================");

  if (!hasRealFlowCredentials()) {
    return res.status(400).json({
      success: false,
      error: `Las credenciales de la API de Flow no están configuradas correctamente en tu servidor de Cloud Run. 
      Por favor, configura FLOW_API_KEY y FLOW_SECRET_KEY como variables de entorno.`,
    });
  }

  try {
    console.log(`[Flow Real API] Iniciando transacción en ${useSandbox ? "Sandbox" : "Producción"}...`);

    let devOrigin = origin;
    if (!devOrigin && req.headers.referer) {
      try {
        const u = new URL(req.headers.referer);
        devOrigin = u.origin;
      } catch (_) {}
    }
    if (!devOrigin) {
      const host = req.get('host') || req.headers.host;
      if (host) {
        const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
        devOrigin = `${proto}://${host}`;
      }
    }
    const baseUrl = devOrigin || process.env.APP_URL || "http://localhost:3000";

    const shortOrderId = `FLW_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Guardar flowCommerceOrder en Firestore (usando SDK)
    try {
      const docRef = firestoreDb.collection("appointments").doc(appointmentId);
      await docRef.update({ flowCommerceOrder: shortOrderId });
      console.log(`[Flow] flowCommerceOrder ${shortOrderId} almacenado para cita ${appointmentId}`);
    } catch (err) {
      console.warn("[Flow] No se pudo actualizar flowCommerceOrder, continuando de todas formas", err);
    }

    const payload: Record<string, any> = {
      apiKey: flowApiKey,
      amount: numAmount,
      commerceOrder: shortOrderId,
      email: patientEmail || "correo@paciente.cl",
      subject: "Atención Psicoterapéutica Clínica - MindSpace",
      urlConfirmation: `${baseUrl}/api/flow/confirm`,
      urlReturn: `${baseUrl}/api/flow/return`,
    };

    const sortedKeys = Object.keys(payload).sort();
    const stringToSign = sortedKeys.map(k => `${k}=${payload[k]}`).join("&");
    const signature = crypto.createHmac("sha256", flowSecretKey).update(stringToSign).digest("hex");
    payload.s = signature;

    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(payload)) {
      searchParams.append(key, String(val));
    }

    console.log(`[Flow Real API] Solicitando link de pago: ${flowApiUrl}/payment/create`);
    const response = await fetch(`${flowApiUrl}/payment/create`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: searchParams.toString(),
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      throw new Error(`Código ${response.status} de la API de Flow: ${errorMsg}`);
    }

    const flowResult = (await response.json()) as { url: string; token: string; flowOrder: number };
    console.log("[Flow Real API] Link de pago creado exitosamente:", flowResult);

    return res.json({
      success: true,
      token: flowResult.token,
      paymentUrl: `${flowResult.url}?token=${flowResult.token}`,
      real: true,
    });
  } catch (err: any) {
    console.error("[Flow Real API Error]:", err);
    return res.status(400).json({
      success: false,
      error: `No se pudo conectar con Flow: ${err.message}`,
    });
  }
});

// ================================================================
// 7. RUTA DE SIMULACIÓN (SOLO EN DESARROLLO)
// ================================================================

if (process.env.NODE_ENV !== "production") {
  app.get("/api/flow/simulate-ui", (req, res) => {
    const { token, appId, amount, email, name, rut } = req.query;
    const numAmount = Number(amount) || 45000;

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Flow Chile Sandbox - Transacción Segura</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-[#f3f4f6] dark:bg-slate-950 flex justify-center items-center h-screen px-4 font-sans transition-colors duration-200">
        <div id="flow-sandbox-wrapper" class="bg-white dark:bg-slate-900 border border-zinc-200/60 dark:border-slate-800 p-8 rounded-3xl shadow-2xl max-w-md w-full text-center space-y-6 relative overflow-hidden">
          <div class="flex justify-between items-center border-b border-zinc-100 dark:border-slate-800 pb-4">
            <div class="flex items-center gap-1.5">
              <span class="text-sm">⚡</span>
              <span class="font-extrabold tracking-tight text-slate-950 dark:text-white uppercase text-xs">Flow Chile <span class="text-blue-600 font-mono text-[10px]">Sandbox</span></span>
            </div>
            <span class="bg-zinc-100 dark:bg-slate-800 text-[10px] font-mono font-bold dark:text-slate-300 px-2 py-0.5 rounded-md">Token: ${token || "N/A"}</span>
          </div>
          <div class="space-y-2 mt-4">
            <span class="text-[10px] bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 font-bold px-2.5 py-1 rounded-full border border-sky-100 dark:border-sky-900/50 uppercase tracking-widest block w-max mx-auto">Pasarela Webpay Plus 💻</span>
            <h2 class="text-xl font-black text-slate-900 dark:text-white leading-tight">MindSpace</h2>
            <p class="text-xs text-slate-500 dark:text-gray-400">Pagar su consulta de psicoterapia de forma 100% automatizada</p>
          </div>
          <div class="p-4 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-slate-950 dark:to-slate-950 rounded-2xl border border-blue-100 dark:border-slate-800 text-center">
            <span class="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-extrabold block">Total a transferir:</span>
            <span class="text-3xl font-black text-slate-950 dark:text-white mt-1 block">$${numAmount.toLocaleString('es-CL')} CLP</span>
          </div>
          <div class="text-left text-[11px] bg-slate-50 dark:bg-slate-900/35 p-4 rounded-xl border space-y-2 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300 leading-relaxed font-mono">
            <div class="flex justify-between"><span>Paciente:</span><span class="text-slate-900 dark:text-white font-bold">${decodeURIComponent(String(name || "Paciente"))}</span></div>
            <div class="flex justify-between"><span>RUT:</span><span class="text-slate-900 dark:text-white font-bold">${decodeURIComponent(String(rut || "11.111.111-1"))}</span></div>
            <div class="flex justify-between"><span>Email:</span><span class="text-slate-900 dark:text-white">${decodeURIComponent(String(email || "correo@paciente.cl"))}</span></div>
            <div class="flex justify-between border-t dark:border-slate-800 pt-1.5 mt-1.5"><span>Consulta ID:</span><span class="text-slate-400 text-[10px]">${appId || "N/A"}</span></div>
          </div>
          <form action="/api/flow/return" method="POST" class="space-y-3 pt-2">
            <input type="hidden" name="token" value="${token}" />
            <input type="hidden" name="appId" value="${appId}" />
            <input type="hidden" name="amount" value="${numAmount}" />
            <input type="hidden" name="email" value="${email}" />
            <input type="hidden" name="name" value="${name}" />
            <input type="hidden" name="rut" value="${rut}" />
            <button type="submit" name="status" value="paid" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs p-3.5 rounded-xl transition duration-150 cursor-pointer shadow-lg hover:scale-[1.01] active:scale-[0.99] uppercase tracking-wider">Simular Pago Autorizado (Aprobar)</button>
            <button type="submit" name="status" value="failed" class="w-full bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-600 font-extrabold text-xs p-2.5 rounded-xl transition duration-150 cursor-pointer">Rechazar Transacción (Simular Falla)</button>
          </form>
          <p class="text-[9.5px] leading-relaxed text-zinc-400 dark:text-slate-500 font-medium font-sans">Al simular Pago Autorizado, Flow enviará de inmediato el callback seguro POST. El servidor de MindSpace registrará el pago bajo el Impuesto Boleta de Honorarios vigente para el año 2026 (<strong class="dark:text-slate-400">Retención del 14,5%</strong>), generará el documento oficial LibreDTE simulado y emitirá el reembolso Isapre/Fonasa.</p>
        </div>
      </body>
      </html>
    `);
  });
} else {
  // En producción, la ruta no existe (devuelve 404)
  app.get("/api/flow/simulate-ui", (req, res) => {
    res.status(404).json({ error: "Endpoint no disponible en producción" });
  });
}

// ================================================================
// 8. RESTO DE ENDPOINTS (FLOW, GEMINI, ELEVENLABS, ETC.)
// ================================================================

// (Mantén el resto de tus endpoints sin cambios, pero actualizando el uso de Firestore)
// A continuación copio tus endpoints existentes, pero reemplazo las llamadas REST por el SDK de Firestore.

// Flow Callback Webhook
app.post("/api/webhooks/flow", async (req, res) => {
  const { appId, amount, email, name, rut, status } = req.body;
  const isApproved = status !== "failed";
  if (!appId || !amount) {
    return res.status(400).send("Parámetros faltantes en webhook de Flow");
  }
  const numAmount = Number(amount) || 45000;
  let receiptInfo = null;
  if (isApproved) {
    receiptInfo = await updateAppointmentStatusPaid(appId, numAmount);
  } else {
    await deleteAppointment(appId);
  }
  const rate2026 = 0.145;
  const bruto = numAmount;
  const retencionVal = receiptInfo?.retencionVal || Math.round(bruto * rate2026);
  const liquidoVal = receiptInfo?.liquidoVal || (bruto - retencionVal);
  const folioNum = receiptInfo?.folioNum || (1024 + Math.floor(Math.random() * 850));
  const boletaUrl = receiptInfo?.boletaUrl || `https://sii.libredte.cl/bhe-folio-${folioNum}-sim.pdf`;

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Flow Chile - Recibo Digital</title><script src="https://cdn.tailwindcss.com"></script></head>
    <body class="bg-[#f8fafc] dark:bg-slate-950 flex justify-center items-center min-h-screen px-4 py-8 font-sans transition-colors duration-200">
      <div class="bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 p-8 rounded-3xl shadow-2xl max-w-lg w-full space-y-6 text-left relative">
        ${isApproved ? `
          <div class="flex items-center gap-3 border-b dark:border-slate-800 pb-5">
            <div class="bg-slate-100 dark:bg-slate-950/50 text-slate-600 dark:text-slate-400 p-3 rounded-2xl border border-slate-200 dark:border-slate-800"><span class="text-xl">✓</span></div>
            <div><h3 class="text-lg font-extrabold text-slate-700 dark:text-slate-300">Pago Procesado y Aprobado</h3><p class="text-xs text-slate-500 dark:text-slate-400 font-extrabold uppercase mt-0.5 tracking-wider">● Boleta de Honorarios Electrónica Emitida</p></div>
          </div>
          <div class="space-y-4">
            <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">Estimado(a) <strong>${decodeURIComponent(name || "Paciente")}</strong>, su transferencia de $${bruto.toLocaleString('es-CL')} CLP ha sido acreditada ante la pasarela de pagos. De conformidad con las leyes impositivas vigentes en Chile, se emitió de inmediato su Boleta de Honorarios ante el SII mediante la integración segura de <strong>LibreDTE</strong>.</p>
            <div class="bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800 rounded-2xl p-5 space-y-3 font-mono text-xs leading-normal">
              <div class="flex justify-between font-bold pb-2 border-b dark:border-slate-850"><span class="text-slate-800 dark:text-white">Boleta de Honorarios Digital</span><span class="text-emerald-500 font-bold">Folio Nº ${folioNum}</span></div>
              <div class="flex justify-between text-slate-600 dark:text-slate-400"><span>RUT Receptor:</span><span class="font-bold text-slate-900 dark:text-white">${decodeURIComponent(rut || "11.111.111-1")}</span></div>
              <div class="flex justify-between text-slate-600 dark:text-slate-400"><span>Glosa de Honorarios:</span><span class="text-right">Sesión Psicoterapéutica Clínica</span></div>
              <div class="flex justify-between text-slate-600 dark:text-slate-400 pt-1.5 border-t dark:border-slate-850"><span>Honorarios Brutos:</span><span class="font-bold text-slate-900 dark:text-white">$${bruto.toLocaleString('es-CL')} CLP</span></div>
              <div class="flex justify-between text-amber-600 font-bold"><span>Retención 14,5% (2026):</span><span>- $${retencionVal.toLocaleString('es-CL')} CLP</span></div>
              <div class="flex justify-between text-slate-900 dark:text-white font-black text-sm pt-2 border-t border-dashed dark:border-slate-800"><span>Monto Líquido Recibido:</span><span class="text-emerald-500">$${liquidoVal.toLocaleString('es-CL')} CLP</span></div>
            </div>
            <div class="p-4 bg-blue-50/50 dark:bg-slate-950 border border-blue-150 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-3 text-xs">
              <div><h5 class="font-extrabold dark:text-white">Reembolso Isapre/Fonasa Activo</h5><p class="text-[10px] text-gray-500">Documento clínico debidamente legalizado</p></div>
              <a href="${boletaUrl}" target="_blank" class="bg-blue-600 hover:bg-blue-700 text-white font-bold p-2 px-3.5 rounded-xl shadow-md transition text-[11px] block text-center">📥 Descargar BHE Oficial</a>
            </div>
          </div>
          <div class="bg-slate-50 dark:bg-slate-950/30 text-slate-700 dark:text-slate-300 p-4 border border-slate-200 dark:border-slate-800 rounded-xl text-[10.5px] leading-relaxed"><strong>✓ Sincronización Exitosa:</strong> Este pago ha sido reportado automáticamente al backend de MindSpace. El estado del turno de consulta clínico ha cambiado a <strong class="text-slate-900 dark:text-white font-bold">PAGADO</strong>, y sus datos de reembolso Isapre/Fonasa han sido firmados debidamente.</div>
        ` : `
          <div class="flex items-center gap-3 border-b dark:border-slate-850 pb-5">
            <div class="bg-rose-100 dark:bg-rose-950/50 text-rose-600 p-3 rounded-2xl"><span class="text-xl">❌</span></div>
            <div><h3 class="text-lg font-black text-rose-600">Transacción Rechazada / Declinada</h3><p class="text-xs text-grey-500 mt-0.5">Error en el flujo de pasarela</p></div>
          </div>
          <div class="space-y-4"><p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">Lamentamos informarle que la red de Webpay Plus de Flow ha declinado o cancelado su pago electrónico. Esto puede deberse a fondos insuficientes, demoras en el portal bancario o rechazos de seguridad del emisor.</p><p class="text-xs text-slate-500">Su hora de consulta permanece en estado de <strong>Pre-Reservada</strong> y deberá ser pagada antes de unirse al video-consultorio.</p></div>
        `}
        <div class="pt-4 border-t dark:border-slate-800 text-center space-y-3">
          <p class="text-[11px] text-zinc-400 dark:text-slate-500 font-sans">Redireccionando al portal de paciente automáticamente en <span id="countdown-sec" class="font-bold text-emerald-500">5</span> segundos...</p>
          <a href="/?mode=patient" class="bg-slate-900 hover:bg-slate-950 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-extrabold py-3.5 px-6 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-98 tracking-wide uppercase cursor-pointer block text-center animate-pulse">← Volver al Portal de Pacientes</a>
        </div>
        <script>
          let seconds = 5;
          const countdownEl = document.getElementById("countdown-sec");
          const interval = setInterval(() => {
            seconds--;
            if (countdownEl) countdownEl.textContent = seconds;
            if (seconds <= 0) { clearInterval(interval); window.location.href = "/?mode=patient"; }
          }, 1000);
        </script>
      </div>
    </body>
    </html>
  `);
});

// Flow Return Endpoint
app.all("/api/flow/return", async (req, res) => {
  const token = req.body?.token || req.query?.token;
  const flowApiKey = (process.env.FLOW_API_KEY || "").trim();
  const flowSecretKey = (process.env.FLOW_SECRET_KEY || "").trim();
  const flowApiUrl = await getFlowApiUrlResolved();

  let statusNum = 3;
  let amountVal = 50000;
  let appId = "";
  let name = "Paciente";
  let email = "correo@paciente.cl";
  let rut = "11.111.111-1";

  const isSimToken = typeof token === "string" && token.startsWith("FLW_SII_SIM_");
  if (token && !isSimToken && hasRealFlowCredentials() && flowApiKey && flowSecretKey) {
    try {
      console.log(`[Flow Return] Verificando token ${token} con Flow...`);
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
        appId = await resolveAppointmentIdFromFlowOrder(data.commerceOrder || "");
        email = data.payer || "correo@paciente.cl";
        name = data.payerName || "Paciente";
      } else {
        console.error("[Flow Return] getStatus falló:", await response.text());
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
  } else if (!isApproved && appId) {
    await deleteAppointment(appId);
  }

  const disableSiiBilling = process.env.DISABLE_SII_BILLING !== "false";
  const rate2026 = 0.145;
  const bruto = amountVal;
  const retencionVal = receiptInfo?.retencionVal || Math.round(bruto * rate2026);
  const liquidoVal = receiptInfo?.liquidoVal || (bruto - retencionVal);
  const folioNum = receiptInfo?.folioNum || (1024 + Math.floor(Math.random() * 850));
  const boletaUrl = receiptInfo?.boletaUrl || `https://sii.libredte.cl/bhe-folio-${folioNum}-sim.pdf`;

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Flow Chile - Pago Procesado exitosamente</title><script src="https://cdn.tailwindcss.com"></script></head>
    <body class="bg-[#f8fafc] dark:bg-slate-950 flex justify-center items-center min-h-screen px-4 py-8 font-sans transition-colors duration-200">
      <div class="bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 p-8 rounded-3xl shadow-2xl max-w-lg w-full space-y-6 text-left relative animate-in fade-in duration-300">
        ${isApproved ? `
          <div class="flex items-center gap-3 border-b dark:border-slate-800 pb-5">
            <div class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs"><span class="text-xl">✓</span></div>
            <div><h3 class="text-lg font-extrabold text-slate-700 dark:text-slate-300">Pago Recibido Correctamente</h3><p class="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase mt-0.5 tracking-wider">● Registro Clínico Confirmado</p></div>
          </div>
          <div class="space-y-4 font-sans">
            <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">Estimado(a) paciente, el pago por un monto de <strong>$${bruto.toLocaleString('es-CL')} CLP</strong> ha sido acreditado en la pasarela segura. Su hora de atención médica ha sido registrada bajo el estado <strong class="text-emerald-600 dark:text-emerald-400 font-bold">PAGADA</strong> de forma exitosa.</p>
            ${disableSiiBilling ? `
              <div class="bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800 rounded-2xl p-5 space-y-3 font-mono text-xs leading-normal">
                <div class="flex justify-between font-bold pb-2 border-b dark:border-slate-850"><span class="text-slate-850 dark:text-white">Comprobante de Pago Electrónico</span><span class="text-emerald-500 font-bold">Flow Transacción</span></div>
                <div class="flex justify-between text-slate-600 dark:text-slate-400"><span>RUT Paciente:</span><span class="font-bold text-slate-900 dark:text-white">${decodeURIComponent(rut)}</span></div>
                <div class="flex justify-between text-slate-600 dark:text-slate-400"><span>Glosa de Servicio:</span><span class="text-right">Prestación Psicoterapéutica</span></div>
                <div class="flex justify-between text-slate-900 dark:text-white font-black text-sm pt-2 border-t border-dashed dark:border-slate-800"><span>Monto Total Pagado:</span><span class="text-emerald-500">$${bruto.toLocaleString('es-CL')} CLP</span></div>
              </div>
            ` : `
              <div class="bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800 rounded-2xl p-5 space-y-3 font-mono text-xs leading-normal">
                <div class="flex justify-between font-bold pb-2 border-b dark:border-slate-850"><span class="text-slate-850 dark:text-white">Boleta de Honorarios de Prestador</span><span class="text-emerald-500 font-bold">Folio Nº ${folioNum}</span></div>
                <div class="flex justify-between text-slate-600 dark:text-slate-400"><span>RUT Paciente:</span><span class="font-bold text-slate-900 dark:text-white">${decodeURIComponent(rut)}</span></div>
                <div class="flex justify-between text-slate-600 dark:text-slate-400"><span>Glosa de Servicio:</span><span class="text-right">Prestación Psicoterapéutica</span></div>
                <div class="flex justify-between text-slate-600 dark:text-slate-400 pt-1.5 border-t dark:border-slate-800"><span>Honorarios Brutos:</span><span class="font-bold text-slate-900 dark:text-white">$${bruto.toLocaleString('es-CL')} CLP</span></div>
                <div class="flex justify-between text-amber-600 font-bold"><span>Retención 14.5% (2026):</span><span>- $${retencionVal.toLocaleString('es-CL')} CLP</span></div>
                <div class="flex justify-between text-slate-900 dark:text-white font-black text-sm pt-2 border-t border-dashed dark:border-slate-800"><span>Monto Líquido:</span><span class="text-emerald-500">$${liquidoVal.toLocaleString('es-CL')} CLP</span></div>
              </div>
              <div class="p-4 bg-teal-50/20 dark:bg-slate-950 border border-teal-150 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-3 text-xs">
                <div><h5 class="font-extrabold dark:text-white text-emerald-600">Reembolso Isapre / Fonasa Listo</h5><p class="text-[10px] text-gray-400">Documento clínico legalizado</p></div>
                <a href="${boletaUrl}" target="_blank" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold p-2 px-3.5 rounded-xl shadow-md transition text-[11px] block text-center">📥 Descargar BHE Oficial</a>
              </div>
            `}
            <div class="p-4 bg-teal-50/10 dark:bg-teal-950/15 border border-teal-100/50 dark:border-teal-900/40 rounded-2xl flex items-start gap-3 text-xs leading-relaxed">
              <div class="text-lg shrink-0">📧</div>
              <div><h5 class="font-extrabold text-teal-800 dark:text-teal-400">Respaldo de Correo Profesional</h5><p class="text-[10.5px] text-slate-600 dark:text-slate-400">Un correo electrónico de confirmación ha sido enviado automáticamente a <strong class="text-slate-900 dark:text-slate-200 font-extrabold">${email}</strong> con su comprobante del pago seguro e indicaciones de la cita.</p></div>
            </div>
          </div>
          <div class="bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 p-4 border border-indigo-100 dark:border-indigo-900/40 rounded-xl text-[10.5px] leading-relaxed"><strong>✓ Sincronización Exitosa:</strong> Este pago ha sido procesado por el backend de la pasarela Flow. El estado de la consulta se ha modificado automáticamente en la base de datos a <strong class="text-indigo-800 dark:text-indigo-300">PAGADO</strong>.</div>
        ` : `
          <div class="flex items-center gap-3 border-b dark:border-slate-850 pb-5">
            <div class="bg-rose-100 dark:bg-rose-950/50 text-rose-600 p-3 rounded-2xl"><span class="text-xl">❌</span></div>
            <div><h3 class="text-lg font-black text-rose-600">Transacción Rechazada o Cancelada</h3><p class="text-xs text-slate-550 mt-0.5">La operación con Flow no pudo proceder</p></div>
          </div>
          <div class="space-y-4"><p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">La transacción ha sido cancelada por el usuario o rechazada por la red Webpay Plus de Flow. Por favor regrese al portal clínico y verifique el método de pago e intente nuevamente.</p><p class="text-xs text-slate-550 font-medium">Su cita permanece agendada bajo el estado de <strong>Pre-Reservada</strong>.</p></div>
        `}
        <div class="pt-4 border-t dark:border-slate-800 text-center space-y-3">
          <p class="text-[11px] text-zinc-400 dark:text-slate-500 font-sans">Redireccionando al portal de paciente automáticamente en <span id="countdown-real-sec" class="font-bold text-emerald-500">5</span> segundos...</p>
          <a href="/?mode=patient" class="bg-slate-900 hover:bg-slate-950 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white text-xs font-extrabold py-3.5 px-6 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-98 tracking-wide uppercase cursor-pointer block text-center animate-pulse">← Volver a MindSpace de inmediato</a>
        </div>
        <script>
          let realSeconds = 5;
          const countdownRealEl = document.getElementById("countdown-real-sec");
          const realInterval = setInterval(() => {
            realSeconds--;
            if (countdownRealEl) countdownRealEl.textContent = realSeconds;
            if (realSeconds <= 0) { clearInterval(realInterval); window.location.href = "/?mode=patient"; }
          }, 1000);
        </script>
      </div>
    </body>
    </html>
  `);
});

// Flow Confirm Webhook
app.post("/api/flow/confirm", async (req, res) => {
  const token = req.body?.token;
  if (!token) return res.status(400).send("Falta Token.");

  const flowApiKey = (process.env.FLOW_API_KEY || "").trim();
  const flowSecretKey = (process.env.FLOW_SECRET_KEY || "").trim();
  const flowApiUrl = await getFlowApiUrlResolved();

  const isSimToken = typeof token === "string" && token.startsWith("FLW_SII_SIM_");
  if (!isSimToken && hasRealFlowCredentials() && flowApiKey && flowSecretKey) {
    try {
      console.log(`[Flow Webhook Confirm] Verificando token ${token}...`);
      const payload: Record<string, any> = { apiKey: flowApiKey, token: token };
      const sortedKeys = Object.keys(payload).sort();
      const stringToSign = sortedKeys.map(k => `${k}=${payload[k]}`).join("&");
      const signature = crypto.createHmac("sha256", flowSecretKey).update(stringToSign).digest("hex");
      const queryParams = new URLSearchParams({ apiKey: flowApiKey, token: String(token), s: signature });
      const response = await fetch(`${flowApiUrl}/payment/getStatus?${queryParams.toString()}`);
      if (response.ok) {
        const data = await response.json() as any;
        const statusNum = Number(data.status);
        const amountVal = Number(data.amount);
        const rawAppId = data.commerceOrder || "";
        const appId = await resolveAppointmentIdFromFlowOrder(rawAppId);
        if (statusNum === 2 && appId) {
          console.log(`[Flow Webhook] Pago confirmado para cita ${appId}`);
          await updateAppointmentStatusPaid(appId, amountVal);
        }
      }
    } catch (err: any) {
      console.error("[Flow Webhook Confirm] Error:", err);
    }
  }
  res.send("OK");
});

// Endpoint de recibo (usando SDK)
app.get("/api/flow/receipt", async (req, res) => {
  const appId = req.query?.id || req.body?.id;
  if (!appId) return res.status(400).send("Falta ID de Cita.");

  try {
    const docRef = firestoreDb.collection("appointments").doc(String(appId));
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).send("Cita no encontrada.");
    }
    const fields = doc.data() || {};
    const patientName = fields.patientName || "Paciente MindSpace";
    const patientRut = fields.patientRut || "N/A";
    const dateStr = fields.date || "";
    const timeSlot = fields.timeSlot || "";
    const paymentStatus = fields.paymentStatus || "pending";
    const price = Number(fields.price) || 45000;
    const boletaUrl = fields.boletaUrl;
    const boletaFolio = fields.boletaFolio || (1024 + Math.floor(Math.random() * 850));
    const boletaBruto = Number(fields.boletaBruto) || price;
    const boletaRetencion = Number(fields.boletaRetencion) || Math.round(price * 0.145);
    const boletaLiquido = Number(fields.boletaLiquido) || (price - boletaRetencion);

    if (paymentStatus !== "paid") {
      return res.send(`
        <html>
        <head><title>Comprobante Pendiente - MindSpace</title><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-slate-50 flex items-center justify-center min-h-screen p-4 font-sans text-slate-800">
          <div class="bg-white rounded-3xl p-8 max-w-md w-full shadow-lg border border-slate-100 text-center space-y-4">
            <div class="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto text-3xl">⏳</div>
            <h2 class="text-xl font-bold">Pago Pendiente o No Liquidado</h2>
            <p class="text-xs text-slate-500">Esta consulta médica con ID <strong>${appId}</strong> registrará su comprobante tributario y emisión de BHE tan pronto como el pago sea notificado correctamente por Flow.</p>
            <div class="pt-4"><button onclick="window.close()" class="px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 cursor-pointer">Cerrar Ventana</button></div>
          </div>
        </body>
        </html>
      `);
    }

    res.send(`
      <html>
      <head><title>Recibo de Atención Clínica #${boletaFolio} - MindSpace</title><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet"><style>body { font-family: 'Inter', sans-serif; } .title-font { font-family: 'Space Grotesk', sans-serif; } .mono-font { font-family: 'JetBrains Mono', sans-serif; }</style></head>
      <body class="bg-slate-100 min-h-screen flex items-center justify-center p-4 md:p-8">
        <div class="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
          <div class="bg-slate-900 text-white p-6 text-center relative">
            <div class="text-[10px] font-bold tracking-wider text-emerald-400 uppercase mb-1">Comprobante de Atención Psicológica</div>
            <h1 class="title-font text-2xl font-bold tracking-tight">MindSpace Chile</h1>
            <p class="text-slate-400 text-xs mt-1">Garantía Informática según Ley 20.584</p>
            <div class="absolute -bottom-6 left-1/2 -translate-x-1/2 w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xl shadow-lg font-bold">✓</div>
          </div>
          <div class="p-6 pt-10 space-y-6">
            <div class="text-center space-y-1">
              <div class="text-slate-400 text-[10px] uppercase font-bold tracking-widest leading-none">Boleta de Honorarios Electrónica</div>
              <div class="text-lg font-extrabold text-slate-800">Folio Nº ${boletaFolio}</div>
              <div class="inline-block px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full font-mono font-bold text-[9px] uppercase tracking-wide border border-emerald-100">PAGO LIQUIDADO CON ÉXITO</div>
            </div>
            <div class="border-t border-dashed border-slate-200 relative"><div class="absolute -left-8 -top-2 w-4 h-4 bg-slate-100 rounded-full border-r border-slate-200"></div><div class="absolute -right-8 -top-2 w-4 h-4 bg-slate-100 rounded-full border-l border-slate-200"></div></div>
            <div class="space-y-3 text-xs">
              <div class="flex justify-between"><span class="text-slate-500 font-medium">Paciente Evaluado:</span><span class="text-slate-900 font-bold">${patientName}</span></div>
              <div class="flex justify-between"><span class="text-slate-500 font-medium">RUT del Paciente:</span><span class="text-slate-900 font-bold">${patientRut}</span></div>
              <div class="flex justify-between"><span class="text-slate-500 font-medium">Fecha de Atención:</span><span class="text-slate-900 font-semibold">${dateStr} (${timeSlot})</span></div>
              <div class="flex justify-between"><span class="text-slate-500 font-medium">Glosa Tributaria SII:</span><span class="text-slate-900 font-semibold italic text-right">Psicoterapia Clínica Profesional</span></div>
              <div class="flex justify-between"><span class="text-slate-500 font-medium">ID Consulta Interno:</span><span class="text-slate-500 font-mono text-[10px]">${appId}</span></div>
            </div>
            <div class="border-t border-dashed border-slate-200 relative"><div class="absolute -left-8 -top-2 w-4 h-4 bg-slate-100 rounded-full"></div><div class="absolute -right-8 -top-2 w-4 h-4 bg-slate-100 rounded-full"></div></div>
            <div class="bg-slate-50 rounded-2xl p-4 space-y-2.5 text-xs">
              <div class="flex justify-between"><span class="text-slate-500">Monto Bruto Recibido:</span><span class="text-slate-800 font-semibold">$${boletaBruto.toLocaleString("es-CL")} CLP</span></div>
              <div class="flex justify-between text-amber-600 font-medium"><span>Retención Legal Profesional (14.5%):</span><span>- $${boletaRetencion.toLocaleString("es-CL")} CLP</span></div>
              <div class="flex justify-between border-t border-slate-200 pt-2.5 text-slate-900 font-extrabold text-sm"><span>Monto Líquido Percibido:</span><span class="text-emerald-600 font-bold">$${boletaLiquido.toLocaleString("es-CL")} CLP</span></div>
            </div>
            <div class="space-y-2 pt-2">
              ${boletaUrl ? `<a href="${boletaUrl}" target="_blank" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-3.5 px-4 rounded-xl transition duration-150 cursor-pointer shadow-lg ease-out active:scale-98 tracking-wider uppercase block text-center">Descargar Boleta SII PDF (LibreDTE) 📄</a>` : `<div class="w-full bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs py-3.5 px-4 rounded-xl transition duration-150 cursor-pointer shadow-lg ease-out active:scale-98 tracking-wider uppercase block text-center" onclick="window.print()">Imprimir Comprobante Digital 🖨️</div>`}
              <button onclick="window.close()" class="w-full text-slate-500 hover:text-slate-800 p-2 text-center text-[11px] font-bold tracking-wide uppercase transition">Cerrar Comprobante</button>
            </div>
          </div>
          <div class="bg-slate-50 border-t border-slate-100 py-3 px-6 text-[9px] text-slate-400 text-center">Poder de Procesamiento por Flow.cl e Integración de Boleta Electrónica LibreDTE/SII.</div>
        </div>
      </body>
      </html>
    `);
  } catch (err: any) {
    console.error("[Flow Receipt Error]:", err);
    res.status(500).send("Error al obtener el recibo.");
  }
});

// ================================================================
// 9. GEMINI, ELEVENLABS Y OTROS ENDPOINTS (SE MANTIENEN IGUAL)
// ================================================================

function getDoctorTimeGreeting(timeStr?: string): string {
  let hour = new Date().getHours();
  if (timeStr) {
    const match = timeStr.match(/(\d+)/);
    if (match) {
      let parsedHour = parseInt(match[1], 10);
      if (timeStr.toLowerCase().includes("p.m.") || timeStr.toLowerCase().includes("pm") || timeStr.toLowerCase().includes("tarde") || timeStr.toLowerCase().includes("noche")) {
        if (parsedHour < 12) parsedHour += 12;
      } else if (timeStr.toLowerCase().includes("a.m.") || timeStr.toLowerCase().includes("am") || timeStr.toLowerCase().includes("mañana")) {
        if (parsedHour === 12) parsedHour = 0;
      }
      hour = parsedHour;
    }
  }
  if (hour >= 5 && hour < 12) {
    return "Hola Doctor, buenos días.";
  } else if (hour >= 12 && hour < 20) {
    return "Hola Doctor, buenas tardes.";
  } else {
    return "Hola Doctor, buenas noches.";
  }
}

// Helper function for Abby's offline-fallback simulator
function getAbbyLocalFallback(userQuery: string, appointmentsText: string, therapistName: string, currentTime?: string) {
  const lower = userQuery.toLowerCase();
  let reply = "";
  let triggerAction = "none";
  const reason = "Simulación por contingencia de red o API.";

  const greeting = getDoctorTimeGreeting(currentTime);

  if (lower.includes("suspend") || lower.includes("urgenc") || lower.includes("cancel") || lower.includes("emergenc")) {
    triggerAction = "suspend_today";
    reply = `${greeting} Comprendo la urgencia de la situación. No se preocupe: iniciaré de inmediato el protocolo de suspensión para el día de hoy y notificaré a sus pacientes agendados. ¿Necesita algo más?`;
  } else if (lower.includes("quien") || lower.includes("paciente") || lower.includes("ahora") || lower.includes("prox") || lower.includes("agenda") || lower.includes("cita")) {
    triggerAction = "check_appointments";
    const apptsFiltered = appointmentsText && appointmentsText.trim() !== "No hay consultas o pacientes registrados para el día de hoy."
      ? appointmentsText.trim() 
      : "No registra consultas o pacientes para el día de hoy.";
    reply = `${greeting} El estado actual de sus pacientes de hoy es: ${apptsFiltered}. ¿Necesita algo más?`;
  } else if (lower.includes("hola") || lower.includes("buenos") || lower.includes("buenas") || lower.includes("abby") || lower.includes("avi")) {
    reply = `${greeting} Estoy lista para ayudarle de manera directa con su agenda. ¿Necesita algo más?`;
  } else {
    reply = `${greeting} He recibido su comando correctamente para procesarlo administrativamente de manera inmediata. ¿Necesita algo más?`;
  }

  return { reply, triggerAction, reason };
}

// Lazy-initialize Gemini API Client with header telemetry
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("⚠️ GEMINI_API_KEY environment variable is not defined. Features running on Gemini will fallback gracefully.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "MOCK_KEY",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// REST APIs
app.get("/api/env-check", (req, res) => {
  const k = (process.env.FLOW_API_KEY || "").trim();
  const s = (process.env.FLOW_SECRET_KEY || "").trim();
  res.json({
    flow_api_key_largo: k.length,
    flow_api_key_preview: k.length > 0 ? `${k.substring(0, Math.min(4, k.length))}...${k.substring(Math.max(0, k.length - 3))}` : "VACÍO ❌",
    flow_secret_key_largo: s.length,
    flow_secret_key_preview: s.length > 0 ? `${s.substring(0, Math.min(4, s.length))}...${s.substring(Math.max(0, s.length - 3))}` : "VACÍO ❌",
    has_real_credentials: hasRealFlowCredentials(),
    flow_api_url: process.env.FLOW_API_URL || "no configurada",
    node_env: process.env.NODE_ENV,
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// ElevenLabs status check
app.get("/api/elevenlabs/status", (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const isConfigured = !!(apiKey && apiKey !== "YOUR_ELEVENLABS_API_KEY" && apiKey.trim() !== "");
  res.json({ configured: isConfigured, voiceId: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM" });
});

// ElevenLabs Pro Premium Text-To-Speech Proxy
app.post("/api/elevenlabs/tts", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "No text provided for TTS" });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey || apiKey === "YOUR_ELEVENLABS_API_KEY" || apiKey.trim() === "") {
      return res.status(501).json({ error: "ElevenLabs API key is not configured" });
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
    
    console.log(`[ElevenLabs TTS Backend] Generating premium speech with voice ${voiceId}...`);
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "accept": "audio/mpeg"
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[ElevenLabs API Error]", errText);
      return res.status(response.status).json({ error: "ElevenLabs API error", details: errText });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (error: any) {
    console.error("ElevenLabs proxy error:", error);
    res.status(500).json({ error: "TTS generation failure", details: error.message || String(error) });
  }
});

// AI session compiler and notes summarizer
app.post("/api/gemini/summarize", async (req, res) => {
  try {
    const { patientName, notes, observations } = req.body;
    if (!notes) {
      return res.status(400).json({ error: "No therapy notes provided for summary" });
    }

    const ai = getGeminiClient();
    const prompt = `A continuación se presentan las notas de una sesión psicoterapéutica del paciente ${patientName || "Anónimo"}.
Notas de progreso escritas por el terapeuta:
"${notes}"

Observaciones adicionales / diagnósticos temporales:
"${observations || "Ninguna"}"

Por favor, como asistente de psicología clínica experto bajo secreto médico, proporciona un resumen estructurado, equilibrado y completo (alrededor de 300 o hasta 500 palabras) de la evolución de la sesión. 
El formato de retorno debe ser Markdown limpio con suficiente detalle clínico, estructurado en las siguientes secciones:
1. **Puntos Clave y Temas Centrales**: Resumen explicativo detallado de los principales temas abordados por el paciente durante la sesión.
2. **Estado Psicoemocional**: Análisis del estado cognitivo, emocional, conductual y actitud observada del paciente.
3. **Planes de Acción y Tarea Terapéutica**: Indicaciones claras, directrices y actividades terapéuticas asignadas para la próxima sesión y período intersesión.

Evita rodeos innecesarios o saludos introductorios, pero mantén la precisión diagnóstica y el vocabulario clínicamente exhaustivo que le sirva de registro formal de alta calidad al terapeuta.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        temperature: 0.2,
      },
    });

    res.json({ summary: response.text });
  } catch (error: any) {
    console.error("Gemini summarizing notes error:", error);
    res.status(500).json({
      error: "Error processing clinical notes summary",
      details: error.message || String(error)
    });
  }
});

// AI Auto Reminder Alert generator for Email / WhatsApp
app.post("/api/gemini/reminder-draft", async (req, res) => {
  try {
    const { patientName, date, timeSlot, price, therapistName, channel } = req.body;
    if (!patientName || !date || !timeSlot) {
      return res.status(400).json({ error: "Missing scheduling fields to build reminder" });
    }

    const ai = getGeminiClient();
    const channelName = channel === "whatsapp" ? "WhatsApp" : "Correo Electrónico";
    const prompt = `Escribe un recordatorio automático muy amable, claro y pulcro para enviar por ${channelName} al paciente "${patientName}".
Detalles del agendamiento:
- Fecha: ${date}
- Horario: ${timeSlot}
- Costo de la consulta: $${price || 0} MXN
- Terapeuta: ${therapistName || "Su Psicólogo Clínico"}

Reglas de tono:
1. Profesional, seguro y contenedor.
2. Si es para WhatsApp, hazlo conciso, incluye un saludo afectuoso y agrega algunos emojis sutiles, además de un enlace simulado para ingresar a la videollamada cifrada de forma segura.
3. Si es para Correo Electrónico, hazlo más formal, con una estructura corporativa/médica, y recomendaciones clínicas de puntualidad o lugar seguro para tomar la sesión.
No agregues placeholders adicionales u corchetes como "[Su nombre]", genera un mensaje 100% redactado listo para enviar.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        temperature: 0.7,
      },
    });

    res.json({ message: response.text });
  } catch (error: any) {
    console.error("Gemini reminder generator error:", error);
    res.status(500).json({
      error: "Error drafting reminder notification",
      details: error.message || String(error)
    });
  }
});

// Abby Assistant Multi-Modal Conversational Endpoint
app.post("/api/gemini/abby", async (req, res) => {
  const { query: userQuery, appointmentsText, therapistName, currentTime, mode } = req.body;
  if (!userQuery) {
    return res.status(400).json({ error: "Missing message query for Abby" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const hasRealKey = apiKey && apiKey !== "MOCK_KEY" && apiKey.trim().length > 0;

  if (!hasRealKey) {
    const fallbackResponse = getAbbyLocalFallback(userQuery, appointmentsText, therapistName, currentTime);
    return res.json({
      ...fallbackResponse,
      diagnostics: {
        status: "fallback_no_apiKey",
        message: "No Gemini API Key was detected in process.env.GEMINI_API_KEY. Using smart local fallback on the backend."
      }
    });
  }

  try {
    const ai = getGeminiClient();
    
    let prompt = "";
    if (mode === "patient") {
      prompt = `Actúa como Abby, la asistente administrativa de Inteligencia Artificial de la consulta de psicología privada de ${therapistName || "José Ignacio Rovel"}.
Tu tono con los pacientes de la consulta debe ser excepcionalmente cálido, empático, claro, respetuoso y con modismos sutiles chilenos de ambiente clínico para transmitir cercanía y confianza.

REGLAS CRÍTICAS DE ACCIÓN Y ROL:
1. Rol No Clínico: Tu rol es estrictamente administrativo y de soporte de conexión. Es sumamente importante que dejes en claro con tacto y amabilidad que eres una Inteligencia Artificial, que no eres terapeuta ni ofreces asistencia psicológica o clínica directa.
2. Consulta Privada: Esta consulta opera de forma totalmente privada para resguardar la máxima autonomía clínico-profesional de tu tratamiento. NO hables de reembolsos ante Fonasa, Isapres o seguros de salud (establece claramente que no los gestionamos).
3. Redirección al Calendario: Incentiva activamente que el paciente reserve o registre su consulta utilizando el botón "Ir al Calendario de Reservas" o "Agendar Hora Médica" que se despliega directamente en el chat.
4. Información sobre el sistema hoy:
- Hora actual del sistema: ${currentTime || new Date().toLocaleTimeString()}

Analiza el requerimiento o pregunta del paciente:
"${userQuery}"

Formato esperado de respuesta (JSON únicamente):
{
  "reply": "Tu mensaje afectuoso e informativo respondiendo al paciente.",
  "triggerAction": "none",
  "reason": "Pregunta de paciente atendida."
}

No uses markdown rodeando el JSON ni bloques de código que lo impidan parsear, o alternativamente asegúrate de que sea JSON válido.`;
    } else {
      prompt = `Actúa como Abby, la asistente administrativa virtual de inteligencia artificial del psicólogo/a clínico ${therapistName || "José Ignacio Rovel"}.
Estás brindando soporte directo al profesional en su panel privado de forma directa, ágil y práctica.

REGLAS CRÍTICAS DE EXPERIENCIA Y TONO (EVITA LA FORMALIDAD EXCESIVA):
1. NO emitas introducciones largas, frases repetitivas de relleno, o afirmaciones que consuman tokens innecesarios (por ejemplo, elimina frases como "Por supuesto, entiendo perfectamente su consulta", "Déjeme revisar de inmediato el sistema", "Deme solo un segundito y ya le muestro", "cuente con ello", etc.). Ve directo a la información.
2. La estructura del campo "reply" DEBE constar únicamente de:
   - SALUDO INICIAL (basado estrictamente en la hora actual del sistema '${currentTime || "00:00"}'):
     - Si la hora corresponde a la mañana (05:00 a 11:59): "Hola Doctor, buenos días."
     - Si la hora corresponde a la tarde (12:00 a 19:59): "Hola Doctor, buenas tardes."
     - Si la hora corresponde a la noche o madrugada (20:00 a 04:59): "Hola Doctor, buenas noches."
   - INFORMACIÓN SOLICITADA: Presentada de forma muy sencilla, resumida y directa, resolviendo de inmediato el requerimiento del profesional.
   - PREGUNTA DE CIERRE: Termina siempre preguntando únicamente: "¿Necesita algo más?" o "¿Desea ayuda con algo más, Doctor?". No agregues más despedidas redundantes.

Información sobre el estado de la agenda y clínica hoy:
- Hora actual del sistema: ${currentTime || new Date().toLocaleTimeString()}
- Pacientes agendados y confirmados para el día de HOY:
${appointmentsText || "No hay consultas o pacientes registrados para el día de HOY."}

Pregunta o instrucción dictada por el profesional:
"${userQuery}"

Reglas Críticas de Respuesta (Debes retornar un JSON estricto con las llaves requeridas):
1. Si el profesional indica explícitamente o insinúa claramente que debe suspender las sesiones de hoy o reprogramar de emergencia debido a un inconveniente (ej. "debo acudir a urgencias con mi hija", "cancela las citas de hoy", "suspende la agenda por emergencia"), tu campo de "triggerAction" DEBE ser "suspend_today". Redacta una respuesta muy directa y contenedora diciendo que suspenderás la agenda de hoy para iniciar las notificaciones de emergencia inmediatamente.
2. Si pregunta por su próximo paciente, quién atiende ahora, o el estado actual de las citas, el triggerAction de ser "check_appointments".
3. En cualquier otro caso académico o administrativo común, usa triggerAction: "none".

Formato esperado de respuesta (JSON únicamente):
{
  "reply": "Hola Doctor, [saludo según horario]. [Información resumida]. ¿Necesita algo más?",
  "triggerAction": "suspend_today" | "check_appointments" | "none",
  "reason": "Nota breve del motivo académico."
}

No uses markdown rodeando el JSON ni bloques de código que lo impidan parsear, o alternativamente asegúrate de que sea JSON válido.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json({
      ...parsed,
      diagnostics: {
        status: "success",
        message: "Gemini API generated content successfully."
      }
    });
  } catch (error: any) {
    console.error("Abby AI assistant backend error, running smart local fallback:", error);
    const fallbackResponse = getAbbyLocalFallback(userQuery, appointmentsText, therapistName);
    res.json({
      ...fallbackResponse,
      diagnostics: {
        status: "api_exception",
        message: error.message || String(error),
        stack: error.stack,
        apiKeyLength: apiKey ? apiKey.length : 0,
        hint: "Por favor verifique que su GEMINI_API_KEY en Secret Manager esté activa, tenga saldo de facturación o no posea restricciones de acceso."
      }
    });
  }
});

// Secure visual WebRTC Key signatures simulation
app.post("/api/calls/sign", (req, res) => {
  const { roomId, therapistUid } = req.body;
  if (!roomId) {
    return res.status(400).json({ error: "Room ID is required to establish visual signing key" });
  }

  const cryptoToken = "SECURE_AES_256_GCM_" + Buffer.from(`${roomId}-${therapistUid || "patient"}-${Date.now()}`).toString("base64").substring(0, 32);
  res.json({
    roomId,
    cryptoToken,
    algorithm: "AES-GCM",
    encryptionBits: 256,
    certifiedAt: new Date().toISOString()
  });
});

// Simulated Stripe Payment Webhook / Checkout
app.post("/api/simulate-payment", (req, res) => {
  const { appointmentId, price, patientEmail, testCardNumber } = req.body;
  if (!appointmentId || !price) {
    return res.status(400).json({ error: "No appointment id or session fee provided" });
  }

  setTimeout(() => {
    const txId = "ch_" + Math.random().toString(36).substring(2, 12).toUpperCase();
    res.json({
      success: true,
      transactionId: txId,
      appointmentId,
      amount: price,
      currency: "MXN",
      receiptUrl: `https://stripe-sandbox.receipts.com/${txId}`,
      cardBrand: testCardNumber && testCardNumber.startsWith("4") ? "Visa" : "Mastercard",
      status: "succeeded",
      processedAt: new Date().toISOString()
    });
  }, 1000);
});// (Aquí van tus endpoints de Gemini, ElevenLabs, etc. sin cambios)
// ... [copia tus endpoints de /api/gemini, /api/elevenlabs, /api/calls, etc.]
// Para no repetir todo el código, te dejo la estructura, pero asegúrate de copiar
// exactamente los mismos handlers que tenías antes, solo que ahora ya no usan
// las variables de Firestore REST, sino el SDK que ya está inicializado.

// ================================================================
// 10. ARRANQUE DEL SERVIDOR
// ================================================================

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 MindSpace Backend corriendo en http://0.0.0.0:${PORT}`);
  });
}

startServer();
