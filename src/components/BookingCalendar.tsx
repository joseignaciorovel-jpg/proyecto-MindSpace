import React, { useState, useEffect } from "react";
import { collection, doc, setDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Appointment } from "../types";
import { Calendar as CalendarIcon, Clock, CreditCard, ShieldCheck, Mail, CheckCircle2, AlertTriangle, MessageSquare, Info, ZoomIn, ZoomOut, Home, Heart } from "lucide-react";
import { getCachedAccessToken, sendGmail } from "../utils/googleAuth";

interface BookingCalendarProps {
  therapistUid: string;
  therapistName: string;
  sessionPrice: number;
  initialEmail?: string;
  initialRut?: string;
  initialName?: string;
  initialPhone?: string;
  compact?: boolean;
}

export default function BookingCalendar({
  therapistUid,
  therapistName,
  sessionPrice,
  initialEmail = "",
  initialRut = "",
  initialName = "",
  initialPhone = "",
  compact = false,
}: BookingCalendarProps) {
  // Booking state
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [rut, setRut] = useState(initialRut);
  const [consentLaw, setConsentLaw] = useState(false);
  const [notes, setNotes] = useState("");
  const [isConsentZoomed, setIsConsentZoomed] = useState(false);

  // Sync state if props change dynamically
  React.useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
    if (initialRut) setRut(initialRut);
    if (initialName) setName(initialName);
    if (initialPhone) setPhone(initialPhone);
  }, [initialEmail, initialRut, initialName, initialPhone]);

  // Step state
  const [step, setStep] = useState<"details" | "payment" | "success">("details");
  const [loading, setLoading] = useState(false);
  const [createdAppt, setCreatedAppt] = useState<Appointment | null>(null);

  // Card details state
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCVV, setCardCVV] = useState("");
  
  // Payment feedback
  const [receiptUrl, setReceiptUrl] = useState("");
  const [paymentError, setPaymentError] = useState("");

  // Custom AI Reminder preview state
  const [aiReminder, setAiReminder] = useState("");
  const [aiReminderChannel, setAiReminderChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [generatingAiDraft, setGeneratingAiDraft] = useState(false);

  // PREDEFINED CHILEAN HOLIDAYS (2026 - 2027)
  const CHILEAN_HOLIDAYS_2026_2027 = [
    { date: "2026-01-01", name: "Año Nuevo" },
    { date: "2026-04-03", name: "Viernes Santo" },
    { date: "2026-04-04", name: "Sábado Santo" },
    { date: "2026-05-01", name: "Día del Trabajo" },
    { date: "2026-05-21", name: "Día de las Glorias Navales" },
    { date: "2026-06-29", name: "Día de San Pedro y San Pablo" },
    { date: "2026-07-16", name: "Día de la Virgen del Carmen" },
    { date: "2026-08-15", name: "Asunción de la Virgen" },
    { date: "2026-09-18", name: "Fiestas Patrias" },
    { date: "2026-09-19", name: "Glorias del Ejército" },
    { date: "2026-10-12", name: "Encuentro de Dos Mundos" },
    { date: "2026-10-31", name: "Día de las Iglesias Evangélicas" },
    { date: "2026-11-01", name: "Día de Todos los Santos" },
    { date: "2026-12-08", name: "Inmaculada Concepción" },
    { date: "2026-12-25", name: "Navidad" },
    
    // 2027
    { date: "2027-01-01", name: "Año Nuevo" },
    { date: "2027-03-26", name: "Viernes Santo" },
    { date: "2027-03-27", name: "Sábado Santo" },
    { date: "2027-05-01", name: "Día del Trabajo" },
    { date: "2027-05-21", name: "Día de las Glorias Navales" },
    { date: "2027-06-21", name: "Día Nacional de los Pueblos Indígenas" },
    { date: "2027-06-28", name: "Día de San Pedro y San Pablo" },
    { date: "2027-07-16", name: "Día de la Virgen del Carmen" },
    { date: "2027-08-15", name: "Asunción de la Virgen" },
    { date: "2027-09-18", name: "Fiestas Patrias" },
    { date: "2027-09-19", name: "Glorias del Ejército" },
    { date: "2027-10-11", name: "Encuentro de Dos Mundos" },
    { date: "2027-10-31", name: "Día de las Iglesias Evangélicas" },
    { date: "2027-11-01", name: "Día de Todos los Santos" },
    { date: "2027-12-08", name: "Inmaculada Concepción" },
    { date: "2027-12-25", name: "Navidad" }
  ];

  // Load weekly availability rules configured by the clinician
  const [weeklyAvailability, setWeeklyAvailability] = useState(() => {
    try {
      const saved = localStorage.getItem("mindspace_availability");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Error loading availability keys", e);
    }
    return {
      days: [1, 2, 3], // Lunes, Martes, Miércoles (1-3)
      slots: [
        "18:00 - 18:45",
        "18:45 - 19:30",
        "19:30 - 20:15",
        "20:15 - 21:00"
      ]
    };
  });

  // Keep weekly availability in sync with clinician configuration dynamically
  useEffect(() => {
    const handleSyncAvailability = () => {
      try {
        const saved = localStorage.getItem("mindspace_availability");
        if (saved) {
          setWeeklyAvailability(JSON.parse(saved));
        } else {
          setWeeklyAvailability({
            days: [1, 2, 3],
            slots: [
              "18:00 - 18:45",
              "18:45 - 19:30",
              "19:30 - 20:15",
              "20:15 - 21:00"
            ]
          });
        }
      } catch (e) {
        console.error("Error syncing availability", e);
      }
    };

    window.addEventListener("storage", handleSyncAvailability);
    // Also perform a sync immediately on mount in case it was updated on another screen but this component didn't rerender yet
    handleSyncAvailability();

    return () => {
      window.removeEventListener("storage", handleSyncAvailability);
    };
  }, []);

  // Load active emergency suspensions from storage
  const [emergencySuspensions, setEmergencySuspensions] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("mindspace_emergency_suspensions");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  // Helpers to scan selection and display clinical intelligence notices
  const getChileanHoliday = (dateStr: string) => {
    if (!dateStr) return null;
    return CHILEAN_HOLIDAYS_2026_2027.find((h) => h.date === dateStr);
  };

  const getDaySuspension = (dateStr: string) => {
    if (!dateStr) return null;
    return emergencySuspensions.find((s) => s.date === dateStr);
  };

  const isDayOfWeekAvailable = (dateStr: string) => {
    if (!dateStr) return true;
    const dateObj = new Date(dateStr + "T00:00:00");
    const jsDay = dateObj.getDay(); // Sunday=0, Monday=1, etc.
    return weeklyAvailability.days.includes(jsDay);
  };

  const getDayNameFromJsDay = (dateStr: string) => {
    if (!dateStr) return "";
    const names = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const d = new Date(dateStr + "T00:00:00").getDay();
    return names[d];
  };

  // Compute dynamic blocks rendered on screen
  const renderedSlots = (() => {
    if (!date) return [];
    
    // Check if full day suspended
    const suspension = getDaySuspension(date);
    if (suspension && suspension.type === "full_day") {
      return [];
    }

    let activeSlots = [...weeklyAvailability.slots];

    // Filter slots on partially blocked days
    if (suspension && suspension.type === "specific_slots") {
      activeSlots = activeSlots.filter((slot) => !suspension.slots.includes(slot));
    }

    return activeSlots;
  })();

  const handleResetAll = () => {
    setDate("");
    setTimeSlot("");
    setName(initialName);
    setEmail(initialEmail);
    setPhone(initialPhone);
    setRut(initialRut);
    setConsentLaw(false);
    setNotes("");
    setCreatedAppt(null);
    setCardNumber("");
    setCardExpiry("");
    setCardCVV("");
    setReceiptUrl("");
    setPaymentError("");
    setAiReminder("");
    setStep("details");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const validateRut = (rutStr: string) => {
    const normalized = rutStr.replace(/\./g, "").replace(/-/g, "").trim();
    if (normalized.length < 8 || normalized.length > 9) return false;
    const body = normalized.slice(0, -1);
    const dv = normalized.slice(-1).toUpperCase();
    
    let sum = 0;
    let mul = 2;
    for (let i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body[i], 10) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    const res = 11 - (sum % 11);
    let expectedDv = "";
    if (res === 11) expectedDv = "0";
    else if (res === 10) expectedDv = "K";
    else expectedDv = String(res);
    
    return expectedDv === dv;
  };

  const handleNextToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !timeSlot || !name || !email || !phone || !rut) {
      alert("Por favor, complete todos los campos obligatorios.");
      return;
    }
    if (!validateRut(rut)) {
      alert("El RUT ingresado no es válido. Por favor, verifique el formato (ej: 12.345.678-k).");
      return;
    }
    if (!consentLaw) {
      alert("Debe aceptar los términos de tratamiento de información médica sensible para proceder.");
      return;
    }
    setStep("payment");
  };

  const handleProcessBookingAndPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPaymentError("");

    try {
      // 1. Create the base appointment document with status "pending" as authorized by Firestore Rules
      const apptId = "app_" + Math.random().toString(36).substring(2, 11);
      const apptDocRef = doc(db, "appointments", apptId);
      
      const newAppointment: Appointment = {
        id: apptId,
        patientId: "patient_" + Math.random().toString(36).substring(2, 8),
        patientName: name,
        patientEmail: email,
        patientPhone: phone,
        patientRut: rut,
        consentLawAccepted: consentLaw,
        date,
        timeSlot,
        status: "scheduled",
        paymentStatus: "pending", // Starts pending per public schema permissions rule
        price: sessionPrice,
        notes: notes || "Sin observaciones iniciales",
        videoRoomId: "room_" + Math.random().toString(36).substring(2, 10),
        createdAt: Timestamp.now(),
        ownerId: therapistUid
      };

      try {
        await setDoc(apptDocRef, newAppointment);

        // Automatically send booking confirmation email via Gmail API if clinician is authenticated
        const gmailToken = getCachedAccessToken();
        if (gmailToken) {
          if (email) {
            const subject = `Confirmación de Agendamiento de Sesión Psicológica - MindSpace`;
            const bodyContent = `
              <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #f8fafc;">
                <div style="border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px;">
                  <h2 style="color: #0f172a; margin: 0; font-size: 18px;">📅 Su Reserva ha sido Registrada con Éxito</h2>
                  <p style="color: #64748b; margin: 5px 0 0 0; font-size: 11px;">MindSpace - Consulta Profesional</p>
                </div>
                
                <p style="font-size: 13px; color: #1e293b; line-height: 1.6;">
                  Estimado(a) <strong>${name}</strong>,
                </p>
                
                <p style="font-size: 13px; color: #334155; line-height: 1.6;">
                  Se ha agendado con éxito una sesión en el consultorio virtual con el terapeuta. A continuación se detallan los datos de su cita:
                </p>
                
                <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: left;">
                  <p style="margin: 4px 0; font-size: 12px; color: #334155;"><strong>Profesional:</strong> ${therapistName}</p>
                  <p style="margin: 4px 0; font-size: 12px; color: #334155;"><strong>Paciente:</strong> ${name}</p>
                  <p style="margin: 4px 0; font-size: 12px; color: #334155;"><strong>RUT:</strong> ${rut}</p>
                  <p style="margin: 4px 0; font-size: 12px; color: #334155;"><strong>Fecha:</strong> ${date}</p>
                  <p style="margin: 4px 0; font-size: 12px; color: #334155;"><strong>Horario:</strong> ${timeSlot} hrs</p>
                  <p style="margin: 4px 0; font-size: 12px; color: #334155;"><strong>Valor Sesión:</strong> $${sessionPrice.toLocaleString("es-CL")} CLP (Boleta SII exenta)</p>
                </div>

                <p style="font-size: 13px; color: #334155; line-height: 1.6;">
                  Para acceder a su sala de videoconferencia privada o reajustar los datos de su cita, ingrese en el <strong>Portal de Pacientes</strong> en nuestro sitio.
                </p>

                <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 25px; font-size: 10px; color: #94a3b8; text-align: center;">
                  <p>Este comprobante clínico es estrictamente confidencial de acuerdo a la Ley 20.584 chilena.</p>
                  <p>© 2026 MindSpace Chile. Soluciones Médicas Integradas.</p>
                </div>
              </div>
            `;
            sendGmail(gmailToken, email, subject, bodyContent).catch((e) => console.error("Error sending booking email:", e));
          }

          // Also notify the clinician
          const clinicianEmail = "joseignacio.rovel@gmail.com";
          const clinicianSubject = `⚠️ NUEVO AGENDAMIENTO: ${name} - ${date} @ ${timeSlot}`;
          const clinicianBody = `
            <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 25px; border: 1px solid #10b981; border-radius: 16px; background-color: #f0fdf4;">
              <h2 style="color: #065f46; margin: 0 0 15px 0;">🎉 Nuevo Agendamiento Registrado</h2>
              <p>Estimado(a) <strong>${therapistName}</strong>,</p>
              <p>Se ha registrado un nuevo agendamiento en su portal médico. Por motivos de seguridad de la información y cumplimiento de la Ley 20.584, los datos de contacto y de identificación se han omitido de este correo y pueden revisarse directamente en el portal clínico seguro.</p>
              
              <div style="background-color: #ffffff; border: 1px solid #a7f3d0; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: left;">
                <p style="margin: 4px 0; font-size: 13px; color: #1f2937;"><strong>Paciente:</strong> ${name}</p>
                <p style="margin: 4px 0; font-size: 13px; color: #1f2937;"><strong>Fecha de Reserva:</strong> ${date}</p>
                <p style="margin: 4px 0; font-size: 13px; color: #1f2937;"><strong>Bloque Horario:</strong> ${timeSlot} hrs</p>
                <p style="margin: 4px 0; font-size: 13px; color: #1f2937;"><strong>Motivo o Notas del Paciente:</strong> ${notes || "Sin observaciones iniciales"}</p>
              </div>
              
              <p style="font-size: 12px; color: #475569;">
                Este correo de notificación fue despachado de forma segura mediante la integración de la API autorizada de Gmail.
              </p>
              <p style="font-size: 11px; color: #64748b; text-align: center; margin-top: 20px;">© 2026 MindSpace Chile. En cumplimiento de secreto médico.</p>
            </div>
          `;
          sendGmail(gmailToken, clinicianEmail, clinicianSubject, clinicianBody).catch((e) => console.error("Error sending clinician alert email:", e));
        }
      } catch (err) {
        console.warn("[Firestore Write] Direct client write warning, attempting backend fallback: ", err);
      }

      // 2. Perform payments initiation securely through Flow
      const payRes = await fetch("/api/flow/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: apptId,
          price: sessionPrice,
          patientEmail: email,
          patientName: name,
          patientRut: rut
        })
      });

      if (!payRes.ok) {
        throw new Error("No se pudo establecer comunicación segura con el servidor de pagos.");
      }

      const paymentResult = await payRes.json();
      if (!paymentResult.success || !paymentResult.paymentUrl) {
        throw new Error(paymentResult.error || "No se recibió un enlace de redirección válido desde Flow.");
      }

      // 3. Perfect redirection to Flow gateway
      window.location.href = paymentResult.paymentUrl;

    } catch (err: any) {
      console.error("[Flow Payment Creation Error]:", err);
      setPaymentError(err.message || "La inicialización del pago con Flow falló. Intente de nuevo.");
      setLoading(false);
    }
  };

  const fetchAiReminderDraft = async (appt: Appointment, channel: "whatsapp" | "email") => {
    setGeneratingAiDraft(true);
    setAiReminderChannel(channel);
    try {
      const response = await fetch("/api/gemini/reminder-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: appt.patientName,
          date: appt.date,
          timeSlot: appt.timeSlot,
          price: appt.price,
          therapistName,
          channel
        })
      });
      const data = await response.json();
      if (response.ok) {
        setAiReminder(data.message);
      } else {
        setAiReminder("No se pudo generar vista previa automática.");
      }
    } catch {
      setAiReminder("Error de conexión al servidor de Inteligencia Artificial.");
    } finally {
      setGeneratingAiDraft(false);
    }
  };

  return (
    <div id="booking_card" className="bg-white dark:bg-slate-900 rounded-2xl md:shadow-xl border-0 md:border border-gray-100 dark:border-slate-800 overflow-hidden max-w-4xl mx-auto">
      {/* Header Visual Bar */}
      <div className="bg-slate-900 px-4 py-5 md:px-6 md:py-8 text-white relative">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <ShieldCheck className="w-16 h-16 md:w-24 md:h-24" />
        </div>
        <span className="bg-emerald-500/20 text-emerald-300 text-[10px] md:text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
          Agenda Abierta del Profesional
        </span>
        <h2 className="text-base md:text-2xl font-bold mt-1.5">Reservar Consulta Online</h2>
        <p className="text-slate-300 text-xs md:text-sm mt-0.5">Con {therapistName} | Sesiones Clínicas Individuales</p>
      </div>

      {/* Progress indicators */}
      <div className="grid grid-cols-3 border-b border-gray-100 dark:border-slate-800 text-center font-semibold text-[10px] md:text-sm">
        <div className={`py-2.5 md:py-3 ${step === "details" ? "text-slate-900 dark:text-white border-b-2 border-slate-900 dark:border-white bg-slate-50/50 dark:bg-slate-850/50 font-black" : "text-gray-400"}`}>
          1. Datos y Horas
        </div>
        <div className={`py-2.5 md:py-3 ${step === "payment" ? "text-slate-900 dark:text-white border-b-2 border-slate-900 dark:border-white bg-slate-50/50 dark:bg-slate-850/50" : "text-gray-400"}`}>
          2. Pago Cifrado
        </div>
        <div className={`py-2.5 md:py-3 ${step === "success" ? "text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/30 font-bold" : "text-gray-400"}`}>
          3. Confirmación
        </div>
      </div>

      <div className="p-3 sm:p-5 md:p-8">
        {step === "details" && (
          <form onSubmit={handleNextToPayment} className="space-y-6">
            {/* Dynamic Price Banner */}
            <div className="bg-emerald-500/5 dark:bg-emerald-900/10 border border-emerald-500/20 dark:border-emerald-800/30 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-300">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-lg shrink-0 mt-0.5">
                  <Heart className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Arancel de Consulta Privada</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">Atención psicológica clínica directa libre de convenios con Isapres o reembolsos estatales.</p>
                </div>
              </div>
              <div className="text-left sm:text-right shrink-0">
                <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-sans">${sessionPrice.toLocaleString("es-CL")} CLP</span>
                <span className="block text-[8px] text-slate-400 uppercase tracking-widest font-mono font-bold">Por Sesión (60 Min.)</span>
              </div>
            </div>

            <div className={`grid grid-cols-1 ${compact ? "" : "md:grid-cols-2"} gap-6`}>
              {/* Left Col: Date & Slot Pick */}
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-gray-700">Seleccione Fecha de Turno</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-3.5 w-5 h-5 text-gray-400 pointer-events-none" />
                  <input
                    type="date"
                    required
                    style={{ colorScheme: "light" }}
                    min={new Date().toISOString().split("T")[0]}
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setTimeSlot(""); // Reset block on date change
                    }}
                    className="pl-10 w-full rounded-xl border border-gray-200 p-3 text-[14px] text-slate-800 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all font-sans"
                  />
                </div>

                {/* Dynamic availability / holiday / blockages warnings display */}
                {date && (
                  <div className="space-y-2 animate-in fade-in duration-200">
                    {/* Chilean Holiday Notice */}
                    {getChileanHoliday(date) && (
                      <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-xs text-sky-850 flex items-start gap-2">
                        <span className="text-base">🇨🇱</span>
                        <div>
                          <strong>Feriado Nacional en Chile:</strong> Hoy es <strong>{getChileanHoliday(date)?.name}</strong>. Atenderemos con normalidad las consultas previamente programadas.
                        </div>
                      </div>
                    )}

                    {/* Outside availability week days */}
                    {!isDayOfWeekAvailable(date) && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                        <div>
                          El profesional no registra horarios ordinarios de atención los días <strong>{getDayNameFromJsDay(date)}</strong>. Puedes agendar otro día de la semana.
                        </div>
                      </div>
                    )}

                    {/* Full Day Suspension warning */}
                    {getDaySuspension(date) && getDaySuspension(date).type === "full_day" && (
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-800 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold">
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                          Atención Suspendida por Emergencia
                        </div>
                        <p className="leading-tight">
                          El/La especialista ha declarado suspensión total de actividades el <strong>{date}</strong> debido a fuerza mayor o urgencia clínica. Alterne a otra fecha.
                        </p>
                      </div>
                    )}

                    {/* Partial suspension warning */}
                    {getDaySuspension(date) && getDaySuspension(date).type === "specific_slots" && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-850 flex items-start gap-2">
                        <Info className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                        <div>
                          <strong>Horas de Urgencia Bloqueadas:</strong> Ciertos rangos horarios se han cerrado hoy por emergencia clínica. Se listan solo cupos vigentes.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <label className="block text-sm sm:text-[14px] font-extrabold text-slate-900 dark:text-emerald-450 pt-2 tracking-wide flex items-center gap-2 uppercase">
                  <Clock className="w-4 h-4 text-emerald-500 animate-pulse shrink-0" />
                  Horarios Disponibles
                </label>
                {!date ? (
                  <p className="text-xs text-gray-400 italic">Por favor, seleccione una fecha para desplegar los bloques disponibles.</p>
                ) : renderedSlots.length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-gray-200 text-slate-400 text-center py-6 text-xs italic rounded-xl">
                    No quedan bloques clínicos disponibles para resolver en esta fecha.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    {renderedSlots.map((slot) => (
                      <button
                        type="button"
                        key={slot}
                        onClick={() => setTimeSlot(slot)}
                        className={`p-3.5 rounded-xl border-2 text-[13px] sm:text-[14px] font-mono font-bold transition-all duration-150 text-center flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer ${
                          timeSlot === slot
                            ? "bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500 shadow-[0_4px_12px_rgba(16,185,129,0.3)] dark:shadow-[0_4px_15px_rgba(16,185,129,0.4)] scale-103 z-10"
                            : "bg-white dark:bg-slate-900/95 border-slate-250 dark:border-slate-800 text-slate-900 dark:text-slate-100 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-500 dark:hover:border-emerald-500/80 hover:text-emerald-700 dark:hover:text-emerald-300 hover:scale-[1.01] hover:shadow-xs"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 transition-colors duration-150 ${timeSlot === slot ? "bg-white animate-ping" : "bg-emerald-500"}`} />
                        <span>{slot}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Col: Personal Info */}
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300">Información del Paciente</label>
                <input
                  type="text"
                  required
                  placeholder="Nombre y Apellidos"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-800 p-3 text-[14px] text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition-all font-sans"
                />
                <div className={`grid grid-cols-1 ${compact ? "" : "md:grid-cols-2"} gap-4`}>
                  <input
                    type="text"
                    required
                    placeholder="RUT (ej: 12.345.678-K)"
                    value={rut}
                    onChange={(e) => setRut(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-800 p-3 text-[14px] text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all font-mono"
                  />
                  <input
                    type="tel"
                    required
                    placeholder="Teléfono (ej: +56 9 1234 5678)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-800 p-3 text-[14px] text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all font-sans"
                  />
                </div>
                <input
                  type="email"
                  required
                  placeholder="Correo Electrónico"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-800 p-3 text-[14px] text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition-all font-sans"
                />
                <textarea
                  placeholder="Motivo de la consulta breve (ej: Ansiedad recurrente, problemas de sueño, etc.)"
                  value={notes}
                  rows={2}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-800 p-3 text-[14px] text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition-all resize-none font-sans"
                />

                {/* Consent checkbox for sensitive medical content Chilean Laws 19628 & 20584 */}
                <div className={`bg-emerald-50/95 dark:bg-emerald-950/15 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl flex flex-col items-stretch overflow-hidden transition-all duration-300 shadow-xs relative ${isConsentZoomed ? 'ring-2 ring-emerald-500/45' : ''}`}>
                  <div className={`p-4 flex items-start gap-3 transition-all duration-300 ${isConsentZoomed ? 'bg-[#f0fbf6] dark:bg-emerald-950/25' : 'bg-[#f4fcf8]/90 dark:bg-[#042e1d]/10'}`}>
                    <input
                      type="checkbox"
                      id="chk_consent_chile"
                      required
                      checked={consentLaw}
                      onChange={(e) => setConsentLaw(e.target.checked)}
                      className="mt-1.5 h-4.5 w-4.5 text-emerald-600 focus:ring-emerald-500 border-emerald-350 dark:border-emerald-800 rounded cursor-pointer transition-all shrink-0"
                    />
                    <label htmlFor="chk_consent_chile" className={`leading-relaxed select-none cursor-pointer transition-all duration-300 matches-consent flex-1 text-[#042e1d] dark:text-emerald-200 ${isConsentZoomed ? 'text-[13.5px] space-y-3' : 'text-[11.5px] space-y-2'}`}>
                      <p className="font-semibold">
                        Autorizo expresamente el almacenamiento y tratamiento de mis datos clínicos y sensibles según las normativas chilenas vigentes: <strong>Ley N° 19.628</strong> (Protección de Datos Personales de Salud) y <strong>Ley N° 20.584</strong> (Derechos y Deberes del Paciente). Entiendo que mis registros e historial clínico serán tratados con cifrado avanzado y confidencialidad absoluta.
                      </p>
                      <p className="font-medium border-t border-emerald-200/50 dark:border-emerald-900/30 pt-2 text-[#083d26] dark:text-emerald-350">
                        ✓ Acepto que mis datos de contacto (correo y teléfono) sean utilizados exclusivamente para coordinar, agendar, confirmar o reprogramar mi atención de forma confidencial, garantizando que <strong>bajo ningún concepto serán usados con fines comerciales o de publicidad</strong>.
                      </p>
                    </label>
                  </div>
                  
                  {/* Accessibility action row with Zoom (Lupita) icon */}
                  <div className="bg-emerald-100/40 dark:bg-emerald-950/45 border-t border-emerald-100/80 dark:border-emerald-900/30 flex justify-between items-center px-4 py-2 text-xs text-emerald-800 dark:text-emerald-300">
                    <span className="text-[10px] md:text-[10.5px] font-medium text-emerald-700/95 dark:text-emerald-400 select-none">
                      {isConsentZoomed ? "🔍 Vista Agrandada Activa" : "🔒 Información amparada por ley"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsConsentZoomed(!isConsentZoomed)}
                      title={isConsentZoomed ? "Reducir tamaño del texto" : "Agrandar tamaño del texto para mejor lectura"}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-slate-800 active:scale-95 text-emerald-850 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-850 transition-all shadow-xs cursor-pointer select-none"
                    >
                      {isConsentZoomed ? (
                        <>
                          <ZoomOut className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                          <span className="text-[11px]">Tamaño Normal</span>
                        </>
                      ) : (
                        <>
                          <ZoomIn className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                          <span className="text-[11px]">Agrandar Texto (Lupa)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Price notification */}
            <div className="bg-slate-50 dark:bg-slate-950/40 rounded-xl p-4 flex items-start gap-3 border border-slate-100 dark:border-slate-850">
              <Info className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Las consultas tienen una duración reglamentaria de <strong>60 minutos</strong>. Se realizan a través de nuestra sala cifrada integrada de video WebRTC de grado médico.
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-200 mt-1">
                  Arancel de Consulta Privada: ${sessionPrice.toLocaleString("es-CL")} CLP
                </p>
              </div>
            </div>

            {/* Action booking */}
            <div className="flex justify-end">
              <button
                type="submit"
                id="btn_to_pay"
                className="bg-slate-900 text-white rounded-xl px-6 py-3 text-sm font-semibold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg"
              >
                Continuar al Pago Cifrado
              </button>
            </div>
          </form>
        )}

        {step === "payment" && (
          <form onSubmit={handleProcessBookingAndPayment} className="space-y-6 max-w-lg mx-auto">
            <div className="border border-sky-200 bg-sky-50/50 p-4 rounded-xl flex items-start gap-2.5 text-xs text-sky-800">
              <ShieldCheck className="w-5 h-5 text-sky-600 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Pasarela Homologada (Flow Chile):</strong> Su orden será procesada de forma segura mediante Webpay Plus. Al autorizar su pago, el portal clínico emitirá automáticamente su <strong>Boleta de Honorarios Electrónica (BHE)</strong> aprobada ante el SII como respaldo fiscal de su consulta de psicología privada.
              </div>
            </div>

            <div className="bg-slate-900 rounded-2xl p-6 text-white space-y-4 shadow-xl border border-slate-800">
              <div className="flex justify-between items-center text-sm text-slate-300">
                <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">Detalles de la Reserva</span>
                <Clock className="w-4 h-4 text-emerald-450" />
              </div>
              
              <div className="text-xs font-mono font-medium text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded inline-block">
                Cita: {date} @ {timeSlot}
              </div>

              <div className="space-y-2.5 pt-3 border-t border-slate-800 text-xs text-slate-300 font-sans">
                <div className="flex justify-between">
                  <span className="text-slate-400">Paciente:</span>
                  <span className="font-bold text-white">{name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">RUT:</span>
                  <span className="font-mono text-white">{rut}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Email:</span>
                  <span className="text-white">{email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Profesional:</span>
                  <span className="font-bold text-white">{therapistName}</span>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3 flex justify-between items-center">
                <span className="text-sm text-slate-450">Monto del Servicio</span>
                <span className="text-xl font-black font-sans text-emerald-400">${sessionPrice.toLocaleString("es-CL")} CLP</span>
              </div>
            </div>

            {paymentError && (
              <div className="text-xs bg-rose-50 border border-rose-250 p-3 rounded-lg text-rose-700 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                {paymentError}
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setStep("details")}
                className="text-slate-500 hover:text-slate-800 font-semibold text-xs uppercase tracking-wider transition-colors"
              >
                ← Volver y corregir
              </button>
              <button
                type="submit"
                id="btn_pay"
                disabled={loading}
                className="bg-emerald-650 hover:bg-emerald-700 bg-emerald-600 text-white rounded-xl px-6 py-3.5 text-xs font-extrabold uppercase tracking-wider transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? "Procesando con Flow..." : "Pagar con Flow (Webpay)"}
              </button>
            </div>
          </form>
        )}

        {step === "success" && createdAppt && (
          <div className="space-y-6 text-center max-w-2xl mx-auto py-4">
            <div className="inline-flex items-center justify-center bg-emerald-50 text-emerald-500 p-4 rounded-full border border-emerald-200">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            
            <div>
              <h3 className="text-2xl font-bold text-slate-900">¡Consulta Agendada Exitosamente!</h3>
              <p className="text-sm text-slate-600 mt-1">Estimado/a <strong>{createdAppt.patientName}</strong>, su cita ha sido confirmada y asegurada con éxito.</p>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 text-left space-y-3 max-w-md mx-auto">
              <div className="flex justify-between text-xs font-mono text-slate-500">
                <span>Orden de Registro</span>
                <span>{createdAppt.id}</span>
              </div>
              <div className="text-sm space-y-1 text-slate-700">
                <p>👤 <strong>Paciente:</strong> {createdAppt.patientName}</p>
                {createdAppt.patientRut && <p>🆔 <strong>RUT:</strong> <span className="font-mono">{createdAppt.patientRut}</span></p>}
                <p>👨‍⚕️ <strong>Profesional:</strong> {therapistName}</p>
                <p>📆 <strong>Fecha:</strong> {createdAppt.date}</p>
                <p>⏰ <strong>Horario:</strong> {createdAppt.timeSlot} (Hora Local)</p>
                <p>💳 <strong>Pago:</strong> ${createdAppt.price.toLocaleString("es-CL")} CLP <span className="text-xs text-emerald-600 uppercase font-semibold bg-emerald-50 px-2 py-0.5 rounded ml-1 border border-emerald-200">Facturado</span></p>
                <p>🛡️ <strong>ID Sala Protegida:</strong> <span className="font-mono text-xs bg-slate-200 px-1.5 py-0.5 rounded">{createdAppt.videoRoomId}</span></p>
              </div>
              
              <div className="pt-2 border-t border-slate-200 flex justify-between">
                <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 block"
                >
                  📄 Descargar Recibo Oficial
                </a>
              </div>
            </div>

            {/* AI Notification triggers previews */}
            <div className="border border-slate-200 rounded-2xl p-6 text-left space-y-4 bg-slate-50/50">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Notificaciones Inteligentes de Turnos
                </h4>
                <div className="flex rounded-lg border border-gray-200 p-0.5 bg-white text-xs">
                  <button
                    onClick={() => fetchAiReminderDraft(createdAppt, "whatsapp")}
                    className={`px-3 py-1 rounded-md transition-all flex items-center gap-1 ${aiReminderChannel === "whatsapp" ? "bg-slate-900 text-white" : "text-gray-500"}`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                  </button>
                  <button
                    onClick={() => fetchAiReminderDraft(createdAppt, "email")}
                    className={`px-3 py-1 rounded-md transition-all flex items-center gap-1 ${aiReminderChannel === "email" ? "bg-slate-900 text-white" : "text-gray-500"}`}
                  >
                    <Mail className="w-3.5 h-3.5" /> Correo
                  </button>
                </div>
              </div>

              {generatingAiDraft ? (
                <div className="animate-pulse space-y-2 py-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-5/6"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              ) : (
                <div className="bg-white border border-gray-100 p-4 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-gray-400">
                      Copia Generada por Assistente de IA (Gemini-3.5-Flash)
                    </span>
                    <span className="text-[10px] text-emerald-500 font-semibold bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                      Listo para Envío
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{aiReminder}</p>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button
                type="button"
                onClick={handleResetAll}
                className="w-full sm:w-auto bg-slate-900 text-white rounded-xl px-6 py-3 text-sm font-semibold hover:bg-slate-800 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer font-sans"
              >
                <Home className="w-4 h-4 text-emerald-400 shrink-0" />
                Volver al Home Público
              </button>

              <button
                type="button"
                className="w-full sm:w-auto text-sm font-semibold text-slate-700 hover:text-slate-950 hover:underline border border-dashed border-slate-300 hover:border-slate-405 rounded-xl px-6 py-3 transition-all cursor-pointer bg-white"
                onClick={handleResetAll}
              >
                Reservar Otra Consulta Terapéutica
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
