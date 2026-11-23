import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const allowedOrigin = "https://morttiss.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin",
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

function text(value: unknown, maxLength: number, required = false): string | null {
  if (typeof value !== "string") return required ? null : null;
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!cleaned) return required ? null : null;
  if (cleaned.length > maxLength) return null;
  return cleaned;
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date <= new Date();
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin !== allowedOrigin) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 24_000) return json({ error: "Formulário muito grande." }, 413);

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Dados inválidos." }, 400);
  }

  if (typeof input.website === "string" && input.website.trim()) return json({ ok: true });
  if (typeof input.startedAt !== "number" || Date.now() - input.startedAt < 2_500) {
    return json({ error: "Não foi possível validar o formulário." }, 400);
  }

  const childName = text(input.childName, 140, true);
  const guardianName = text(input.guardianName, 140, true);
  const guardianRelation = text(input.guardianRelation, 60, true);
  const guardianPhone = text(input.guardianPhone, 30, true);
  const alternatePhone = text(input.alternatePhone, 30);
  const guardianEmail = text(input.guardianEmail, 254);
  const school = text(input.school, 180);
  const schoolShift = text(input.schoolShift, 40);
  const authorizedPickup = text(input.authorizedPickup, 1_000);
  const preferredDays = text(input.preferredDays, 120);
  const learningGoals = text(input.learningGoals, 1_000);
  const supportNeeds = text(input.supportNeeds, 1_500);
  const allergies = text(input.allergies, 1_500);
  const notes = text(input.notes, 1_500);
  const periodMap: Record<string, string> = {
    matutino: "matutino",
    vespertino: "vespertino",
    flexivel: "flexivel",
  };
  const grade = Number(input.grade);
  const desiredPeriod = typeof input.desiredPeriod === "string" ? periodMap[input.desiredPeriod] : null;
  const phoneDigits = guardianPhone?.replace(/\D/g, "") ?? "";
  const alternateDigits = alternatePhone?.replace(/\D/g, "") ?? "";
  const hasHealthDetails = Boolean(supportNeeds || allergies);

  if (
    !childName || childName.length < 2 || !guardianName || guardianName.length < 2 ||
    !guardianRelation || !guardianPhone || phoneDigits.length < 10 || phoneDigits.length > 15 ||
    (alternatePhone && (alternateDigits.length < 10 || alternateDigits.length > 15)) ||
    (guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)) ||
    !isDateOnly(input.birthDate) || !Number.isInteger(grade) || grade < 1 || grade > 5 ||
    !desiredPeriod || input.guardianConsent !== true ||
    (hasHealthDetails && input.healthDataConsent !== true) ||
    typeof input.consentVersion !== "string" || input.consentVersion.length > 40
  ) return json({ error: "Confira os campos obrigatórios e as autorizações." }, 400);

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("cf-connecting-ip")?.trim()
    ?? request.headers.get("x-real-ip")?.trim();
  if (!forwarded) return json({ error: "Não foi possível validar a conexão. Tente novamente." }, 400);

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: allowed, error: rateError } = await client.rpc("consume_pre_matricula_rate_limit", {
    p_ip_hash: await sha256(forwarded),
  });
  if (rateError) return json({ error: "O formulário está temporariamente indisponível." }, 503);
  if (allowed !== true) return json({ error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }, 429);

  const { error: insertError } = await client.from("student_enrollments").insert({
    child_name: childName,
    birth_date: input.birthDate,
    grade,
    school,
    school_shift: schoolShift,
    guardian_name: guardianName,
    guardian_relation: guardianRelation,
    guardian_phone: guardianPhone,
    alternate_phone: alternatePhone,
    guardian_email: guardianEmail,
    authorized_pickup: authorizedPickup,
    preferred_days: preferredDays,
    desired_period: desiredPeriod,
    learning_goals: learningGoals,
    support_needs: supportNeeds,
    allergies,
    notes,
    guardian_consent: true,
    health_data_consent: input.healthDataConsent === true,
    consent_version: text(input.consentVersion, 40, true),
  });

  if (insertError) return json({ error: "Não foi possível salvar a pré-matrícula." }, 503);
  return json({ ok: true }, 201);
});
