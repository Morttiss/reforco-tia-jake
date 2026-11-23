import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin = "https://morttiss.github.io";
const maxBodyBytes = 24_000;
const consentVersion = "2026-11-23-90d-v1";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin",
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!cleaned || cleaned.length > maxLength) return null;
  return cleaned;
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date <= new Date();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function hashClientIp(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readJsonBounded(request: Request): Promise<Record<string, unknown> | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin !== allowedOrigin) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return json({ error: "Formato inválido." }, 415);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    return json({ error: "Formulário muito grande." }, 413);
  }

  // Supabase's Cloudflare ingress supplies this client-IP header. Do not trust
  // a caller-provided X-Forwarded-For value as the rate-limit identity.
  const clientIp = request.headers.get("cf-connecting-ip")?.trim();
  if (!clientIp || clientIp.length > 64 || /[,\s]/.test(clientIp)) {
    return json({ error: "Não foi possível validar a conexão. Tente novamente." }, 400);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceKey || !supabaseUrl) return json({ error: "O formulário está temporariamente indisponível." }, 503);

  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: allowed, error: rateError } = await client.rpc("consume_pre_matricula_rate_limit", {
    p_ip_hash: await hashClientIp(clientIp, serviceKey),
  });
  if (rateError) return json({ error: "O formulário está temporariamente indisponível." }, 503);
  if (allowed !== true) return json({ error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }, 429);

  const input = await readJsonBounded(request);
  if (!input) return json({ error: "Dados inválidos ou formulário muito grande." }, 400);

  if (typeof input.website !== "string" || input.website.trim()) return json({ ok: true });
  if (
    typeof input.startedAt !== "number" || !Number.isFinite(input.startedAt) ||
    input.startedAt > Date.now() || Date.now() - input.startedAt < 2_500
  ) return json({ error: "Não foi possível validar o formulário." }, 400);

  const childName = text(input.childName, 140);
  const guardianName = text(input.guardianName, 140);
  const guardianRelation = text(input.guardianRelation, 60);
  const guardianPhone = text(input.guardianPhone, 30);
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
  const relationOptions = new Set(["Mãe", "Pai", "Avó/Avô", "Responsável legal", "Outro familiar"]);
  const shiftOptions = new Set([null, "Matutino", "Vespertino", "Integral", "Outro"]);
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
    !guardianRelation || !relationOptions.has(guardianRelation) || !guardianPhone ||
    phoneDigits.length < 10 || phoneDigits.length > 15 ||
    (alternatePhone && (alternateDigits.length < 10 || alternateDigits.length > 15)) ||
    (guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)) ||
    !isDateOnly(input.birthDate) || !Number.isInteger(grade) || grade < 1 || grade > 5 ||
    !shiftOptions.has(schoolShift) || !desiredPeriod || input.guardianConsent !== true ||
    (hasHealthDetails && input.healthDataConsent !== true) || input.consentVersion !== consentVersion
  ) return json({ error: "Confira os campos obrigatórios e as autorizações." }, 400);

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
    consent_version: consentVersion,
  });

  if (insertError) return json({ error: "Não foi possível salvar a pré-matrícula." }, 503);
  return json({ ok: true }, 201);
});
