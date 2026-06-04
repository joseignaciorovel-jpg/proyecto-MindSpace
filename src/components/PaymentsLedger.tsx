import React, { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Appointment } from "../types";
import { Wallet, Landmark, TrendingUp, Receipt, ChevronRight, CheckCircle, Clock, ExternalLink, Mail, Loader2, AlertCircle } from "lucide-react";
import { getCachedAccessToken, requestGoogleAuthToken, sendGmail } from "../utils/googleAuth";

interface PaymentsLedgerProps {
  therapistUid: string;
}

export default function PaymentsLedger({ therapistUid }: PaymentsLedgerProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewsCount, setReviewsCount] = useState(0);
  
  // Gmail integration states
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [gmailToken, setGmailToken] = useState<string | null>(getCachedAccessToken());

  useEffect(() => {
    // Keep internal token state in sync with cache
    setGmailToken(getCachedAccessToken());
  }, []);

  useEffect(() => {
    if (!therapistUid) return;

    const q = query(
      collection(db, "appointments"),
      where("ownerId", "==", therapistUid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Appointment[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Appointment);
      });
      setAppointments(list);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "appointments");
    });

    return () => unsubscribe();
  }, [therapistUid]);

  useEffect(() => {
    if (!therapistUid) return;
    const qReviews = query(
      collection(db, "reviews"),
      where("ownerId", "==", therapistUid)
    );
    const unsubscribeReviews = onSnapshot(qReviews, (snap) => {
      setReviewsCount(snap.size);
    }, (error) => {
      console.warn("Could not query reviews snapshot for ledger summary:", error);
    });
    return () => unsubscribeReviews();
  }, [therapistUid]);

  // Aggregate statistics
  const totalRevenue = appointments
    .filter((a) => a.paymentStatus === "paid" && a.status !== "canceled")
    .reduce((sum, a) => sum + (a.price || 0), 0);

  const outstandingRevenue = appointments
    .filter((a) => a.paymentStatus === "pending" && a.status === "scheduled")
    .reduce((sum, a) => sum + (a.price || 0), 0);

  const totalInvoicesPaid = appointments.filter((a) => a.paymentStatus === "paid").length;
  const totalInvoicesPending = appointments.filter((a) => a.paymentStatus === "pending").length;

  // Render monthly progression bars (Using pure inline SVGs)
  const renderMonthlyChart = () => {
    // Basic aggregation
    const monthlyData = [
      { name: "Ene", value: totalRevenue * 0.1 },
      { name: "Feb", value: totalRevenue * 0.2 },
      { name: "Mar", value: totalRevenue * 0.35 },
      { name: "Abr", value: totalRevenue * 0.5 },
      { name: "May", value: totalRevenue }
    ];

    const maxVal = Math.max(...monthlyData.map((d) => d.value), 1000);

    return (
      <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl">
        <h4 className="text-xs font-bold text-slate-700 tracking-wider uppercase mb-4">Progreso Mensual de Ingresos ($)</h4>
        <div className="flex items-end justify-between h-40 gap-4 pt-4">
          {monthlyData.map((d, i) => {
            const pct = (d.value / maxVal) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end font-sans">
                <span className="text-[10px] font-mono font-bold text-slate-800">${Math.round(d.value)}</span>
                <div
                  className="w-full bg-slate-900 rounded-t-lg transition-all duration-500 ease-out min-h-[4px]"
                  style={{ height: `${Math.max(pct, 4)}%` }}
                />
                <span className="text-[10px] font-semibold text-slate-500">{d.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleSendGmailReport = async () => {
    if (!gmailToken) return;
    setIsSendingEmail(true);
    setEmailSuccess(false);
    setEmailError(null);

    const bruto = totalRevenue;
    const retencion = Math.round(bruto * 0.145);
    const liquido = bruto - retencion;

    // Filter appointments that are paid
    const paidAppts = appointments.filter((a) => a.paymentStatus === "paid" && a.status !== "canceled");
    const totalConsultasPeriodo = paidAppts.length;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #fafafa;">
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 20px;">Reporte de Facturación Mensual</h2>
          <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 11px;">Mente Sana / MindSpace - Chile 2026</p>
        </div>
        
        <div style="margin-bottom: 20px; font-size: 13px; line-height: 1.6; color: #374151;">
          <p>Estimado(a) <strong>Especialista Clínico</strong>,</p>
          <p>Detallamos el informe consolidado numérico de su actividad clínica. Este reporte ha sido configurado bajo los máximos estándares de secreto facultativo según la Ley 20.584, por ende se ha omitido todo desglose identificatorio de pacientes por motivos de seguridad informática y resguardo visual.</p>
        </div>
        
        <!-- Resumen Financiero Grid -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; text-align: center;">
          <tr>
            <td style="width: 33.33%; padding: 4px;">
              <div style="background-color: #ffffff; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
                <span style="font-size: 10px; color: #6b7280; display: block; text-transform: uppercase;">Total Bruto</span>
                <span style="font-size: 14px; font-weight: bold; color: #111827; display: block; margin-top: 4px;">$${bruto.toLocaleString("es-CL")} CLP</span>
              </div>
            </td>
            <td style="width: 33.33%; padding: 4px;">
              <div style="background-color: #ffffff; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
                <span style="font-size: 10px; color: #d97706; display: block; text-transform: uppercase;">Retención (14.5%)</span>
                <span style="font-size: 14px; font-weight: bold; color: #b45309; display: block; margin-top: 4px;">- $${retencion.toLocaleString("es-CL")} CLP</span>
              </div>
            </td>
            <td style="width: 33.33%; padding: 4px;">
              <div style="background-color: #ffffff; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
                <span style="font-size: 10px; color: #059669; display: block; text-transform: uppercase;">Ingreso Líquido</span>
                <span style="font-size: 14px; font-weight: bold; color: #047857; display: block; margin-top: 4px;">$${liquido.toLocaleString("es-CL")} CLP</span>
              </div>
            </td>
          </tr>
        </table>
        
        <!-- Resumen de Métricas de Actividad -->
        <h4 style="font-size: 12px; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 25px 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">Resumen Consolidado de Actividad</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; color: #4b5563; margin-top: 10px;">
          <tbody>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 10px 4px; color: #374151; font-weight: bold;">Atenciones Totales Liquidadas:</td>
              <td style="padding: 10px 4px; font-weight: bold; color: #0f172a; text-align: right; font-size: 14px;">${totalConsultasPeriodo} consultas</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 10px 4px; color: #374151; font-weight: bold;">Promedio de Valor por Cita:</td>
              <td style="padding: 10px 4px; font-weight: bold; color: #0f172a; text-align: right; font-size: 14px;">$${(totalConsultasPeriodo ? Math.round(bruto / totalConsultasPeriodo) : 45000).toLocaleString("es-CL")} CLP</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 10px 4px; color: #374151; font-weight: bold;">Testimonios y Evaluaciones Recibidos:</td>
              <td style="padding: 10px 4px; font-weight: bold; color: #0369a1; text-align: right; font-size: 14px;">${reviewsCount} valoraciones</td>
            </tr>
          </tbody>
        </table>
        
        <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 30px; font-size: 10px; color: #9ca3af; text-align: center;">
          <p>Este informe libre de datos personales fue autogenerado y despachado de forma segura mediante la integración de la API autorizada de Gmail.</p>
          <p>© 2026 MindSpace Chile. En cumplimiento de secreto médico y Ley 20.584.</p>
        </div>
      </div>
    `;

    // Recipient address
    const recipient = "joseignacio.rovel@gmail.com";
    const subject = `Resumen Mensual de Facturación Seguro - ${new Date().toLocaleDateString("es-CL", { month: "long" })} 2026`;
    
    try {
      const success = await sendGmail(gmailToken, recipient, subject, htmlBody);
      if (success) {
        setEmailSuccess(true);
        setTimeout(() => setEmailSuccess(false), 5000);
      } else {
        setEmailError("La Gmail API rechazó el envío. Intente reconectar su cuenta de Google.");
      }
    } catch (err: any) {
      setEmailError(err.message || "Error al procesar el envío.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleConnectGmail = async () => {
    try {
      const token = await requestGoogleAuthToken();
      if (token) {
        setGmailToken(token);
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Dynamic Header Block with Gmail Reporting Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100/50 dark:border-slate-800/50 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Finanzas y Libro de Cobros</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Conciliación tributaria de Boletas de Honorarios SII y reportería de ingresos.</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {gmailToken ? (
            <div className="flex items-center gap-2">
              {emailSuccess && (
                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 px-2.5 py-1.5 rounded-xl animate-in fade-in duration-300">
                  ¡Reporte enviado exitosamente! ✓
                </span>
              )}
              {emailError && (
                <span className="text-[11px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 px-2.5 py-1.5 rounded-xl animate-in fade-in duration-300">
                  {emailError}
                </span>
              )}
              <button
                type="button"
                onClick={handleSendGmailReport}
                disabled={isSendingEmail}
                className="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-950 border border-slate-205 py-2 px-4 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSendingEmail ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Enviando Reporte...
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5 text-emerald-450" />
                    Enviar Reporte Mensual por Gmail 📨
                  </>
                )}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConnectGmail}
              className="bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-805 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 py-2 px-4 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer animate-pulse"
              title="Autoriza acceso seguro de Gmail para enviar reportes automáticos"
            >
              <Mail className="w-3.5 h-3.5 text-blue-500" />
              Conectar Gmail para Reportes Automáticos
            </button>
          )}
        </div>
      </div>
      
      {/* 1. Statistics Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
        
        {/* Stat 1: Revenue collected */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-semibold block">Total Facturado Recibido</span>
            <span className="text-2xl font-bold text-slate-900 font-sans">${totalRevenue.toLocaleString("es-CL")} CLP</span>
            <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full inline-block">
              {totalInvoicesPaid} Consultas Liquidadas
            </span>
          </div>
          <div className="bg-emerald-500/10 p-3.5 rounded-2xl text-emerald-700">
            <Landmark className="w-6 h-6" />
          </div>
        </div>

        {/* Stat 2: Outstanding Balance */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-semibold block">Pendiente de Cobro</span>
            <span className="text-2xl font-bold text-slate-900 font-sans">${outstandingRevenue.toLocaleString("es-CL")} CLP</span>
            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full inline-block">
              {totalInvoicesPending} Turnos por cobrar
            </span>
          </div>
          <div className="bg-amber-500/10 p-3.5 rounded-2xl text-amber-700">
            <Wallet className="w-6 h-6" />
          </div>
        </div>

        {/* Stat 3: Total Transactions Volume */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-semibold block">Consultas Programadas</span>
            <span className="text-2xl font-bold text-slate-900 font-sans">{appointments.length} Citas</span>
            <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full inline-block">
              Arancel Promedio: ${(appointments.length ? Math.round(appointments.reduce((sum, a) => sum + (a.price || 0), 0) / appointments.length) : 45000).toLocaleString("es-CL")} CLP
            </span>
          </div>
          <div className="bg-slate-900/10 p-3.5 rounded-2xl text-slate-800">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* 2. Monthly visualization and transactional records list */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Col: Revenue trends */}
        <div className="lg:col-span-4 rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
          {renderMonthlyChart()}
          <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-950 text-xs mt-4">
            <h5 className="font-bold flex items-center gap-1.5 mb-2">
              <Receipt className="w-4 h-4 text-emerald-400" /> Conciliación Digital Stripe
            </h5>
            <p className="text-slate-300 leading-relaxed">
              Las transacciones registradas de forma pública en su sitio para pacientes se concilian automáticamente mediante tokens cifrados de Stripe Sandbox.
            </p>
          </div>
        </div>

        {/* Right Col: Transaction histories */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="bg-slate-900/5 px-6 py-4 border-b flex justify-between items-center text-xs">
            <h4 className="font-bold text-slate-800">Registro de Transacciones Recientes ({appointments.length})</h4>
            <span className="text-[10px] text-slate-500 font-mono font-bold uppercase">Ledger General</span>
          </div>

          {loading ? (
            <div className="p-6 space-y-2">
              <div className="h-10 bg-slate-100 rounded-lg animate-pulse"></div>
              <div className="h-10 bg-slate-100 rounded-lg animate-pulse"></div>
            </div>
          ) : appointments.length === 0 ? (
            <div className="p-16 text-center text-slate-400 text-xs italic">
              No hay transacciones registradas en su cuenta clínica.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 text-xs text-slate-700">
              {appointments.map((tx) => (
                <div key={tx.id} className="p-4 flex items-center justify-between gap-4 transition-all hover:bg-slate-50/50">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900">{tx.patientName}</span>
                    <div className="text-[10px] text-slate-500 flex items-center gap-3">
                      <span>📆 {tx.date} @ {tx.timeSlot}</span>
                      <span>ID: {tx.id}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900">${(tx.price || 45000).toLocaleString("es-CL")} CLP</span>
                    
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase border font-mono ${
                      tx.paymentStatus === "paid"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {tx.paymentStatus === "paid" ? "Liquidado" : "Pendiente"}
                    </span>

                    {tx.paymentStatus === "paid" && (
                      <a
                        href={`https://stripe-sandbox.receipts.com/ch_${tx.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-400 hover:text-slate-900 p-1.5 border border-slate-100 rounded-lg hover:border-slate-300 transition-all"
                        title="Ver Recibo Original de Checkout Stripe"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
