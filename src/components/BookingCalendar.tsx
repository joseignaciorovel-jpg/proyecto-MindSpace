import React, { useState } from "react";
import { collection, doc, setDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Appointment } from "../types";
import { Calendar as CalendarIcon, Clock, CreditCard, ShieldCheck, Mail, CheckCircle2, AlertTriangle, MessageSquare, Info, ZoomIn, ZoomOut, Home } from "lucide-react";

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
      days: [1, 2, 3, 4, 5], // Monday to Friday (1-5)
      slots: [
        "09:00 - 10:00",
        "10:15 - 11:15",
        "11:30 - 12:30",
        "15:00 - 16:00",
        "16:15 - 17:15",
        "17:30 - 18:30"
      ]
    };
  });

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
    if (!cardNumber || !cardExpiry || !cardCVV) {
      setPaymentError("Por favor, ingrese los campos de facturación de prueba.");
      return;
    }

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
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `appointments/${apptId}`);
      }

      // 2. Perform payments visual checkout through backend endpoint (Stripe Simulator)
      const payRes = await fetch("/api/simulate-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: apptId,
          price: sessionPrice,
          patientEmail: email,
          testCardNumber: cardNumber
        })
      });

      const paymentResult = await payRes.json();
      if (!payRes.ok || !paymentResult.success) {
        throw new Error(paymentResult.error || "Simulación de pago denegada por el banco emisor.");
      }

      setReceiptUrl(paymentResult.receiptUrl);

      // 3. Atomically transit state to "paid" using allowed restricted public update rule
      try {
        await updateDoc(apptDocRef, {
          paymentStatus: "paid"
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `appointments/${apptId}`);
      }

      // Successful state updates
      const updatedAppt: Appointment = { ...newAppointment, paymentStatus: "paid" };
      setCreatedAppt(updatedAppt);
      setStep("success");

      // 4. Auto-generate beautiful preview reminder through Gemini
      await fetchAiReminderDraft(updatedAppt, "whatsapp");

    } catch (err: any) {
      console.error(err);
      setPaymentError(err.message || "La simulación de cargo falló. Revise los datos.");
    } finally {
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

                <label className="block text-sm font-semibold text-gray-700 pt-2">Horarios Disponibles</label>
                {!date ? (
                  <p className="text-xs text-gray-400 italic">Por favor, seleccione una fecha para desplegar los bloques disponibles.</p>
                ) : renderedSlots.length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-gray-200 text-slate-400 text-center py-6 text-xs italic rounded-xl">
                    No quedan bloques clínicos disponibles para resolver en esta fecha.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {renderedSlots.map((slot) => (
                      <button
                        type="button"
                        key={slot}
                        onClick={() => setTimeSlot(slot)}
                        className={`p-3 rounded-lg border text-xs font-mono font-medium transition-all text-center ${
                          timeSlot === slot
                            ? "bg-slate-900 text-white border-slate-900 shadow-md transform scale-102"
                             : "border-gray-200 text-gray-600 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {slot}
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
            <div className="bg-slate-50 rounded-xl p-4 flex items-start gap-3 border border-slate-100">
              <Info className="w-5 h-5 text-slate-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-600">
                  Las consultas tienen una duración reglamentaria de <strong>60 minutos</strong>. Se realizan a través de nuestra sala cifrada integrada de video WebRTC de grado médico.
                </p>
                <p className="text-sm font-semibold text-slate-900 mt-1">
                  Arancel de Consulta: ${sessionPrice.toLocaleString("es-CL")} CLP
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
            <div className="border border-yellow-200 bg-yellow-50/50 p-4 rounded-xl flex items-start gap-2 text-xs text-yellow-800">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Modo Integración / Demostración:</strong> Para pruebas de facturación, puede ingresar cualquier número simulado (ej: <strong>4000 1234 5678 9010</strong>) con cualquier fecha futura y código de seguridad. No se debitará dinero real de su cuenta.
              </div>
            </div>

            <div className="bg-slate-900 rounded-2xl p-6 text-white space-y-4">
              <div className="flex justify-between items-center text-sm text-slate-300">
                <span>Orden de Consulta</span>
                <Clock className="w-4 h-4" />
              </div>
              <div className="text-xs font-mono font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded inline-block">
                Slot: {date} @ {timeSlot}
              </div>
              <div className="border-t border-slate-800 my-2 pt-2 flex justify-between items-center">
                <span className="text-sm text-slate-400">Total a Pagar</span>
                <span className="text-xl font-bold font-sans">${sessionPrice.toLocaleString("es-CL")} CLP</span>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-semibold text-gray-700">Tarjeta de Crédito / Débito</label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-3.5 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  required
                  placeholder="Número de Tarjeta (16 dígitos de prueba)"
                  maxLength={19}
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value.replace(/\s?/g, '').replace(/(\d{4})/g, '$1 ').trim())}
                  className="pl-10 w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  required
                  placeholder="MM/AA (Exp)"
                  maxLength={5}
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all font-mono"
                />
                <input
                  type="password"
                  required
                  placeholder="CVV"
                  maxLength={4}
                  value={cardCVV}
                  onChange={(e) => setCardCVV(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all font-mono"
                />
              </div>
            </div>

            {paymentError && (
              <div className="text-xs bg-rose-50 border border-rose-200 p-3 rounded-lg text-rose-700 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                {paymentError}
              </div>
            )}

            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => setStep("details")}
                className="text-slate-600 hover:text-slate-900 font-medium text-sm"
              >
                Volver y corregir datos
              </button>
              <button
                type="submit"
                id="btn_pay"
                disabled={loading}
                className="bg-slate-900 text-white rounded-xl px-6 py-3 text-sm font-semibold hover:bg-slate-800 transition-all shadow-md flex items-center gap-2"
              >
                {loading ? "Procesando pago..." : "Pagar y Agendar Turno"}
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
