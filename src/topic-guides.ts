/**
 * Curated topic guides for menu selections.
 *
 * Tapping a menu option used to send the literal id ("menu:coverage" / "3")
 * through retrieval, so the reply was a raw slice of a PDF export — cut mid
 * sentence, with hard line breaks, tables and markdown links. Menu taps now
 * get a short, complete, hand-written overview built from the KB sources,
 * with one consistent shape:
 *
 *   *Title*
 *   one-line intro
 *
 *   • key point
 *   • key point
 *
 *   🔗 official link
 *
 *   *Next step:* ...
 */
import type { AssistantAnswer, Intent, SupportedLanguage } from './types.js';
import { formatWhatsAppAnswer } from './response-format.js';

interface Guide {
  text: string;
  sourceIds: string[];
  sourceUrls: string[];
}

const URL = {
  essentials: 'https://www.medibank.com.au/overseas-health-insurance/oshc/essentials-oshc/',
  comprehensive: 'https://www.medibank.com.au/overseas-health-insurance/oshc/comprehensive-oshc/',
  claimOnline: 'https://www.medibankoshc.com.au/how-to-make-an-online-claim/',
  claimForm: 'https://www.members.medibankoshc.com.au/login/submit-claim.html',
  findProvider: 'https://www.medibankoshc.com.au/find-provider/',
  gettingSick: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/getting-sick-in-australia/',
  visa: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/which-health-cover-for-my-visa/',
  waiting: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/what-are-waiting-periods/',
  forms: 'https://www.medibank.com.au/health-insurance/using-your-cover/brochures-forms/',
  memberGuide: 'https://www.medibank.com.au/content/dam/b2c/docs/mpl/Medibank_OSHC_Member_Guide.pdf',
};

type GuideKey = 'coverage' | 'claims' | 'providers' | 'healthcare' | 'pharmacy' | 'visa' | 'forms';

const GUIDES: Record<GuideKey, Record<SupportedLanguage, string> & { ids: string[]; urls: string[] }> = {
  coverage: {
    ids: ['02-essentials-oshc.md', '03-comprehensive-oshc.md'],
    urls: [URL.essentials, URL.comprehensive],
    en:
      `*Understanding your OSHC cover*\n` +
      `Medibank OSHC comes in two levels: *Essentials* and *Comprehensive*. Both meet student visa health insurance requirements.\n\n` +
      `• *GP visits:* 100% of the MBS fee is paid. If the doctor charges more, you pay the gap.\n` +
      `• *Specialists, pathology, x-rays:* at least 85% of the MBS fee out of hospital.\n` +
      `• *In hospital:* 100% of the MBS fee for doctors' fees on included services.\n` +
      `• *Prescriptions:* you pay $30 per item, then benefits apply up to the item limit.\n` +
      `• *Comprehensive* adds broader benefits — compare both before you choose.\n\n` +
      `🔗 Essentials: ${URL.essentials}\n` +
      `🔗 Comprehensive: ${URL.comprehensive}\n\n` +
      `*Next step:* reply *2* to learn how to claim, or *5* for waiting periods.`,
    'zh-CN':
      `*了解你的 OSHC 保障*\n` +
      `Medibank OSHC 有两个级别：*Essentials* 和 *Comprehensive*，都符合学生签证的医疗保险要求。\n\n` +
      `• *看全科医生（GP）：*支付 MBS 收费标准的 100%，医生收费更高时由你支付差额。\n` +
      `• *专科、化验、X 光：*院外至少支付 MBS 标准的 85%。\n` +
      `• *住院：*包含项目的医生费用按 MBS 标准 100% 支付。\n` +
      `• *处方药：*每项自付 $30，之后按单项上限给付。\n` +
      `• *Comprehensive* 保障更全面，选择前请对比两者。\n\n` +
      `🔗 Essentials：${URL.essentials}\n` +
      `🔗 Comprehensive：${URL.comprehensive}\n\n` +
      `*下一步：*回复 *2* 了解如何理赔，或回复 *5* 了解等待期。`,
    es:
      `*Entender tu cobertura OSHC*\n` +
      `Medibank OSHC tiene dos niveles: *Essentials* y *Comprehensive*. Ambos cumplen el requisito de seguro de salud de la visa de estudiante.\n\n` +
      `• *Médico de cabecera (GP):* se paga el 100% de la tarifa MBS. Si el médico cobra más, pagas la diferencia.\n` +
      `• *Especialistas, análisis, rayos X:* al menos el 85% de la tarifa MBS fuera del hospital.\n` +
      `• *En el hospital:* 100% de la tarifa MBS de los médicos en servicios incluidos.\n` +
      `• *Recetas:* pagas $30 por medicamento y luego se aplica el beneficio hasta el límite.\n` +
      `• *Comprehensive* ofrece beneficios más amplios; compara ambos antes de elegir.\n\n` +
      `🔗 Essentials: ${URL.essentials}\n` +
      `🔗 Comprehensive: ${URL.comprehensive}\n\n` +
      `*Siguiente paso:* responde *2* para saber cómo reclamar o *5* para períodos de espera.`,
  },
  claims: {
    ids: ['13-oshc-online-claims.md', '14-general-claims.md'],
    urls: [URL.claimOnline, URL.claimForm],
    en:
      `*How to make a claim*\n` +
      `Claiming online is the fastest way — payments generally reach your bank account within 5 business days.\n\n` +
      `1. Log in to Online Member Services, or open the Online Claims Form.\n` +
      `2. Check your Australian bank account details are saved.\n` +
      `3. Enter your membership number and the service details.\n` +
      `4. Upload a clear photo of your itemised receipt or invoice.\n` +
      `5. Submit, and keep the original receipt.\n\n` +
      `💡 At a direct-billing clinic you don't need to claim at all — they bill Medibank for you.\n\n` +
      `🔗 Claim online: ${URL.claimForm}\n` +
      `🔗 Step-by-step: ${URL.claimOnline}\n\n` +
      `*Next step:* reply *3* to find a direct-billing clinic, or *HELP* for a person.`,
    'zh-CN':
      `*如何理赔*\n` +
      `在线理赔最快，款项一般在 5 个工作日内到达你的银行账户。\n\n` +
      `1. 登录 Online Member Services，或打开在线理赔表。\n` +
      `2. 确认已保存你的澳大利亚银行账户。\n` +
      `3. 填写会员号和就诊信息。\n` +
      `4. 上传清晰的明细收据或发票照片。\n` +
      `5. 提交，并保留收据原件。\n\n` +
      `💡 在直付（direct billing）诊所就诊无需自己理赔，诊所会直接向 Medibank 收费。\n\n` +
      `🔗 在线理赔：${URL.claimForm}\n` +
      `🔗 详细步骤：${URL.claimOnline}\n\n` +
      `*下一步：*回复 *3* 查找直付诊所，或回复*帮助*找人工。`,
    es:
      `*Cómo hacer un reclamo*\n` +
      `Reclamar en línea es lo más rápido: el pago suele llegar a tu cuenta bancaria en 5 días hábiles.\n\n` +
      `1. Entra en Online Member Services o abre el formulario de reclamo en línea.\n` +
      `2. Comprueba que tu cuenta bancaria australiana esté guardada.\n` +
      `3. Escribe tu número de miembro y los datos del servicio.\n` +
      `4. Sube una foto clara del recibo o factura detallada.\n` +
      `5. Envía el reclamo y guarda el recibo original.\n\n` +
      `💡 En una clínica con facturación directa no necesitas reclamar: la clínica cobra a Medibank.\n\n` +
      `🔗 Reclamo en línea: ${URL.claimForm}\n` +
      `🔗 Paso a paso: ${URL.claimOnline}\n\n` +
      `*Siguiente paso:* responde *3* para buscar una clínica con facturación directa o *AYUDA*.`,
  },
  providers: {
    ids: ['10-getting-sick-in-australia.md', '15-oshc-provider-claims.md'],
    urls: [URL.findProvider, URL.gettingSick],
    en:
      `*Finding a doctor or clinic*\n` +
      `For most health issues, start with a GP (general practitioner).\n\n` +
      `• *Direct-billing clinics* bill Medibank for you, so you usually pay little or nothing upfront.\n` +
      `• Search by suburb or postcode, then call the clinic to book.\n` +
      `• Bring your OSHC membership card or number to every visit.\n` +
      `• Need a specialist? Get a referral from your GP first.\n\n` +
      `🔗 Find a direct-billing provider: ${URL.findProvider}\n\n` +
      `Emergency? Call *000* now.\n\n` +
      `*Next step:* reply *4* for pharmacy and medicines, or *2* to claim a visit.`,
    'zh-CN':
      `*查找医生或诊所*\n` +
      `大多数健康问题请先看全科医生（GP）。\n\n` +
      `• *直付诊所*会直接向 Medibank 收费，通常你预付很少或无需预付。\n` +
      `• 按区域或邮编搜索，然后致电诊所预约。\n` +
      `• 每次就诊请携带 OSHC 会员卡或会员号。\n` +
      `• 需要看专科？请先让 GP 开转诊信。\n\n` +
      `🔗 查找直付医疗机构：${URL.findProvider}\n\n` +
      `紧急情况请立即拨打 *000*。\n\n` +
      `*下一步：*回复 *4* 了解药房和药品，或回复 *2* 了解理赔。`,
    es:
      `*Buscar un médico o clínica*\n` +
      `Para la mayoría de los problemas de salud, empieza con un médico de cabecera (GP).\n\n` +
      `• Las *clínicas con facturación directa* cobran a Medibank, así que normalmente pagas poco o nada por adelantado.\n` +
      `• Busca por barrio o código postal y llama a la clínica para reservar.\n` +
      `• Lleva tu tarjeta o número de miembro OSHC a cada visita.\n` +
      `• ¿Necesitas un especialista? Pide primero una derivación a tu GP.\n\n` +
      `🔗 Buscar proveedor con facturación directa: ${URL.findProvider}\n\n` +
      `¿Emergencia? Llama al *000* ahora.\n\n` +
      `*Siguiente paso:* responde *4* para farmacia o *2* para reclamar una visita.`,
  },
  healthcare: {
    ids: ['10-getting-sick-in-australia.md', '08-australian-healthcare.md'],
    urls: [URL.gettingSick, URL.findProvider],
    en:
      `*Feeling unwell? Here's where to go*\n` +
      `Match the place to how serious it is.\n\n` +
      `• *Life-threatening:* call *000* or go to a hospital emergency department.\n` +
      `• *Urgent but not life-threatening:* an after-hours GP or urgent care clinic.\n` +
      `• *Everyday illness:* book a GP — a direct-billing clinic keeps costs low.\n` +
      `• *Minor symptoms:* a pharmacist can advise on over-the-counter options.\n` +
      `• 24/7 Student Health and Support Line: *1800 887 283*.\n\n` +
      `🔗 Getting sick in Australia: ${URL.gettingSick}\n\n` +
      `*Next step:* reply *3* to find a clinic near you.`,
    'zh-CN':
      `*身体不适？这样选择就医地点*\n` +
      `根据严重程度选择合适的地方。\n\n` +
      `• *危及生命：*拨打 *000* 或前往医院急诊科。\n` +
      `• *紧急但不危及生命：*下班时间 GP 或急症诊所。\n` +
      `• *日常疾病：*预约 GP，直付诊所费用更低。\n` +
      `• *轻微症状：*药剂师可以推荐非处方药。\n` +
      `• 24/7 学生健康与支持热线：*1800 887 283*。\n\n` +
      `🔗 在澳大利亚生病怎么办：${URL.gettingSick}\n\n` +
      `*下一步：*回复 *3* 查找附近诊所。`,
    es:
      `*¿Te sientes mal? Dónde ir*\n` +
      `Elige el lugar según la gravedad.\n\n` +
      `• *Riesgo para la vida:* llama al *000* o ve a urgencias de un hospital.\n` +
      `• *Urgente pero sin riesgo vital:* un GP fuera de horario o una clínica de urgencias.\n` +
      `• *Enfermedad común:* reserva un GP; una clínica con facturación directa reduce costos.\n` +
      `• *Síntomas leves:* un farmacéutico puede recomendar medicamentos sin receta.\n` +
      `• Línea de salud y apoyo 24/7: *1800 887 283*.\n\n` +
      `🔗 Enfermarse en Australia: ${URL.gettingSick}\n\n` +
      `*Siguiente paso:* responde *3* para buscar una clínica cercana.`,
  },
  pharmacy: {
    ids: ['16-pharmacy-essentials.md', '17-pharmacy-comprehensive.md'],
    urls: [URL.essentials, URL.comprehensive],
    en:
      `*Pharmacy and medicines*\n` +
      `OSHC helps with eligible *prescription* medicines prescribed by a doctor.\n\n` +
      `• You pay a *$30 contribution* per eligible item first.\n` +
      `• Medibank then pays up to *$70 per item* (Essentials), within an annual limit.\n` +
      `• If the medicine costs more, you pay the difference.\n` +
      `• Over-the-counter and cosmetic medicines are not covered.\n` +
      `• Keep the pharmacy receipt to claim.\n\n` +
      `🔗 Essentials details: ${URL.essentials}\n` +
      `🔗 Comprehensive details: ${URL.comprehensive}\n\n` +
      `*Next step:* reply *2* to learn how to claim your medicine.`,
    'zh-CN':
      `*药房和药品*\n` +
      `OSHC 对医生开具的合格*处方药*提供保障。\n\n` +
      `• 每项合格药品先自付 *$30*。\n` +
      `• 之后 Medibank 每项最多支付 *$70*（Essentials），受年度上限限制。\n` +
      `• 药品费用更高时，差额由你支付。\n` +
      `• 非处方药和美容用途药品不在保障范围内。\n` +
      `• 请保留药房收据用于理赔。\n\n` +
      `🔗 Essentials 详情：${URL.essentials}\n` +
      `🔗 Comprehensive 详情：${URL.comprehensive}\n\n` +
      `*下一步：*回复 *2* 了解如何报销药费。`,
    es:
      `*Farmacia y medicamentos*\n` +
      `OSHC ayuda con medicamentos *con receta* elegibles recetados por un médico.\n\n` +
      `• Primero pagas una *contribución de $30* por medicamento elegible.\n` +
      `• Luego Medibank paga hasta *$70 por medicamento* (Essentials), con un límite anual.\n` +
      `• Si el medicamento cuesta más, pagas la diferencia.\n` +
      `• Los medicamentos sin receta y cosméticos no están cubiertos.\n` +
      `• Guarda el recibo de la farmacia para reclamar.\n\n` +
      `🔗 Detalles Essentials: ${URL.essentials}\n` +
      `🔗 Detalles Comprehensive: ${URL.comprehensive}\n\n` +
      `*Siguiente paso:* responde *2* para saber cómo reclamar tu medicamento.`,
  },
  visa: {
    ids: ['12-oshc-visa-requirements.md', '11-waiting-periods.md'],
    urls: [URL.visa, URL.waiting],
    en:
      `*Visa rules and waiting periods*\n` +
      `Student visa (subclass 500) holders must keep adequate health cover, such as OSHC, for their whole stay in Australia.\n\n` +
      `• Don't let your cover lapse — gaps can affect your visa.\n` +
      `• A *waiting period* is the time after joining before some benefits can be paid.\n` +
      `• *Pre-existing conditions:* 12 months for hospital services.\n` +
      `• You can't claim for services received while serving a waiting period.\n` +
      `• Check your cover summary for the waiting periods that apply to you.\n\n` +
      `🔗 Health cover for your visa: ${URL.visa}\n` +
      `🔗 Waiting periods: ${URL.waiting}\n\n` +
      `*Next step:* reply *1* to see what your cover includes.`,
    'zh-CN':
      `*签证要求和等待期*\n` +
      `学生签证（500 类）持有人在澳期间必须一直持有充足的医疗保险，例如 OSHC。\n\n` +
      `• 不要让保险中断，否则可能影响签证。\n` +
      `• *等待期*是投保后需要等待、某些福利才可给付的时间。\n` +
      `• *既往病症：*住院服务等待期为 12 个月。\n` +
      `• 等待期内产生的服务费用无法理赔。\n` +
      `• 请查看你的保障摘要，确认适用于你的等待期。\n\n` +
      `🔗 签证对应的医疗保险：${URL.visa}\n` +
      `🔗 等待期说明：${URL.waiting}\n\n` +
      `*下一步：*回复 *1* 查看保障范围。`,
    es:
      `*Requisitos de visa y períodos de espera*\n` +
      `Quienes tienen visa de estudiante (subclase 500) deben mantener un seguro de salud adecuado, como OSHC, durante toda su estancia en Australia.\n\n` +
      `• No dejes que tu cobertura se interrumpa; puede afectar tu visa.\n` +
      `• Un *período de espera* es el tiempo después de contratar antes de poder recibir algunos beneficios.\n` +
      `• *Condiciones preexistentes:* 12 meses para servicios hospitalarios.\n` +
      `• No puedes reclamar servicios recibidos durante un período de espera.\n` +
      `• Revisa tu resumen de cobertura para ver los períodos que te aplican.\n\n` +
      `🔗 Seguro para tu visa: ${URL.visa}\n` +
      `🔗 Períodos de espera: ${URL.waiting}\n\n` +
      `*Siguiente paso:* responde *1* para ver qué incluye tu cobertura.`,
  },
  forms: {
    ids: ['19-forms-and-brochures.md', '04-oshc-member-guide.md'],
    urls: [URL.forms, URL.memberGuide],
    en:
      `*Forms and member guides*\n` +
      `Most things can be done online, but here are the official documents.\n\n` +
      `• *Claims:* use the Online Claims Form — it's faster than paper.\n` +
      `• *Member Guide:* your full cover terms and how to use OSHC.\n` +
      `• *Brochures and forms:* cover summaries and other paperwork.\n\n` +
      `🔗 Online claim: ${URL.claimForm}\n` +
      `🔗 Member Guide (PDF): ${URL.memberGuide}\n` +
      `🔗 All forms: ${URL.forms}\n\n` +
      `*Next step:* reply *2* for step-by-step claim help.`,
    'zh-CN':
      `*表格和会员指南*\n` +
      `大多数事项都可在线完成，以下是官方文件。\n\n` +
      `• *理赔：*使用在线理赔表，比纸质表格更快。\n` +
      `• *会员指南：*完整保障条款及 OSHC 使用方法。\n` +
      `• *手册和表格：*保障摘要及其他文件。\n\n` +
      `🔗 在线理赔：${URL.claimForm}\n` +
      `🔗 会员指南（PDF）：${URL.memberGuide}\n` +
      `🔗 全部表格：${URL.forms}\n\n` +
      `*下一步：*回复 *2* 获取理赔步骤。`,
    es:
      `*Formularios y guías*\n` +
      `Casi todo se puede hacer en línea, pero aquí están los documentos oficiales.\n\n` +
      `• *Reclamos:* usa el formulario en línea; es más rápido que en papel.\n` +
      `• *Guía del miembro:* todas las condiciones de tu cobertura y cómo usar OSHC.\n` +
      `• *Folletos y formularios:* resúmenes de cobertura y otros documentos.\n\n` +
      `🔗 Reclamo en línea: ${URL.claimForm}\n` +
      `🔗 Guía del miembro (PDF): ${URL.memberGuide}\n` +
      `🔗 Todos los formularios: ${URL.forms}\n\n` +
      `*Siguiente paso:* responde *2* para ayuda paso a paso con un reclamo.`,
  },
};

const INTENT_TO_GUIDE: Partial<Record<Intent, GuideKey>> = {
  coverage: 'coverage',
  claims: 'claims',
  reimbursements: 'claims',
  providers: 'providers',
  healthcare_navigation: 'healthcare',
  pharmacy: 'pharmacy',
  medicines: 'pharmacy',
  visa_compliance: 'visa',
  waiting_periods: 'visa',
  forms_and_guides: 'forms',
};

export function hasTopicGuide(intent: Intent): boolean {
  return Boolean(INTENT_TO_GUIDE[intent]);
}

/** A complete, well-formed overview for a menu topic, or null if none exists. */
export function topicGuide(intent: Intent, language: SupportedLanguage = 'en'): AssistantAnswer | null {
  const key = INTENT_TO_GUIDE[intent];
  if (!key) return null;
  const guide = GUIDES[key];
  return {
    // Large cap: guides are hand-sized; never truncate mid-list.
    text: formatWhatsAppAnswer(guide[language] || guide.en, { maxChars: 1500 }),
    intent,
    language,
    sourceIds: guide.ids,
    sourceUrls: guide.urls,
    usedLlm: false,
  };
}

export type { Guide };
