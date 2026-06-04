import React, { useState } from "react";
import { X, ShieldCheck, Lock, FileText, HelpCircle, Activity, Scale, Heart, Shield, Terminal, KeyRound, Bookmark, CheckCircle2 } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 📝 Términos de Servicio - Adaptado como un FAQ interactivo en lenguaje claro y profesional.
 */
export function TermsOfServiceModal({ isOpen, onClose }: ModalProps) {
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  if (!isOpen) return null;

  const faqs = [
    {
      title: "¿Cómo funciona el proceso de agendamiento y reserva?",
      icon: Activity,
      content: "A través de nuestro portal público de agendamiento, puedes seleccionar el especialista, visualizar los bloques horarios libres en tiempo real de forma garantizada y realizar la reserva directa completando tus datos esenciales de contacto. La confirmación es inmediata y recibirás las coordenadas por correo electrónico."
    },
    {
      title: "¿Cómo se gestionan los pagos y las devoluciones?",
      icon: KeyRound,
      content: "Todos los aranceles de consulta publicados al pie del booking se procesan utilizando integraciones con pasarelas de pago digitales seguras con estándar de seguridad PCI-DSS. Al momento del agendamiento, se genera una confirmación de cobro. Si necesitas anular una cita con al menos 24 horas de anticipación, contáctanos y procesaremos el reembolso total de acuerdo con las políticas correspondientes de la clínica."
    },
    {
      title: "Uso del servicio de Videollamada y Telemedicina",
      icon: Lock,
      content: "Nuestras videollamadas son punto a punto (P2P) y están cifradas bajo los estándares internacionales para telepsicoterapia. Para acceder a tu sesión, solo debes ingresar a tu portal de paciente a la hora coordinada; no es necesario descargar softwares de terceros ni registrar cuentas adicionales."
    },
    {
      title: "Responsabilidad y Alcance de las Consultas Digitales",
      icon: ShieldCheck,
      content: "MindSpace provee un entorno digital optimizado para el soporte y cuidado clínico. Sin embargo, no reemplaza la atención presencial de urgencias en recintos de salud pública o privada. Si te encuentras frente a una emergencia médica o ideación crítica inminente, te solicitamos acudir de inmediato al centro asistencial de emergencia más cercano."
    }
  ];

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} />
      
      <div className="relative bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden p-6 md:p-8 text-left transition-all z-10 font-sans">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-rose-50/10 dark:border-slate-800 pb-5">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 font-extrabold text-[9.5px] uppercase tracking-wider rounded-lg border border-emerald-250/50 dark:border-emerald-900/40">
              <Scale className="w-3 h-3" /> Transparencia Legal
            </span>
            <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Términos de Servicio y Funcionamiento
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Información clara y en lenguaje directo sobre el uso de nuestro consultorio clínico digital.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Tabs (FAQ Style as requested) */}
        <div className="py-6 space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-semibold">
            Te damos la bienvenida a MindSpace. Como prestadores de salud autónomos y comprometidos con el trato digno, aquí respondemos de inmediato a las dudas usuales sobre cómo opera tu reserva:
          </p>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const Icon = faq.icon;
              const isActive = activeFaq === idx;
              return (
                <div 
                  key={idx}
                  className={`border rounded-2xl overflow-hidden transition-all duration-200 ${
                    isActive 
                      ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-xs" 
                      : "border-slate-150 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-900/30"
                  }`}
                >
                  <button
                    onClick={() => setActiveFaq(isActive ? null : idx)}
                    className="w-full p-4 flex items-center justify-between gap-3 text-left font-bold text-slate-800 dark:text-slate-250 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors text-sm"
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-500" : "text-slate-450"}`} />
                      {faq.title}
                    </span>
                    <span className="text-xs text-slate-400">
                      {isActive ? "▲" : "▼"}
                    </span>
                  </button>
                  {isActive && (
                    <div className="px-4 pb-4 pt-1 text-xs text-slate-600 dark:text-slate-350 leading-relaxed font-normal border-t border-dashed border-slate-150 dark:border-slate-800/60 mt-0.5">
                      {faq.content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Notice */}
          <div className="p-4 bg-amber-50/30 dark:bg-amber-950/15 border border-amber-200/50 dark:border-amber-900/20 rounded-2xl flex gap-3">
            <span className="text-lg">📢</span>
            <div className="space-y-1">
              <h5 className="text-[11px] font-bold text-amber-800 dark:text-amber-450 uppercase tracking-wider">
                Políticas de Reserva Inmediata
              </h5>
              <p className="text-[10.5px] text-slate-600 dark:text-slate-350 leading-relaxed">
                El valor de la sesión clínica está garantizado por la plataforma. Cualquier reajuste u opción tarifaria personalizada es acordada directamente dentro de la evaluación inicial con tu terapeuta.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-105 dark:border-slate-800 pt-4 flex flex-col sm:flex-row justify-between items-center gap-3 text-center sm:text-left text-[10px] text-slate-450">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Cumple Ley 20.584 y Reglamento General de Consultas.
          </div>
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white font-extrabold rounded-xl transition cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 🛡️ Políticas de Privacidad Médica - Explicando el resguardo bajo un lenguaje tranquilizador.
 * Responde de inmediato de forma honesta y previene la "sensación de dar la llave al ciberdelincuente"
 * con descripciones conceptuales excelentes en vez de listar puertos, código o algoritmos específicos.
 */
export function PrivacyPolicyModal({ isOpen, onClose }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} />
      
      <div className="relative bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden p-6 md:p-8 text-left transition-all z-10 font-sans">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-rose-50/10 dark:border-slate-800 pb-5">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400 font-extrabold text-[9.5px] uppercase tracking-wider rounded-lg border border-teal-200/50 dark:border-teal-900/40">
              <Shield className="w-3 h-3" /> Secreto Profesional Digital
            </span>
            <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Políticas de Privacidad Médica y Seguridad
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cómo protegemos tu información clínica confidencial bajo regulaciones del Ministerio de Salud.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-5 space-y-5 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
          
          {/* Honest Concept presentation (Resolviendo el dilema del usuario de manera brillante) */}
          <div className="p-4 bg-teal-50/20 dark:bg-teal-950/10 border border-teal-100/50 dark:border-teal-900/30 rounded-2xl space-y-2">
            <h4 className="text-xs font-black text-teal-800 dark:text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5" /> Seguridad Inteligente: ¿Por qué es seguro publicar nuestras medidas?
            </h4>
            <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-305 font-medium">
              Sostener la confidencialidad no significa ocultar qué estándares seguimos. En seguridad clínica, la transparencia genera confianza. No publicamos puertos, claves de base de datos ni detalles de infraestructura que puedan servir de mapa para un ataque. En su lugar, garantizamos que las reglas y capas de protección operen con criptografía y buenas prácticas certificadas.
            </p>
          </div>

          <div className="space-y-4">
            
            {/* Medida 1 */}
            <div className="flex gap-3.5 items-start">
              <div className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-850 flex items-center justify-center border border-slate-100 dark:border-slate-800 shrink-0 mt-1">
                <FileText className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="space-y-1">
                <h5 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                  1. Custodia Rigurosa de Fichas Clínicas
                </h5>
                <p className="text-[11px] text-slate-600 dark:text-slate-350 leading-relaxed text-justify">
                  Conforme a la <strong>Ley 20.584 chilena</strong>, tu Ficha Clínica constituye un documento estrictamente confidencial. Solo tú y tu psicólogo tratante tienen acceso a las anotaciones de las sesiones. Los registros clínicos se almacenan en servidores aislados y ninguna ficha es visible para agentes externos ni terceros.
                </p>
              </div>
            </div>

            {/* Medida 2 */}
            <div className="flex gap-3.5 items-start">
              <div className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-850 flex items-center justify-center border border-slate-100 dark:border-slate-800 shrink-0 mt-1">
                <Lock className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="space-y-1">
                <h5 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                  2. Cifrado de Información en Tránsito y Reposo
                </h5>
                <p className="text-[11px] text-slate-600 dark:text-slate-350 leading-relaxed text-justify">
                  Toda la comunicación de datos (por ejemplo, al registrar una reserva o enviar tu cuestionario de ingreso) se transmite exclusivamente sobre canales protegidos con protocolos SSL/TLS de alta resistencia. Asimismo, las consultas de videollamadas se inician de forma cifrada para impedir intercepciones.
                </p>
              </div>
            </div>

            {/* Medida 3 */}
            <div className="flex gap-3.5 items-start">
              <div className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-850 flex items-center justify-center border border-slate-100 dark:border-slate-800 shrink-0 mt-1">
                <KeyRound className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="space-y-1">
                <h5 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                  3. Autenticación y Control de Accesos Clínicos
                </h5>
                <p className="text-[11px] text-slate-600 dark:text-slate-350 leading-relaxed text-justify">
                  Los profesionales de salud acceden mediante credenciales de seguridad robustas resguardadas por Firebase Authentication. Adicionalmente, el sistema incluye un <strong>Bloqueo Automático por Inactividad (Auto-Lock)</strong>, el cual protege el consultorio digital e impide que personas no autorizadas puedan visualizar la pantalla si el clínico deja el computador desatendido.
                </p>
              </div>
            </div>

            {/* Medida 4 */}
            <div className="flex gap-3.5 items-start">
              <div className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-850 flex items-center justify-center border border-slate-100 dark:border-slate-800 shrink-0 mt-1">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="space-y-1">
                <h5 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                  4. Cumplimiento Legal (Chile Ley 19.628)
                </h5>
                <p className="text-[11px] text-slate-600 dark:text-slate-350 leading-relaxed text-justify">
                  Toda recolección y tratamiento de datos de salud se guía bajo los principios de licitud y confidencialidad exigidos por la <strong>Ley 19.628 sobre protección de la vida privada</strong>. No se comercializan datos, no se usan listas para spam de publicidad, y tienes garantizado el derecho de acceso, rectificación y cancelación de tus antecedentes de agendamiento.
                </p>
              </div>
            </div>

          </div>

          <div className="p-3.5 bg-emerald-50/10 dark:bg-emerald-950/5 border border-dashed border-emerald-500/20 rounded-2xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
              Protección de datos garantizada por MindSpace Clínica Digital • Sólida e impenetrable.
            </span>
          </div>

        </div>

        {/* Footer */}
        <div className="border-t border-slate-105 dark:border-slate-800 pt-4 flex flex-col sm:flex-row justify-between items-center gap-3 text-center sm:text-left text-[10px] text-slate-450">
          <div className="flex items-center gap-1 font-medium">
            🔒 Protocolos Seguros y Encriptados.
          </div>
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white font-extrabold rounded-xl transition cursor-pointer"
          >
            Acepto Políticas
          </button>
        </div>
      </div>
    </div>
  );
}
